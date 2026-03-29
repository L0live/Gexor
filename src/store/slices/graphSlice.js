/**
 * graphSlice — Processed nodes/edges, visibility
 *
 * Visibility rule: présence dans nodeSettings ↔ "dans le graphe".
 * Pas de BFS, pas de filtrage PID — toutes les arêtes dont les deux
 * endpoints sont dans nodeSettings sont visibles.
 */
import { mapLodNodeToGraphNode, mapLodEdgeToGraphEdge } from '../utils';
import { getVisibleUris } from '../visibilityHelpers';

export const createGraphSlice = (set, get) => ({
  visibleNodeIds: new Set(),
  nodes: [],
  edges: [],

  showRelations: true,
  showBackground: false,

  // UI-5: Index of edges by source/target URI for fast lookup
  _edgeIndex: null, // { bySource: Map<uri, edgeId[]>, byTarget: Map<uri, edgeId[]> }

  /** Rebuild the edge index from loadedRelations. Called lazily. */
  _rebuildEdgeIndex: () => {
    const { loadedRelations } = get();
    const bySource = new Map();
    const byTarget = new Map();
    for (const [id, rel] of Object.entries(loadedRelations)) {
      if (!bySource.has(rel.source)) bySource.set(rel.source, []);
      bySource.get(rel.source).push(id);
      if (!byTarget.has(rel.target)) byTarget.set(rel.target, []);
      byTarget.get(rel.target).push(id);
    }
    const idx = { bySource, byTarget };
    set({ _edgeIndex: idx });
    return idx;
  },

  updateGraphData: () => {
    const { loadedNodes, loadedRelations, nodeSettings } = get();

    // Nœuds visibles = toutes les clés de nodeSettings
    const visibleUris = getVisibleUris(nodeSettings);

    if (visibleUris.size === 0) {
      set({ nodes: [], edges: [], visibleNodeIds: new Set() });
      return;
    }

    const visibleNodes = [];
    for (const uri of visibleUris) {
      const lodNode = loadedNodes[uri];
      if (!lodNode) continue; // ghost node (dans nodeSettings mais pas encore fetché)

      const graphNode = mapLodNodeToGraphNode(lodNode);

      if (lodNode.type === 'aggregate') {
        graphNode.isAggregate = true;
        graphNode.aggregateCount = lodNode.count;
        graphNode.aggregateId = lodNode.id;
        graphNode.sourceUri = lodNode.sourceUri;
        graphNode.predicate = lodNode.predicate;
        graphNode.predicateLabel = lodNode.predicateLabel;
        graphNode.targetClasses = lodNode.targetClasses;
        graphNode.targetClassLabels = lodNode.targetClassLabels;
        graphNode.loadingChildren = lodNode.loadingChildren;
      }

      if (nodeSettings[uri]?.isSharedNode) graphNode.isSharedNode = true;

      visibleNodes.push(graphNode);
    }

    const finalVisibleIds = new Set(visibleNodes.map(n => n.id));

    // PERF-7: Assert no duplicate node IDs
    if (import.meta.env.DEV && finalVisibleIds.size !== visibleNodes.length) {
      console.warn('[graphSlice] Duplicate nodes detected!', visibleNodes.length - finalVisibleIds.size, 'duplicates');
    }

    // UI-5: Build fresh edge index for this update cycle
    const edgeIndex = get()._rebuildEdgeIndex();
    const seenEdgeIds = new Set();
    const crossEdges = [];

    for (const uri of finalVisibleIds) {
      const sourceEdges = edgeIndex.bySource.get(uri) || [];
      const targetEdges = edgeIndex.byTarget.get(uri) || [];
      for (const edgeId of sourceEdges) {
        if (seenEdgeIds.has(edgeId)) continue;
        seenEdgeIds.add(edgeId);
        const rel = loadedRelations[edgeId];
        if (!rel || !finalVisibleIds.has(rel.target)) continue;
        const graphEdge = mapLodEdgeToGraphEdge(rel);
        if (rel.isSynthetic) graphEdge.isSynthetic = true;
        crossEdges.push(graphEdge);
      }
      for (const edgeId of targetEdges) {
        if (seenEdgeIds.has(edgeId)) continue;
        seenEdgeIds.add(edgeId);
        const rel = loadedRelations[edgeId];
        if (!rel || !finalVisibleIds.has(rel.source)) continue;
        const graphEdge = mapLodEdgeToGraphEdge(rel);
        if (rel.isSynthetic) graphEdge.isSynthetic = true;
        crossEdges.push(graphEdge);
      }
    }

    // Groupement des arêtes parallèles / bidirectionnelles
    const edgesMap = new Map();
    for (const edge of crossEdges) {
      const [u, v] = edge.source < edge.target
        ? [edge.source, edge.target]
        : [edge.target, edge.source];
      const pairKey = `${u}||${v}`;

      if (!edgesMap.has(pairKey)) {
        edgesMap.set(pairKey, {
          id: `grouped_${pairKey}`,
          source: edge.source,
          target: edge.target,
          isAggregate: false,
          isSynthetic: false,
          relations: [],
          isBidirectional: false,
        });
      }

      const group = edgesMap.get(pairKey);
      group.relations.push(edge);
      if (edge.isAggregate) group.isAggregate = true;
      if (edge.isSynthetic) group.isSynthetic = true;
      if (edge.source !== group.source) group.isBidirectional = true;
    }

    const edges = Array.from(edgesMap.values());

    set({
      nodes: visibleNodes,
      edges,
      visibleNodeIds: finalVisibleIds,
    });
  },

  toggleRelations: () => {
    set((state) => ({ showRelations: !state.showRelations }));
  },

  toggleBackground: () => {
    set((state) => ({ showBackground: !state.showBackground }));
  },
});
