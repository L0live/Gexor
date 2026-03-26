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
  rawNodes: [],
  rawRelations: [],
  nodes: [],
  edges: [],

  showRelations: true,
  showBackground: false,

  updateGraphData: () => {
    const { loadedNodes, loadedRelations, nodeSettings } = get();

    // Nœuds visibles = toutes les clés de nodeSettings
    const visibleUris = getVisibleUris(nodeSettings);

    if (visibleUris.size === 0) {
      set({ nodes: [], edges: [], visibleNodeIds: new Set(), rawNodes: [], rawRelations: [] });
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

    // Arêtes visibles = source ET target sont dans finalVisibleIds
    const crossEdges = [];
    for (const rel of Object.values(loadedRelations)) {
      if (!finalVisibleIds.has(rel.source) || !finalVisibleIds.has(rel.target)) continue;
      const graphEdge = mapLodEdgeToGraphEdge(rel);
      if (rel.isSynthetic) graphEdge.isSynthetic = true;
      crossEdges.push(graphEdge);
    }

    // Groupement des arêtes parallèles / bidirectionnelles
    // A→B et B→A sur le même PID = bidirectionnel (une seule arête groupée)
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
      rawNodes: [],
      rawRelations: [],
    });
  },

  toggleRelations: () => {
    set((state) => ({ showRelations: !state.showRelations }));
  },

  toggleBackground: () => {
    set((state) => ({ showBackground: !state.showBackground }));
  },
});
