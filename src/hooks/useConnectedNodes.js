import { useMemo } from 'react';
import useGraphStore from '../store/useGraphStore';

/**
 * Computes the list of connected nodes for a given nodeUri.
 * Merges loadedRelations + outgoingDisplayRelations, filters by visibility,
 * and returns sorted by classification quality.
 */
export const useConnectedNodes = (nodeUri) => {
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const loadedRelations = useGraphStore(s => s.loadedRelations);
  const outgoingDisplayRelations = useGraphStore(s => s.outgoingDisplayRelations);
  const visibleNodeIds = useGraphStore(s => s.visibleNodeIds);
  const outgoingFetchedUris = useGraphStore(s => s.outgoingFetchedUris);

  return useMemo(() => {
    if (!nodeUri) return [];

    const connectionMap = new Map();
    const allRelations = [...Object.values(loadedRelations), ...Object.values(outgoingDisplayRelations)];

    allRelations.forEach(rel => {
      let neighborUri = null;
      let direction = null;
      if (rel.source === nodeUri) { neighborUri = rel.target; direction = 'outgoing'; }
      else if (rel.target === nodeUri) { neighborUri = rel.source; direction = 'incoming'; }
      if (!neighborUri) return;

      const isVisible = visibleNodeIds.has(neighborUri);
      const isOutgoingFetch = direction === 'outgoing' && outgoingFetchedUris.has(nodeUri);
      if (!isVisible && !isOutgoingFetch) return;

      if (!connectionMap.has(neighborUri)) {
        connectionMap.set(neighborUri, { relations: [] });
      }
      connectionMap.get(neighborUri).relations.push({
        pid: rel.predicate,
        label: rel.label,
        classification: rel.classification || 'unclassified',
        direction,
      });
    });

    const classOrder = { 'primary': 0, 'context-dependent': 1, 'unclassified': 2, 'secondary': 3 };

    return Array.from(connectionMap.entries())
      .map(([uri, data]) => {
        const node = loadedNodes[uri];
        if (!node) return null;
        const bestClassification = data.relations.reduce((best, r) => {
          return (classOrder[r.classification] || 3) < (classOrder[best] || 3) ? r.classification : best;
        }, 'secondary');
        return {
          uri: node.uri,
          label: node.label,
          type: node.category || 'unknown',
          description: node.description,
          isVisible: visibleNodeIds.has(node.uri),
          bestClassification,
          relations: data.relations,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (classOrder[a.bestClassification] || 3) - (classOrder[b.bestClassification] || 3));
  }, [nodeUri, loadedNodes, loadedRelations, outgoingDisplayRelations, visibleNodeIds, outgoingFetchedUris]);
};
