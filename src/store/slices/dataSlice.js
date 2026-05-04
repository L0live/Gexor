/**
 * dataSlice — Async data loading from SPARQL endpoints (Wikidata)
 *
 * Replaces the old monolithic JSON loader. Data is now fetched on demand
 * from public SPARQL endpoints and cached in memory + IndexedDB.
 */
import { searchEntities, fetchNeighbors, fetchEntityExpand, fetchIncomingAggregates, fetchAggregateChildren, fetchSimilarByProperties } from '../../services/queries/wikidata';
import * as cache from '../../services/cacheService';
import { enqueue as prefetchEnqueue, dequeue as prefetchDequeue } from '../../services/prefetchQueue';
import { DEFAULT_EXPLORATION_DIRECTION, EXPLORATION_DIRECTIONS, defaultNodeSettings } from '../../constants/graphConstants';
import { resolveContext } from '../../services/contextResolver';
import { createAggregateNode } from '../../models/lodNode';
import { mapLodNodeToGraphNode } from '../utils';
import { getVisibleUris, cleanOrphanedEdges } from '../visibilityHelpers';
import { handleApiError } from '../../utils/errorHandler';

/**
 * Enregistre un parent dans la structure loadedBy multi-parents.
 * loadedBy[child] = null    → racine indépendante, jamais modifiée
 * loadedBy[child] = [p1..]  → liste dédupliquée de parents
 */
const _addParent = (loadedByMap, childUri, parentUri) => {
  const current = loadedByMap[childUri];
  if (current === null) return;            // racine — on ne touche pas
  if (!current) {
    loadedByMap[childUri] = [parentUri];
  } else if (!current.includes(parentUri)) {
    loadedByMap[childUri] = [...current, parentUri];
  }
};

/**
 * Enregistre la direction (incoming/outgoing/shared) via laquelle un enfant a été chargé par un parent.
 * loadedByDirection[child][parent] = [dir1, dir2, ...]
 * Crée toujours de nouveaux objets pour éviter la mutation de l'état précédent.
 */
const _addDirectionSource = (dirMap, childUri, parentUri, direction) => {
  const existing = dirMap[childUri];
  const parentDirs = existing ? (existing[parentUri] || []) : [];
  if (parentDirs.includes(direction)) return;
  dirMap[childUri] = { ...(existing || {}), [parentUri]: [...parentDirs, direction] };
};

