import { useMemo, useCallback } from 'react';
import useGraphStore from '../store/useGraphStore';

/**
 * usePluginData — API interne dédiée aux plugins.
 *
 * Centralise l'accès aux données du graph pour les plugins, en exposant trois
 * capabilities : `properties`, `incoming`, `graph`.
 * Chaque capability dispose de `isLoaded`, `isLoading` et `load()` pour déclencher
 * un fetch backend si la data est absente du store.
 *
 * @param {string|undefined} nodeUri
 * @returns {{ node, properties, incoming, graph }}
 */
export const usePluginData = (nodeUri) => {
  const loadedNodes        = useGraphStore(s => s.loadedNodes);
  const loadedRelations    = useGraphStore(s => s.loadedRelations);
  const outgoingDisplay    = useGraphStore(s => s.outgoingDisplayRelations);
  const visibleNodeIds     = useGraphStore(s => s.visibleNodeIds);
  const outgoingFetchedUris    = useGraphStore(s => s.outgoingFetchedUris);
  const incomingExpandedUris   = useGraphStore(s => s.incomingExpandedUris);
  const loadingUris            = useGraphStore(s => s.loadingUris);
  const loadingSelectedNodeProperties = useGraphStore(s => s.loadingSelectedNodeProperties);
  const sharedExpandedUris     = useGraphStore(s => s.sharedExpandedUris);

  const node       = nodeUri ? (loadedNodes[nodeUri] ?? null) : null;
  const properties = node?.properties ?? null;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const classOrder = { primary: 0, 'context-dependent': 1, unclassified: 2, secondary: 3 };

  const buildConnectionMap = useMemo(() => {
    if (!nodeUri) return { incomingMap: new Map(), allMap: new Map() };

    const incomingMap = new Map();
    const allMap      = new Map();

    const allRelations = [
      ...Object.values(loadedRelations),
      ...Object.values(outgoingDisplay),
    ];

    allRelations.forEach(rel => {
      let neighborUri = null;
      let direction   = null;

      if (rel.source === nodeUri)      { neighborUri = rel.target; direction = 'outgoing'; }
      else if (rel.target === nodeUri) { neighborUri = rel.source; direction = 'incoming'; }
      if (!neighborUri) return;

      const isVisible        = visibleNodeIds.has(neighborUri);
      const isOutgoingFetch  = direction === 'outgoing' && outgoingFetchedUris.has(nodeUri);
      if (!isVisible && !isOutgoingFetch) return;

      const entry = { pid: rel.predicate, label: rel.label, classification: rel.classification || 'unclassified', direction };

      // all map — uniquement les nœuds réellement visibles dans le graphe
      if (isVisible) {
        if (!allMap.has(neighborUri)) allMap.set(neighborUri, { relations: [] });
        allMap.get(neighborUri).relations.push(entry);
      }

      // incoming-only map
      if (direction === 'incoming') {
        if (!incomingMap.has(neighborUri)) incomingMap.set(neighborUri, { relations: [] });
        incomingMap.get(neighborUri).relations.push(entry);
      }
    });

    return { incomingMap, allMap };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeUri, loadedRelations, outgoingDisplay, visibleNodeIds, outgoingFetchedUris]);

  const mapToNodes = (map) =>
    Array.from(map.entries())
      .map(([uri, data]) => {
        const n = loadedNodes[uri];
        if (!n) return null;
        const bestClassification = data.relations.reduce((best, r) =>
          (classOrder[r.classification] ?? 3) < (classOrder[best] ?? 3) ? r.classification : best
        , 'secondary');
        return {
          uri: n.uri,
          label: n.label,
          type: n.category || 'unknown',
          description: n.description,
          isVisible: visibleNodeIds.has(n.uri),
          bestClassification,
          relations: data.relations,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (classOrder[a.bestClassification] ?? 3) - (classOrder[b.bestClassification] ?? 3));

  const { incomingMap, allMap } = buildConnectionMap;

  const incomingNodes      = useMemo(() => mapToNodes(incomingMap), [incomingMap, loadedNodes, visibleNodeIds]);
  const allConnectedNodes  = useMemo(() => mapToNodes(allMap),      [allMap,      loadedNodes, visibleNodeIds]);

  // ── Capability: shared ───────────────────────────────────────────────────────
  const sharedEdges = useMemo(() => {
    if (!nodeUri) return [];
    return Object.values(loadedRelations).filter(
      rel => rel.source === nodeUri && rel.classification === 'shared'
    );
  }, [nodeUri, loadedRelations]);

  const sharedNodes = useMemo(() =>
    sharedEdges
      .map(rel => {
        const n = loadedNodes[rel.target];
        if (!n) return null;
        return {
          uri: rel.target,
          label: n.label,
          description: n.description,
          sharedCount: rel.sharedCount ?? 1,
          isVisible: visibleNodeIds.has(rel.target),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.sharedCount - a.sharedCount),
  [sharedEdges, loadedNodes, visibleNodeIds]);

  // ── Capability: properties ───────────────────────────────────────────────────
  const propertiesIsLoaded  = !!(outgoingFetchedUris.has(nodeUri) || (properties && Object.keys(properties).length > 0));
  const propertiesIsLoading = loadingSelectedNodeProperties;
  const loadProperties = useCallback(() => {
    if (!nodeUri) return;
    useGraphStore.getState().fetchOutgoingForDisplay(nodeUri);
  }, [nodeUri]);

  // ── Capability: incoming ─────────────────────────────────────────────────────
  const incomingIsLoaded  = nodeUri ? incomingExpandedUris.has(nodeUri) : false;
  const incomingIsLoading = nodeUri ? loadingUris.has(nodeUri) : false;
  const loadIncoming = useCallback(() => {
    if (!nodeUri) return;
    const state = useGraphStore.getState();
    const settings = state.nodeSettings[nodeUri];
    if (!settings) return;
    const dir = settings.explorationDirection ?? 'incoming';
    if (dir === 'outgoing') {
      state.setNodeDirection(nodeUri, 'both');
    } else if (dir !== 'incoming' && dir !== 'both') {
      state.setNodeDirection(nodeUri, 'incoming');
    }
    state.fetchAndExpandNode(nodeUri);
  }, [nodeUri]);

  const loadShared = useCallback(() => {
    if (nodeUri) useGraphStore.getState()._fetchSharedNeighbors(nodeUri);
  }, [nodeUri]);

  const sharedIsLoaded  = nodeUri ? sharedExpandedUris.has(nodeUri) : false;
  const sharedIsLoading = nodeUri ? loadingUris.has(nodeUri) : false;

  const propertiesCap = useMemo(() => ({
    data: properties,
    isLoaded: propertiesIsLoaded,
    isLoading: propertiesIsLoading,
    load: loadProperties,
  }), [properties, propertiesIsLoaded, propertiesIsLoading, loadProperties]);

  const incomingCap = useMemo(() => ({
    nodes: incomingNodes,
    isLoaded: incomingIsLoaded,
    isLoading: incomingIsLoading,
    load: loadIncoming,
  }), [incomingNodes, incomingIsLoaded, incomingIsLoading, loadIncoming]);

  const graphCap = useMemo(() => ({
    nodes: allConnectedNodes,
  }), [allConnectedNodes]);

  const sharedCap = useMemo(() => ({
    nodes: sharedNodes,
    isLoaded: sharedIsLoaded,
    isLoading: sharedIsLoading,
    load: loadShared,
  }), [sharedNodes, sharedIsLoaded, sharedIsLoading, loadShared]);

  return useMemo(() => ({
    node,
    properties: propertiesCap,
    incoming:   incomingCap,
    graph:      graphCap,
    shared:     sharedCap,
  }), [node, propertiesCap, incomingCap, graphCap, sharedCap]);
};
