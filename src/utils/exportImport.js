import { readAllPositions } from './sharedPositions';

/**
 * Strips heavy data from LodNode for export.
 * Specifically removes sources and thumbnailUrl.
 */
const optimizeNode = (node) => {
  if (!node) return null;
  const optimized = { ...node };
  
  // Remove heavy/unnecessary fields for rendering
  delete optimized.sources;
  delete optimized.thumbnailUrl;
  
  // Clean up properties sources
  if (optimized.properties) {
    optimized.properties = { ...optimized.properties };
    for (const pid in optimized.properties) {
      if (optimized.properties[pid]) {
        optimized.properties[pid] = {
          ...optimized.properties[pid],
          sources: [] // Strip sources array to save space
        };
      }
    }
  }
  
  return optimized;
};

/**
 * Strips heavy data from LodEdge.
 */
const optimizeEdge = (edge) => {
  if (!edge) return null;
  const optimized = { ...edge };
  delete optimized.sources;
  return optimized;
};

/**
 * Exports the current graph state into an optimized JSON format.
 */
export const exportGraph = (storeState) => {
  const {
    loadedNodes,
    loadedRelations,
    loadedAggregates,
    nodeSettings,
    pinnedNodes,
    expandedUris,
    incomingExpandedUris,
    incomingEdgeIds,
    loadedBy,
    recentlyAddedNodes
  } = storeState;

  // Retrieve current 3D positions from the SharedArrayBuffer
  const positions = readAllPositions();

  const exportPayload = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    
    // Core Topology Settings
    nodeSettings,
    pinnedNodes: Array.from(pinnedNodes || []),
    expandedUris: Array.from(expandedUris || []),
    incomingExpandedUris: Array.from(incomingExpandedUris || []),
    incomingEdgeIds: Array.from(incomingEdgeIds || []),
    
    // Parentage
    loadedBy: loadedBy || {},
    
    // Data Caches (Optimized)
    loadedNodes: Object.fromEntries(
      Object.entries(loadedNodes || {}).map(([uri, node]) => [uri, optimizeNode(node)])
    ),
    loadedRelations: Object.fromEntries(
      Object.entries(loadedRelations || {}).map(([id, edge]) => [id, optimizeEdge(edge)])
    ),
    loadedAggregates: loadedAggregates || {},
    
    // Visual State
    positions,
    recentlyAddedNodes: recentlyAddedNodes || {}
  };

  return JSON.stringify(exportPayload);
};

export const downloadGraphJSON = (storeState) => {
  const jsonStr = exportGraph(storeState);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `gexor-session-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Validates and restores a decoded JSON payload into the store.
 */
export const validateAndRestoreGraph = (jsonData, storeSet) => {
  try {
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error('Invalid JSON structure');
    }
    
    if (jsonData.version !== '1.0') {
      console.warn(`Restoring from unknown version: ${jsonData.version}`);
    }

    // Prepare restored sets
    const restoredPinnedNodes = new Set(jsonData.pinnedNodes || []);
    
    // Apply to Store
    storeSet((state) => ({
      ...state,
      // Data Slice
      loadedNodes: jsonData.loadedNodes || {},
      loadedRelations: jsonData.loadedRelations || {},
      loadedAggregates: jsonData.loadedAggregates || {},
      nodeSettings: jsonData.nodeSettings || {},
      expandedUris: new Set(jsonData.expandedUris || []),
      incomingExpandedUris: new Set(jsonData.incomingExpandedUris || []),
      incomingEdgeIds: new Set(jsonData.incomingEdgeIds || []),
      recentlyAddedNodes: jsonData.recentlyAddedNodes || {},
      
      // Parentage
      loadedBy: jsonData.loadedBy || {},
      
      // Pin Slice
      pinnedNodes: restoredPinnedNodes,
      
      // History Slice
      history: [],
      historyIndex: -1,
      
      // UI Slice (fallback positions)
      positions: jsonData.positions || {},
      selectedNode: null, // Clear selection on restore
    }));
    
    // The force layout worker will be notified separately via the store's loadSession action
    // where layout.postMessage({ type: 'restorePositions', positions, pinnedNodes }) is called.
    
    return jsonData.positions || {};
  } catch (error) {
    console.error('Failed to import graph:', error);
    throw error;
  }
};