export const createDataSlice = (set, get) => ({
  // ── Loaded data cache (in-memory) ────────────────────────────────────────
  loadedNodes: {},          // { [uri]: LodNode }
  loadedRelations: {},      // { [edgeId]: LodEdge }
  outgoingDisplayRelations: {}, // { [edgeId]: LodEdge } — on-demand outgoing edges for display only (not traversed by BFS)
  loadedAggregates: {},     // { [aggregateId]: AggregateNode }
  loadedBy: {},             // { [childUri]: string[] | null }  // null = racine indépendante
  loadedByDirection: {},    // { [childUri]: { [parentUri]: string[] } }  // directions ayant chargé l'enfant

  // ── Loading state ────────────────────────────────────────────────────────
  loadingUris: new Set(),   // URIs currently being fetched
  failedUris: new Set(),    // URIs that failed to load
  expandedUris: new Set(),  // URIs whose outgoing neighbors have been fully fetched
  incomingExpandedUris: new Set(), // URIs whose incoming neighbors have been fully fetched
  sharedExpandedUris: new Set(),   // URIs dont les similaires ont été chargés via _fetchSharedNeighbors
  emptyIncomingUris: new Set(), // URIs with zero incoming references
  outgoingFetchedUris: new Set(), // URIs whose outgoing properties have been fetched (on-demand, for display only)
  initLoading: false,       // True when initFromEntity is in progress
  initError: null,          // Error message if initFromEntity failed

  // ── Per-node settings ────────────────────────────────────────────────────
  /** @type {Object.<string, import('../../constants/graphConstants').NodeSettings>} */
  nodeSettings: {},         // { [uri]: { explorationDirection, renderMode, radialStrength, explored, ... } }
  recentlyAddedNodes: {},   // { [uri]: timestamp } — for pulse animation on add-to-graph

  // ── Discovery ────────────────────────────────────────────────────────────
  allDiscoveredTypes: new Set(),  // All rdf:type Q-IDs seen so far

  // ── Search ───────────────────────────────────────────────────────────────
  searchResults: [],        // Results from searchEntities()
  searchLoading: false,

  // ── SPARQL status ────────────────────────────────────────────────────────
  sparqlRequestCount: 0,    // Number of active requests (for UI indicator)

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Restores a previously exported exploration session.
   */
  loadSession: (sessionData) => {
    // Session parsing and loading is partly handled externally, 
    // but the final graph update must be triggered here.
    setTimeout(() => {
      get().updateGraphData();
      // Wait for React / Three to mount instances, then notify layout worker.
      setTimeout(() => {
        const state = get();
        if (state.layoutInstance && state.layoutInstance.postMessage) {
          state.layoutInstance.postMessage({
            type: 'restorePositions',
            positions: sessionData.positions || {},
            pinnedNodes: Array.from(state.pinnedNodes || []),
          });
        }
      }, 500);
    }, 50);
  },

  /**
   * Search Wikidata for entities matching text.
   * Results are stored in searchResults for the UI to display.
   */
  searchWikidata: async (text, lang = 'fr') => {
    if (!text || text.trim().length < 2) {
      set({ searchResults: [], searchLoading: false });
      return [];
    }

    set({ searchLoading: true });
    try {
      const results = await searchEntities(text, lang, 15);
      set({ searchResults: results, searchLoading: false });
      return results;
    } catch (err) {
      console.error('[dataSlice] Search failed:', err);
      set({ searchResults: [], searchLoading: false });
      return [];
    }
  },

  /**
   * Fetch a single entity and its direct neighbors from Wikidata.
   * Triggered by the "Explorer" button in NodeDetailPanel.
   *
   * @param {string} uri — Wikidata entity URI
   * @param {{ force?: boolean }} [options]
   *   force=true: re-fetch even if already explored
   */
  fetchAndExpandNode: async (uri, options = {}) => {
    const { force = false } = options;
    const state = get();
    const settings = state.nodeSettings[uri];
    if (!settings) return;
    if (settings.explored && !force) return;
    if (state.loadingUris.has(uri)) return;

    const nodeDir = settings.explorationDirection ?? DEFAULT_EXPLORATION_DIRECTION;
    const dirParts = nodeDir === 'both'
      ? new Set(['incoming', 'outgoing'])
      : new Set((nodeDir || '').split(',').filter(Boolean));

    const hasShared = dirParts.has('shared');
    const hasOutgoing = dirParts.has('outgoing');
    const hasIncoming = dirParts.has('incoming');
    const nothingActive = !hasShared && !hasOutgoing && !hasIncoming;

    // ── Purge intelligente par direction ─────────────────────────────────
    // Pour chaque enfant de ce nœud, on conserve ceux dont la direction
    // d'origine est encore active. Si pas d'info (session legacy), on conserve.
    if (force) {
      const { loadedBy, loadedByDirection: lbd, pinnedNodes, nodeSettings: ns, loadedAggregates } = get();
      const orphans = new Set();

      for (const [childUri, parents] of Object.entries(loadedBy)) {
        if (parents === null) continue;
        if (!Array.isArray(parents) || !parents.includes(uri)) continue;
        if (pinnedNodes.has(childUri)) continue;

        const childDirs = (lbd[childUri] || {})[uri] ?? [];
        // Pas de tracking (session legacy) → conserver
        if (childDirs.length === 0) continue;
        // Direction encore active → conserver
        if (childDirs.some(d => dirParts.has(d))) continue;

        // Vérifier si un autre parent actif fournit encore cet enfant
        const hasOtherActiveParent = parents.some(p => {
          if (p === uri || !ns[p]) return false;
          const pDir = ns[p]?.explorationDirection ?? DEFAULT_EXPLORATION_DIRECTION;
          const pDirSet = pDir === 'both'
            ? new Set(['incoming', 'outgoing'])
            : new Set((pDir || '').split(',').filter(Boolean));
          const pDirs = (lbd[childUri] || {})[p] ?? [];
          return pDirs.some(d => pDirSet.has(d));
        });
        if (!hasOtherActiveParent) orphans.add(childUri);
      }

      if (orphans.size > 0) {
        const newNodeSettings = { ...ns };
        for (const orphan of orphans) delete newNodeSettings[orphan];
        const newLoadedBy = Object.fromEntries(Object.entries(loadedBy).filter(([c]) => !orphans.has(c)));
        const newLoadedByDirection = Object.fromEntries(Object.entries(lbd).filter(([c]) => !orphans.has(c)));
        const newLoadedAggregates = Object.fromEntries(Object.entries(loadedAggregates).filter(([id]) => !orphans.has(id)));
        const cleanedRelations = cleanOrphanedEdges(get().loadedRelations, getVisibleUris(newNodeSettings));
        set({ nodeSettings: newNodeSettings, loadedBy: newLoadedBy, loadedByDirection: newLoadedByDirection, loadedAggregates: newLoadedAggregates, loadedRelations: cleanedRelations });
        get().updateGraphData();
      }
    }

    if (nothingActive) return;

    if (hasShared) {
      get()._fetchSharedNeighbors(uri);
      if (!hasOutgoing && !hasIncoming) return;
    }

    const outgoingAlreadyDone = !force && get().expandedUris.has(uri) && !get().failedUris.has(uri);
    const incomingAlreadyDone = !force && get().incomingExpandedUris.has(uri);
    const needsOutgoing = hasOutgoing && !outgoingAlreadyDone;
    const needsIncoming = hasIncoming && !incomingAlreadyDone;

    if (!needsOutgoing && !needsIncoming) return;

    set(s => ({
      loadingUris: new Set([...s.loadingUris, uri]),
      sparqlRequestCount: s.sparqlRequestCount + 1,
    }));

    // ── Helper : applique des nodes/edges sortants dans le store ─────────
    const applyOutgoing = (nodesArr, edgesArr) => {
      const s = get();
      const newLoadedNodes = { ...s.loadedNodes };
      const newLoadedRelations = { ...s.loadedRelations };
      const newLoadedBy = { ...s.loadedBy };
      const newLoadedByDirection = { ...s.loadedByDirection };
      const newNodeSettings = { ...s.nodeSettings };
      const newDiscoveredTypes = new Set(s.allDiscoveredTypes);
      for (const n of nodesArr) {
        const isNew = !newLoadedNodes[n.uri];
        if (isNew) newLoadedNodes[n.uri] = n;
        (n.types || []).forEach(t => newDiscoveredTypes.add(t));
        if (isNew) prefetchEnqueue(n.uri);
        _addParent(newLoadedBy, n.uri, uri);
        _addDirectionSource(newLoadedByDirection, n.uri, uri, 'outgoing');
        if (!newNodeSettings[n.uri]) newNodeSettings[n.uri] = defaultNodeSettings();
      }
      for (const e of edgesArr) newLoadedRelations[e.id] = e;
      set({ loadedNodes: newLoadedNodes, loadedRelations: newLoadedRelations, loadedBy: newLoadedBy, loadedByDirection: newLoadedByDirection, nodeSettings: newNodeSettings, allDiscoveredTypes: newDiscoveredTypes });
    };

    // ── Helper : traite et applique les agrégats entrants (progressif) ───────
    const applyIncoming = async (aggregatesArr) => {
      const AGGREGATE_THRESHOLD = get().aggregateParams?.threshold ?? 5;
      const WD_PREFIX = 'http://www.wikidata.org/entity/';
      const qid = uri.replace(WD_PREFIX, '');

      if (!aggregatesArr || aggregatesArr.length === 0) {
        set(s => ({ emptyIncomingUris: new Set([...s.emptyIncomingUris, uri]) }));
        return;
      }

      const makeEdge = (agg, aggId) => ({
        id: `${uri}-${agg.predicate}-${aggId}`,
        source: aggId, target: uri,
        predicate: agg.predicate, label: agg.predicateLabel,
        sources: [], rank: 'normal', referenceCount: 0,
        classification: 'aggregate', redundancyGroup: null,
        tier: 'aggregate', direction: 'incoming',
        contextPromoted: false, weight: 50, aggregateCount: agg.count,
      });

      for (const agg of aggregatesArr) {
        // Lire l'état frais à chaque itération (un set() a pu être appelé entre deux awaits)
        const s = get();
        const aggId = `agg:${qid}:${agg.predicate}`;
        if (s.loadedAggregates[aggId]) continue;

        if (agg.count <= AGGREGATE_THRESHOLD) {
          try {
            const childrenData = await fetchAggregateChildren(uri, agg.predicate, agg.count + 5);
            // Relire l'état après l'await
            const s2 = get();
            const newLoadedNodes = { ...s2.loadedNodes };
            const newLoadedRelations = { ...s2.loadedRelations };
            const newLoadedBy = { ...s2.loadedBy };
            const newLoadedByDirection = { ...s2.loadedByDirection };
            const newNodeSettings = { ...s2.nodeSettings };
            const newDiscoveredTypes = new Set(s2.allDiscoveredTypes);
            const newIncomingEdgeIds = new Set(s2.incomingEdgeIds);
            for (const n of childrenData.nodes) {
              const isNew = !newLoadedNodes[n.uri];
              if (isNew) newLoadedNodes[n.uri] = n;
              (n.types || []).forEach(t => newDiscoveredTypes.add(t));
              if (isNew) prefetchEnqueue(n.uri);
              _addParent(newLoadedBy, n.uri, uri);
              _addDirectionSource(newLoadedByDirection, n.uri, uri, 'incoming');
              if (!newNodeSettings[n.uri]) newNodeSettings[n.uri] = defaultNodeSettings();
            }
            for (const e of childrenData.edges) {
              newLoadedRelations[e.id] = e;
              newIncomingEdgeIds.add(e.id);
            }
            set({ loadedNodes: newLoadedNodes, loadedRelations: newLoadedRelations, loadedBy: newLoadedBy, loadedByDirection: newLoadedByDirection, nodeSettings: newNodeSettings, allDiscoveredTypes: newDiscoveredTypes, incomingEdgeIds: newIncomingEdgeIds });
            get().updateGraphData();
          } catch (err) {
            handleApiError(err, `autoExpandAggregate ${aggId}`);
            // Fallback : créer un nœud agrégat
            const s3 = get();
            const aggNode = createAggregateNode({ id: aggId, sourceUri: uri, predicate: agg.predicate, predicateLabel: agg.predicateLabel, targetClasses: agg.targetClasses, targetClassLabels: agg.targetClassLabels, count: agg.count });
            const edge = makeEdge(agg, aggId);
            const newLoadedBy3 = { ...s3.loadedBy };
            const newLoadedByDirection3 = { ...s3.loadedByDirection };
            _addParent(newLoadedBy3, aggId, uri);
            _addDirectionSource(newLoadedByDirection3, aggId, uri, 'incoming');
            set({
              loadedAggregates: { ...s3.loadedAggregates, [aggId]: aggNode },
              loadedNodes: { ...s3.loadedNodes, [aggId]: aggNode },
              loadedRelations: { ...s3.loadedRelations, [edge.id]: edge },
              loadedBy: newLoadedBy3,
              loadedByDirection: newLoadedByDirection3,
              nodeSettings: { ...s3.nodeSettings, ...(s3.nodeSettings[aggId] ? {} : { [aggId]: defaultNodeSettings() }) },
              incomingEdgeIds: new Set([...s3.incomingEdgeIds, edge.id]),
            });
            get().updateGraphData();
          }
        } else {
          const aggNode = createAggregateNode({ id: aggId, sourceUri: uri, predicate: agg.predicate, predicateLabel: agg.predicateLabel, targetClasses: agg.targetClasses, targetClassLabels: agg.targetClassLabels, count: agg.count });
          const edge = makeEdge(agg, aggId);
          const newLoadedBy2 = { ...s.loadedBy };
          const newLoadedByDirection2 = { ...s.loadedByDirection };
          _addParent(newLoadedBy2, aggId, uri);
          _addDirectionSource(newLoadedByDirection2, aggId, uri, 'incoming');
          set({
            loadedAggregates: { ...s.loadedAggregates, [aggId]: aggNode },
            loadedNodes: { ...s.loadedNodes, [aggId]: aggNode },
            loadedRelations: { ...s.loadedRelations, [edge.id]: edge },
            loadedBy: newLoadedBy2,
            loadedByDirection: newLoadedByDirection2,
            nodeSettings: { ...s.nodeSettings, ...(s.nodeSettings[aggId] ? {} : { [aggId]: defaultNodeSettings() }) },
            incomingEdgeIds: new Set([...s.incomingEdgeIds, edge.id]),
          });
          get().updateGraphData();
        }
      }
    };

    try {
      const cacheKeyNode = cache.cacheKey('wikidata', `node:${uri}`);
      let lodNode = await cache.get(cacheKeyNode);
      let expandResult = null;

      // ── 1. Charger le node principal ──────────────────────────────────────
      if (!lodNode) {
        expandResult = await fetchEntityExpand(uri, 'outgoing', 50);
        lodNode = expandResult.node;
        await cache.set(cacheKeyNode, lodNode, 'wikidata');
      }

      // Stocker le node principal immédiatement
      {
        const s = get();
        const newDiscoveredTypes = new Set(s.allDiscoveredTypes);
        (lodNode.types || []).forEach(t => newDiscoveredTypes.add(t));
        set({ loadedNodes: { ...s.loadedNodes, [uri]: lodNode }, allDiscoveredTypes: newDiscoveredTypes });
      }

      // ── 2. Sortants : cache → affichage → API si besoin ──────────────────
      if (needsOutgoing) {
        const cacheKeyNeighbors = cache.cacheKey('wikidata', `neighbors:${uri}`);
        const cachedNeighbors = await cache.get(cacheKeyNeighbors);
        let outgoingHandled = false;

        if (cachedNeighbors?.nodes?.length > 0) {
          applyOutgoing(cachedNeighbors.nodes, cachedNeighbors.edges || []);
          get().updateGraphData();
          outgoingHandled = true;
        }

        if (!outgoingHandled) {
          let outgoingNodes, outgoingEdges;
          if (expandResult) {
            const allNeighborEdges = expandResult.neighbors?.edges || [];
            const incomingIdSet = new Set(expandResult.neighbors?.incomingEdgeIds || []);
            outgoingNodes = expandResult.neighbors?.nodes || [];
            outgoingEdges = allNeighborEdges.filter(e => !incomingIdSet.has(e.id));
            if (incomingIdSet.size > 0) {
              const newIncomingEdgeIds = new Set(get().incomingEdgeIds);
              for (const id of incomingIdSet) newIncomingEdgeIds.add(id);
              set({ incomingEdgeIds: newIncomingEdgeIds });
            }
            await cache.set(cacheKeyNeighbors, { nodes: outgoingNodes, edges: outgoingEdges }, 'wikidata');
          } else {
            const neighborsData = await fetchNeighbors(uri, 50);
            outgoingNodes = neighborsData.nodes;
            outgoingEdges = neighborsData.edges;
            await cache.set(cacheKeyNeighbors, neighborsData, 'wikidata');
          }
          applyOutgoing(outgoingNodes, outgoingEdges);
          get().updateGraphData();
        }
      }

      // ── 3. Entrants : cache → affichage → API si besoin ──────────────────
      if (needsIncoming) {
        const cacheKeyIncoming = cache.cacheKey('wikidata', `incoming-aggregates:${uri}`);
        const cachedIncoming = await cache.get(cacheKeyIncoming);
        let incomingHandled = false;

        if (cachedIncoming?.aggregates?.length > 0) {
          await applyIncoming(cachedIncoming.aggregates);
          get().updateGraphData();
          incomingHandled = true;
        }

        if (!incomingHandled) {
          try {
            const incomingData = await fetchIncomingAggregates(uri, 100);
            await cache.set(cacheKeyIncoming, incomingData, 'wikidata');
            await applyIncoming(incomingData.aggregates || []);
            get().updateGraphData();
          } catch (aggErr) {
            handleApiError(aggErr, `fetchIncomingAggregates ${uri}`);
          }
        }
      }

      // ── 4. Finalisation ───────────────────────────────────────────────────
      const newLoadingUris = new Set(get().loadingUris);
      newLoadingUris.delete(uri);
      const newFailedUris = new Set(get().failedUris);
      newFailedUris.delete(uri);
      const newExpandedUris = new Set(get().expandedUris);
      if (needsOutgoing) newExpandedUris.add(uri);
      const newIncomingExpandedUris = new Set(get().incomingExpandedUris);
      if (needsIncoming) newIncomingExpandedUris.add(uri);

      set({
        loadingUris: newLoadingUris,
        failedUris: newFailedUris,
        expandedUris: newExpandedUris,
        incomingExpandedUris: newIncomingExpandedUris,
        sparqlRequestCount: Math.max(0, get().sparqlRequestCount - 1),
      });

      if (lodNode?.types?.length > 0) resolveContext(lodNode.types, lodNode.properties);
      get().setNodeExplored(uri);
      get().updateGraphData();

    } catch (err) {
      handleApiError(err, `fetchAndExpandNode ${uri}`);
      const newLoadingUris = new Set(get().loadingUris);
      newLoadingUris.delete(uri);
      const newFailedUris = new Set(get().failedUris);
      newFailedUris.add(uri);
      set({
        loadingUris: newLoadingUris,
        failedUris: newFailedUris,
        sparqlRequestCount: Math.max(0, get().sparqlRequestCount - 1),
      });
      throw err;
    }
  },

  /**
   * Fetch multiple URIs in parallel (respecting concurrency limits).
   */
  fetchBatch: async (uris) => {
    const state = get();
    const toFetch = uris.filter(uri =>
      !state.loadedNodes[uri] && !state.loadingUris.has(uri)
    );
    // Process in small batches to avoid rate-limiting
    const BATCH_SIZE = 3;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batch = toFetch.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(uri => get().fetchAndExpandNode(uri)));
    }
  },

  /**
   * Expand an aggregate node: fetch individual children and add them to the graph.
   * The aggregate node gets marked as expanded (hidden from graph), children take its place.
   *
   * @param {string} aggregateId — Synthetic ID (e.g. 'agg:Q517:P921:Q13442814')
   */
  expandAggregate: async (aggregateId) => {
    const aggNode = get().loadedAggregates[aggregateId];
    if (!aggNode) {
      console.warn(`[dataSlice] Aggregate not found: ${aggregateId}`);
      return;
    }
    if (aggNode.loadingChildren) return;

    // Mark as loading
    const updatedAggregates = { ...get().loadedAggregates };
    updatedAggregates[aggregateId] = { ...aggNode, loadingChildren: true };
    set({ loadedAggregates: updatedAggregates });

    try {
      const maxChildren = aggNode.count > 30 ? 50 : aggNode.count + 5;
      const childrenData = await fetchAggregateChildren(
        aggNode.sourceUri,
        aggNode.predicate,
        maxChildren
      );

      // Phase 1 : ajouter les enfants un par un (l'agrégat reste visible pendant ce temps)
      const childUris = [];
      for (const node of childrenData.nodes) {
        childUris.push(node.uri);
        const edge = childrenData.edges.find(e => e.source === node.uri || e.target === node.uri);
        const s = get();
        const newLoadedBy = { ...s.loadedBy };
        const newLoadedByDirection = { ...s.loadedByDirection };
        _addParent(newLoadedBy, node.uri, aggNode.sourceUri);
        _addDirectionSource(newLoadedByDirection, node.uri, aggNode.sourceUri, 'incoming');
        set({
          loadedNodes: s.loadedNodes[node.uri]
            ? s.loadedNodes
            : (() => { prefetchEnqueue(node.uri); return { ...s.loadedNodes, [node.uri]: node }; })(),
          loadedRelations: edge ? { ...s.loadedRelations, [edge.id]: edge } : s.loadedRelations,
          nodeSettings: s.nodeSettings[node.uri] ? s.nodeSettings : { ...s.nodeSettings, [node.uri]: defaultNodeSettings() },
          loadedBy: newLoadedBy,
          loadedByDirection: newLoadedByDirection,
          incomingEdgeIds: edge ? new Set([...s.incomingEdgeIds, edge.id]) : s.incomingEdgeIds,
        });
        get().updateGraphData();
      }

      // Phase 2 : supprimer l'agrégat et le marquer comme expanded
      const aggEdgeId = `${aggNode.sourceUri}-${aggNode.predicate}-${aggregateId}`;
      const s2 = get();
      const newLoadedNodes2 = { ...s2.loadedNodes };
      const newLoadedRelations2 = { ...s2.loadedRelations };
      const newNodeSettings2 = { ...s2.nodeSettings };
      delete newLoadedNodes2[aggregateId];
      delete newNodeSettings2[aggregateId];
      delete newLoadedRelations2[aggEdgeId];

      const finalAggregates = { ...s2.loadedAggregates };
      finalAggregates[aggregateId] = {
        ...aggNode,
        expanded: true,
        collapsed: false,
        loadingChildren: false,
        children: childUris,
      };

      set({
        loadedNodes: newLoadedNodes2,
        loadedRelations: newLoadedRelations2,
        loadedAggregates: finalAggregates,
        nodeSettings: newNodeSettings2,
      });

      get().updateGraphData();
      get().saveToHistory();
    } catch (err) {
      console.error(`[dataSlice] Failed to expand aggregate ${aggregateId}:`, err);
      const failAggregates = { ...get().loadedAggregates };
      failAggregates[aggregateId] = { ...aggNode, loadingChildren: false };
      set({ loadedAggregates: failAggregates });
    }
  },

  /**
   * Collapse an expanded aggregate: remove children from graph, re-show the aggregate node.
   *
   * @param {string} aggregateId
   */
  collapseAggregate: (aggregateId) => {
    const aggNode = get().loadedAggregates[aggregateId];
    if (!aggNode || !aggNode.expanded) return;

    const newLoadedNodes = { ...get().loadedNodes };
    const newLoadedRelations = { ...get().loadedRelations };
    const newNodeSettings = { ...get().nodeSettings };
    const newLoadedBy = { ...get().loadedBy };
    const newLoadedByDirection = { ...get().loadedByDirection };

    // Remove children nodes, their edges, nodeSettings, and loadedBy entries
    for (const childUri of (aggNode.children || [])) {
      const hasOtherEdges = Object.values(newLoadedRelations).some(
        e => (e.source === childUri || e.target === childUri) &&
             !(e.source === childUri && e.target === aggNode.sourceUri && e.predicate === aggNode.predicate)
      );
      if (!hasOtherEdges) {
        delete newLoadedNodes[childUri];
        delete newNodeSettings[childUri];
        delete newLoadedBy[childUri];
        delete newLoadedByDirection[childUri];
      } else {
        // Conserver le nœud mais retirer aggNode.sourceUri de ses parents
        const parents = newLoadedBy[childUri];
        if (Array.isArray(parents)) {
          const filtered = parents.filter(p => p !== aggNode.sourceUri);
          newLoadedBy[childUri] = filtered.length > 0 ? filtered : null;
        }
      }
      // Remove the incoming edge from child to source
      const edgeId = `${childUri}-${aggNode.predicate}-${aggNode.sourceUri}`;
      delete newLoadedRelations[edgeId];
    }

    // Re-add aggregate node to loadedNodes + nodeSettings
    const collapsedAgg = { ...aggNode, collapsed: true };
    newLoadedNodes[aggregateId] = collapsedAgg;
    if (!newNodeSettings[aggregateId]) newNodeSettings[aggregateId] = defaultNodeSettings();
    _addParent(newLoadedBy, aggregateId, aggNode.sourceUri);

    // Re-add aggregate edge
    const aggEdgeId = `${aggNode.sourceUri}-${aggNode.predicate}-${aggregateId}`;
    newLoadedRelations[aggEdgeId] = {
      id: aggEdgeId,
      source: aggregateId,
      target: aggNode.sourceUri,
      predicate: aggNode.predicate,
      label: aggNode.predicateLabel,
      sources: [],
      rank: 'normal',
      referenceCount: 0,
      classification: 'aggregate',
      redundancyGroup: null,
      tier: 'aggregate',
      direction: 'incoming',
      contextPromoted: false,
      weight: 50,
      aggregateCount: aggNode.count,
    };

    const finalAggregates = { ...get().loadedAggregates };
    finalAggregates[aggregateId] = collapsedAgg;

    // Clean edges whose endpoints are no longer in nodeSettings
    const cleanedRelations = cleanOrphanedEdges(newLoadedRelations, getVisibleUris(newNodeSettings));

    set({
      loadedNodes: newLoadedNodes,
      loadedRelations: cleanedRelations,
      loadedAggregates: finalAggregates,
      nodeSettings: newNodeSettings,
      loadedBy: newLoadedBy,
      loadedByDirection: newLoadedByDirection,
    });

    get().updateGraphData();
    get().saveToHistory();
  },

  /**
   * Fetch aggregate children for listing in the detail panel (not for graph expansion).
   * Stores results in loadedAggregates and loadedNodes.
   *
   * @param {string} aggregateId
   * @returns {Promise<void>}
   */
  expandAggregateForList: async (aggregateId) => {
    const { loadedAggregates, loadedNodes } = get();
    const aggNode = loadedAggregates[aggregateId];
    if (!aggNode) return;
    if (aggNode.children?.length > 0) return;

    const maxChildren = aggNode.count > 30 ? 50 : aggNode.count + 5;
    const result = await fetchAggregateChildren(aggNode.sourceUri, aggNode.predicate, maxChildren);

    const newLoadedNodes = { ...get().loadedNodes };
    const childUris = [];
    for (const n of result.nodes) {
      if (!newLoadedNodes[n.uri]) newLoadedNodes[n.uri] = n;
      childUris.push(n.uri);
    }
    const newLoadedAggregates = { ...get().loadedAggregates };
    newLoadedAggregates[aggregateId] = { ...aggNode, children: childUris };
    set({ loadedAggregates: newLoadedAggregates, loadedNodes: newLoadedNodes });
  },

  /**
   * Initialize the graph from a search result.
   * Fetches the entity, pins it, and triggers the layout.
   *
   * @param {string} uri — Selected entity URI
   */
  initFromEntity: async (uri) => {
    // Show loading state immediately
    set({ initLoading: true, initError: null });

    try {
      // Reset state for fresh exploration
      set({
        loadedNodes: {},
        loadedRelations: {},
        outgoingDisplayRelations: {},
        loadedAggregates: {},
        loadedBy: {},
        incomingEdgeIds: new Set(),
        loadingUris: new Set(),
        failedUris: new Set(),
        expandedUris: new Set(),
        incomingExpandedUris: new Set(),
        emptyIncomingUris: new Set(),
        outgoingFetchedUris: new Set(),
        allDiscoveredTypes: new Set(),
        searchResults: [],
        nodeSettings: {},
        recentlyAddedNodes: {},
      });

      // Pin this entity as the starting point (null parent = racine indépendante)
      const newPinnedNodes = new Set();
      newPinnedNodes.add(uri);
      const newNodeSettings = { [uri]: defaultNodeSettings() };

      set({
        pinnedNodes: newPinnedNodes,
        nodeSettings: newNodeSettings,
        loadedBy: { [uri]: null },
        centralNodeId: uri,
        positions: {},
      });

      // ── Phase 1: Fetch central node + outgoing neighbors ─────────────
      const expandResult = await fetchEntityExpand(uri, 'outgoing', 50);
      const lodNode = expandResult.node;
      if (!lodNode) throw new Error('Impossible de charger cette entité depuis Wikidata');

      await cache.set(cache.cacheKey('wikidata', `node:${uri}`), lodNode, 'wikidata');

      // Store central node immediately → graph shows the starting entity
      const newDiscoveredTypes = new Set();
      (lodNode.types || []).forEach(t => newDiscoveredTypes.add(t));

      set({
        loadedNodes: { [uri]: lodNode },
        allDiscoveredTypes: newDiscoveredTypes,
        expandedUris: new Set([uri]),
        initLoading: false,
        initError: null,
      });

      // Show central node immediately
      get().updateGraphData();

      // Résolution de contexte (backend-side, enrichit les propriétés classifiées)
      if (lodNode.types?.length > 0) {
        resolveContext(lodNode.types, lodNode.properties);
      }

      // Store outgoing neighbors as display-only relations (for Propriétés section)
      const outgoingEdges = expandResult.neighbors?.edges || [];
      const outgoingNodes = expandResult.neighbors?.nodes || [];
      if (outgoingEdges.length > 0 || outgoingNodes.length > 0) {
        const newLoadedNodes = { ...get().loadedNodes };
        const newOutgoingDisplay = { ...get().outgoingDisplayRelations };

        for (const n of outgoingNodes) {
          if (!newLoadedNodes[n.uri]) newLoadedNodes[n.uri] = n;
          (n.types || []).forEach(t => newDiscoveredTypes.add(t));
        }
        for (const e of outgoingEdges) {
          newOutgoingDisplay[e.id] = e;
        }

        const newOutgoingFetched = new Set(get().outgoingFetchedUris);
        newOutgoingFetched.add(uri);

        set({
          loadedNodes: newLoadedNodes,
          outgoingDisplayRelations: newOutgoingDisplay,
          outgoingFetchedUris: newOutgoingFetched,
          allDiscoveredTypes: newDiscoveredTypes,
        });
      }

      // Select the central node early
      get().selectNode(uri);

      // ── Phase 2: Fetch incoming aggregates progressively ─────────────
      let incomingAggregatesData = { aggregates: [] };

      try {
        incomingAggregatesData = await fetchIncomingAggregates(uri, 100);
      } catch (aggErr) {
        console.warn(`[initFromEntity] Incoming aggregates fetch failed (non-fatal):`, aggErr);
      }

      const AGGREGATE_THRESHOLD = get().aggregateParams?.threshold ?? 5;
      const aggregates = incomingAggregatesData.aggregates || [];

      if (aggregates.length === 0) {
        const newEmptyIncoming = new Set(get().emptyIncomingUris);
        newEmptyIncoming.add(uri);
        set({ emptyIncomingUris: newEmptyIncoming, incomingExpandedUris: new Set([...get().incomingExpandedUris, uri]) });
      }

      // Process aggregates one by one for progressive display
      const WD_PREFIX_INIT = 'http://www.wikidata.org/entity/';
      for (const agg of aggregates) {
        const aggId = `agg:${uri.replace(WD_PREFIX_INIT, '')}:${agg.predicate}`;

        if (get().loadedAggregates[aggId]) {
          continue;
        }

        if (agg.count <= AGGREGATE_THRESHOLD) {
          // Auto-expand: fetch individual children and add them directly to the graph
          try {
            const childrenData = await fetchAggregateChildren(uri, agg.predicate, agg.count + 5);
            const batchLoadedNodes = { ...get().loadedNodes };
            const batchLoadedRelations = { ...get().loadedRelations };
            const batchIncomingEdgeIds = new Set(get().incomingEdgeIds);
            const batchNodeSettings = { ...get().nodeSettings };
            const batchLoadedBy = { ...get().loadedBy };
            for (const n of childrenData.nodes) {
              if (!batchLoadedNodes[n.uri]) batchLoadedNodes[n.uri] = n;
              prefetchEnqueue(n.uri);
              if (!batchNodeSettings[n.uri]) batchNodeSettings[n.uri] = defaultNodeSettings();
              _addParent(batchLoadedBy, n.uri, uri);
            }
            for (const e of childrenData.edges) {
              batchLoadedRelations[e.id] = e;
              batchIncomingEdgeIds.add(e.id);
            }
            set({
              loadedNodes: batchLoadedNodes,
              loadedRelations: batchLoadedRelations,
              nodeSettings: batchNodeSettings,
              loadedBy: batchLoadedBy,
              incomingEdgeIds: batchIncomingEdgeIds,
            });
            get().updateGraphData();
          } catch (err) {
            console.warn(`[initFromEntity] Auto-expand failed for ${aggId}:`, err);
          }
        } else {
          // Create aggregate node — add to nodeSettings so it's visible
          const aggNode = createAggregateNode({
            id: aggId,
            sourceUri: uri,
            predicate: agg.predicate,
            predicateLabel: agg.predicateLabel,
            targetClasses: agg.targetClasses,
            targetClassLabels: agg.targetClassLabels,
            count: agg.count,
          });

          const aggEdge = {
            id: `${uri}-${agg.predicate}-${aggId}`,
            source: aggId,
            target: uri,
            predicate: agg.predicate,
            label: agg.predicateLabel,
            sources: [],
            rank: 'normal',
            referenceCount: 0,
            classification: 'aggregate',
            redundancyGroup: null,
            tier: 'aggregate',
            direction: 'incoming',
            contextPromoted: false,
            weight: 50,
            aggregateCount: agg.count,
          };

          const batchLoadedNodes = { ...get().loadedNodes, [aggId]: aggNode };
          const batchLoadedRelations = { ...get().loadedRelations, [aggEdge.id]: aggEdge };
          const batchIncomingEdgeIds = new Set(get().incomingEdgeIds);
          batchIncomingEdgeIds.add(aggEdge.id);
          const batchAggregates = { ...get().loadedAggregates, [aggId]: aggNode };
          const batchNodeSettings = { ...get().nodeSettings, [aggId]: defaultNodeSettings() };
          const batchLoadedBy = { ...get().loadedBy };
          _addParent(batchLoadedBy, aggId, uri);

          set({
            loadedNodes: batchLoadedNodes,
            loadedRelations: batchLoadedRelations,
            loadedAggregates: batchAggregates,
            nodeSettings: batchNodeSettings,
            loadedBy: batchLoadedBy,
            incomingEdgeIds: batchIncomingEdgeIds,
          });
          get().updateGraphData();
        }

      }

      // Mark incoming as expanded
      set({ incomingExpandedUris: new Set([...get().incomingExpandedUris, uri]) });

      // Le nœud central est déjà exploré après initFromEntity
      get().setNodeExplored(uri);
      get().saveToHistory();
    } catch (err) {
      console.error('[initFromEntity] Failed:', err);
      set({
        initLoading: false,
        initError: err.message || 'Erreur lors du chargement',
        loadedNodes: {},
        loadedRelations: {},
        outgoingDisplayRelations: {},
        pinnedNodes: new Set(),
        nodeSettings: {},
      });
    }
  },

  /**
   * Invalidate cache for a specific URI and re-fetch.
   */
  refreshNode: async (uri) => {
    await cache.invalidate(cache.cacheKey('wikidata', `node:${uri}`));
    await cache.invalidate(cache.cacheKey('wikidata', `neighbors:${uri}`));
    await cache.invalidate(cache.cacheKey('wikidata', `neighbors-incoming:${uri}`));

    // Remove from loaded/expanded sets to force re-fetch
    const newLoadedNodes = { ...get().loadedNodes };
    delete newLoadedNodes[uri];
    const newExpandedUris = new Set(get().expandedUris);
    newExpandedUris.delete(uri);
    const newIncomingExpandedUris = new Set(get().incomingExpandedUris);
    newIncomingExpandedUris.delete(uri);
    set({ loadedNodes: newLoadedNodes, expandedUris: newExpandedUris, incomingExpandedUris: newIncomingExpandedUris });

    await get().fetchAndExpandNode(uri, { force: true });
  },

  /**
   * Set the exploration direction for a specific node.
   * Resets explored=false so the "Explorer" button becomes active again.
   */
  setNodeDirection: (uri, direction) => {
    const settings = get().nodeSettings[uri] || defaultNodeSettings();
    if (settings.explorationDirection === direction) return;
    set(s => ({
      nodeSettings: { ...s.nodeSettings, [uri]: { ...settings, explorationDirection: direction, explored: false } }
    }));
    // No visual change yet — purge happens when user clicks Explorer (force=true)
  },

  /**
   * Set render mode for a specific node.
   */
  setNodeRenderMode: (uri, mode) => {
    const settings = get().nodeSettings[uri] || defaultNodeSettings();
    set(s => ({
      nodeSettings: { ...s.nodeSettings, [uri]: { ...settings, renderMode: mode } }
    }));
    get().wakeSimulation();
  },

  /**
   * Set radial strength for a specific node.
   */
  setNodeRadialStrength: (uri, value) => {
    const settings = get().nodeSettings[uri] || defaultNodeSettings();
    set(s => ({
      nodeSettings: { ...s.nodeSettings, [uri]: { ...settings, radialStrength: value } }
    }));
    get().wakeSimulation();
  },

  /**
   * Set radial spacing mode for a specific node.
   */
  setNodeRadialSpacingMode: (uri, mode) => {
    const settings = get().nodeSettings[uri] || defaultNodeSettings();
    set(s => ({
      nodeSettings: { ...s.nodeSettings, [uri]: { ...settings, radialSpacingMode: mode } }
    }));
    get().wakeSimulation();
  },

  /**
   * Set radial spacing for a specific node.
   */
  setNodeRadialSpacing: (uri, value) => {
    const settings = get().nodeSettings[uri] || defaultNodeSettings();
    set(s => ({
      nodeSettings: { ...s.nodeSettings, [uri]: { ...settings, radialSpacing: value } }
    }));
    get().wakeSimulation();
  },

  /**
   * Marque un nœud comme exploré (explored=true).
   * Appelé après fetchAndExpandNode ou _fetchSharedNeighbors.
   */
  setNodeExplored: (uri) => {
    const s = get().nodeSettings[uri];
    if (!s) return;
    set(state => ({
      nodeSettings: { ...state.nodeSettings, [uri]: { ...s, explored: true } }
    }));
  },

  /**
   * Mode SHARED : charge les entités sémantiquement similaires via SPARQL.
   * Crée des arêtes synthétiques pondérées par le nombre de propriétés partagées.
   */
  _fetchSharedNeighbors: async (uri) => {
    const { loadedNodes } = get();
    const lodNode = loadedNodes[uri];
    if (!lodNode?.properties) return;

    set(s => ({ loadingUris: new Set([...s.loadingUris, uri]) }));

    try {
      const similar = await fetchSimilarByProperties(uri, lodNode.properties, 'fr', 20);

      // Ajouter les nœuds similaires par groupes de 5 pour un affichage progressif
      let batchNodes = {};
      let batchRelations = {};
      let batchNodeSettings = {};
      let batchCount = 0;

      for (const { uri: sUri, label, sharedCount } of similar) {
        const s = get();
        if (!s.loadedNodes[sUri] && !batchNodes[sUri]) {
          batchNodes[sUri] = {
            uri: sUri, label, types: [], typeLabels: [],
            properties: {}, temporal: { start: null, end: null, birthDate: null, precision: null },
            geo: { lat: null, lon: null }, sources: [], thumbnailUrl: null,
            externalIds: {}, description: '', aliases: [],
          };
        }

        const edgeId = `synthetic:${uri}:shared:${sUri}`;
        if (!s.loadedRelations[edgeId] && !batchRelations[edgeId]) {
          batchRelations[edgeId] = {
            id: edgeId,
            source: uri,
            target: sUri,
            predicate: 'shared',
            label: `${sharedCount} propriété(s) commune(s)`,
            sources: [],
            rank: 'normal',
            referenceCount: sharedCount,
            classification: 'shared',
            redundancyGroup: null,
            tier: 'shared',
            direction: 'shared',
            contextPromoted: false,
            weight: sharedCount * 10,
            isSynthetic: true,
            sharedCount,
          };
        }

        if (!s.nodeSettings[sUri] && !batchNodeSettings[sUri]) {
          batchNodeSettings[sUri] = defaultNodeSettings({ isSharedNode: true });
        }

        batchCount++;
        if (batchCount % 5 === 0 || batchCount === similar.length) {
          const s2 = get();
          const newLoadedBy = { ...s2.loadedBy };
          for (const bUri of Object.keys(batchNodes)) _addParent(newLoadedBy, bUri, uri);
          set({
            loadedNodes: { ...s2.loadedNodes, ...batchNodes },
            loadedRelations: { ...s2.loadedRelations, ...batchRelations },
            loadedBy: newLoadedBy,
            nodeSettings: { ...s2.nodeSettings, ...batchNodeSettings },
          });
          get().updateGraphData();
          batchNodes = {};
          batchRelations = {};
          batchNodeSettings = {};
        }
      }

      set(s => ({ sharedExpandedUris: new Set([...s.sharedExpandedUris, uri]) }));
      get().setNodeExplored(uri);
      get().updateGraphData();
    } catch (err) {
      console.error('[dataSlice] _fetchSharedNeighbors failed:', err);
    } finally {
      set(s => { const lu = new Set(s.loadingUris); lu.delete(uri); return { loadingUris: lu }; });
    }
  },

  /**
   * Get or create node settings for a URI.
   */
  getOrCreateNodeSettings: (uri) => {
    const existing = get().nodeSettings[uri];
    if (existing) return existing;
    const settings = defaultNodeSettings();
    set(s => ({ nodeSettings: { ...s.nodeSettings, [uri]: settings } }));
    return settings;
  },

  /**
   * Add a node to the visible graph (from properties/aggregate list).
   * Creates nodeSettings entry if needed to make it a BFS root.
   */
  addNodeToGraph: async (uri) => {
    // Ensure the node is loaded
    if (!get().loadedNodes[uri]) {
      // Temporarily create nodeSettings so fetchAndExpandNode doesn't bail out
      if (!get().nodeSettings[uri]) {
        set(s => ({ nodeSettings: { ...s.nodeSettings, [uri]: defaultNodeSettings() } }));
      }
      await get().fetchAndExpandNode(uri);
    }

    // Ensure nodeSettings entry exists (makes the node visible)
    if (!get().nodeSettings[uri]) {
      set(s => ({
        nodeSettings: { ...s.nodeSettings, [uri]: defaultNodeSettings() }
      }));
    }

    // Racine indépendante (null parent)
    if (!(uri in get().loadedBy)) {
      set(s => ({ loadedBy: { ...s.loadedBy, [uri]: null } }));
    }

    if (!get().pinnedNodes.has(uri)) {
      get().toggleNodePin(uri);
    }
    get().updateGraphData();

    // Track for pulse animation
    set(s => ({
      recentlyAddedNodes: { ...s.recentlyAddedNodes, [uri]: Date.now() }
    }));
  },

  /**
   * Remove an edge from the visible graph (hide it).
   * Adds the PID to a per-node hidden set or toggles the global PID off.
   */
  removeEdgeFromGraph: (edgeId) => {
    const rel = get().loadedRelations[edgeId];
    if (!rel) return;

    // Remove the edge from loadedRelations
    const newLoadedRelations = { ...get().loadedRelations };
    delete newLoadedRelations[edgeId];

    // If removing this edge orphans the target node (no other edges connect to it),
    // also remove the target from nodeSettings (unless pinned)
    const targetUri = rel.target;
    const { pinnedNodes, nodeSettings } = get();
    const hasOtherEdges = Object.values(newLoadedRelations).some(
      e => e.source === targetUri || e.target === targetUri
    );

    if (!hasOtherEdges && !pinnedNodes.has(targetUri) && nodeSettings[targetUri]) {
      const newNodeSettings = { ...nodeSettings };
      delete newNodeSettings[targetUri];
      set({ loadedRelations: newLoadedRelations, nodeSettings: newNodeSettings });
    } else {
      set({ loadedRelations: newLoadedRelations });
    }

    get().updateGraphData();
  },

  /**
   * Remove a node from the graph, including orphan children.
   * Orphan children = nodes only reachable through this node, not pinned,
   * and not in nodeSettings with depth > 0 independently.
   *
   * @param {string} uri — The node URI to remove
   */
  removeNodeFromGraph: (uri) => {
    const { nodeSettings, loadedBy, pinnedNodes } = get();
    if (!nodeSettings[uri]) return;

    // 1. Identifier les orphelins — nœuds dont tous les parents ont disparu
    const orphans = new Set();
    for (const [childUri, parents] of Object.entries(loadedBy)) {
      if (parents === null) continue;                    // racine indépendante, jamais orpheline
      if (!Array.isArray(parents) || !parents.includes(uri)) continue;
      if (pinnedNodes.has(childUri)) continue;           // pinné, conservé
      const hasLivingParent = parents.some(p => p !== uri && nodeSettings[p]);
      if (!hasLivingParent) orphans.add(childUri);
    }

    // 2. nodeSettings — retirer uri + orphelins
    const newNodeSettings = { ...nodeSettings };
    delete newNodeSettings[uri];
    for (const orphan of orphans) delete newNodeSettings[orphan];

    // 3. loadedBy — reconstruire proprement
    const newLoadedBy = {};
    for (const [childUri, parents] of Object.entries(loadedBy)) {
      if (childUri === uri || orphans.has(childUri)) continue;
      if (parents === null) {
        newLoadedBy[childUri] = null;
      } else {
        const filtered = parents.filter(p => p !== uri);
        newLoadedBy[childUri] = filtered.length > 0 ? filtered : null;
      }
    }

    const newPinnedNodes = new Set(pinnedNodes);
    newPinnedNodes.delete(uri);

    prefetchDequeue(uri);
    for (const orphan of orphans) prefetchDequeue(orphan);

    set({ nodeSettings: newNodeSettings, loadedBy: newLoadedBy, pinnedNodes: newPinnedNodes });
    get().updateGraphData();
    get().saveToHistory();
    if (get().selectedNode?.id === uri) get().clearSelectedNode();
  },

  /**
   * Remove a property from a node's cached data.
   * The property is deleted from loadedNodes[uri].properties[pid].
   *
   * @param {string} uri — Node URI
   * @param {string} pid — Property ID to remove
   */
  removePropertyFromCache: (uri, pid) => {
    const node = get().loadedNodes[uri];
    if (!node?.properties?.[pid]) return;

    const newProperties = { ...node.properties };
    delete newProperties[pid];

    const updatedNode = { ...node, properties: newProperties };
    const newLoadedNodes = { ...get().loadedNodes, [uri]: updatedNode };

    // Also remove from outgoingDisplayRelations any edges with this PID from this node
    const newOutgoingDisplay = { ...get().outgoingDisplayRelations };
    for (const [edgeId, rel] of Object.entries(newOutgoingDisplay)) {
      if (rel.source === uri && rel.predicate === pid) {
        delete newOutgoingDisplay[edgeId];
      }
    }

    set({ loadedNodes: newLoadedNodes, outgoingDisplayRelations: newOutgoingDisplay });

    // Update selectedNode if it's the same node
    const currentSelected = get().selectedNode;
    if (currentSelected?.id === uri) {
      set({ selectedNode: mapLodNodeToGraphNode(updatedNode) });
    }
  },

  /**
   * Get a loaded node by URI (or null).
   */
  getLoadedNode: (uri) => {
    return get().loadedNodes[uri] || null;
  },

  /**
   * Register edges from a node's property values into loadedRelations.
   * Handles the case where fetchNeighbors hit its limit and missed some relations.

   *
   * @param {string} sourceUri  — The node URI owning the property
   * @param {string} pid        — Property ID (e.g. "P40")
   * @param {string} label      — Human-readable property label
   * @param {Array}  values     — Property values: [{ value: QID, label, isEntity }]
   */
  registerEdgesFromProperty: (sourceUri, pid, label, values) => {
    const WD = 'http://www.wikidata.org/entity/';
    const newLoadedRelations = { ...get().loadedRelations };
    const newLoadedNodes = { ...get().loadedNodes };

    for (const v of values) {
      if (!v.isEntity) continue;
      // v.value is a QID like "Q123"; build full URI
      const targetUri = v.value.startsWith('http') ? v.value : `${WD}${v.value}`;
      const edgeId = `${sourceUri}-${pid}-${targetUri}`;

      if (!newLoadedRelations[edgeId]) {
        newLoadedRelations[edgeId] = {
          id: edgeId,
          source: sourceUri,
          target: targetUri,
          predicate: pid,
          label,
          sources: [],
          rank: 'normal',
          referenceCount: 0,
          classification: 'unclassified',
          redundancyGroup: null,
        };
      }

      // Add a minimal placeholder node if the target is unknown
      if (!newLoadedNodes[targetUri]) {
        newLoadedNodes[targetUri] = {
          uri: targetUri,
          label: v.label || v.value,
          types: [],
          typeLabels: [],
          properties: {},
          temporal: { start: null, end: null, birthDate: null, precision: null },
          geo: { lat: null, lon: null },
          sources: [],
          thumbnailUrl: null,
          externalIds: {},
          description: '',
          aliases: [],
        };
      }
    }


    set({
      loadedRelations: newLoadedRelations,
      loadedNodes: newLoadedNodes,
    });
  },
});
