/**
 * historySlice — Undo/redo snapshots
 *
 * Adapted for LOD model: uses loadedNodes/loadedRelations (objects keyed by URI).
 */
import { mapLodNodeToGraphNode, mapLodEdgeToGraphEdge } from '../utils';
import { MAX_HISTORY_SIZE } from '../../constants/graphConstants';

export const createHistorySlice = (set, get) => ({
  history: [],
  historyIndex: -1,
  maxHistorySize: MAX_HISTORY_SIZE,

  saveToHistory: () => {
    const state = get();
    const snapshot = {
      visibleNodeIds: new Set(state.visibleNodeIds),
      pinnedNodes: new Set(state.pinnedNodes),
      positions: { ...state.positions },
      nodeSettings: { ...state.nodeSettings },
    };
    
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);
    
    if (newHistory.length > state.maxHistorySize) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },
  
  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return;
    
    const newIndex = state.historyIndex - 1;
    const snapshot = state.history[newIndex];
    if (!snapshot) return;
    
    const { loadedNodes, loadedRelations } = state;

    const nodes = Object.values(loadedNodes)
      .filter(n => snapshot.visibleNodeIds.has(n.uri))
      .map(mapLodNodeToGraphNode);
    
    const edges = Object.values(loadedRelations)
      .filter(rel => snapshot.visibleNodeIds.has(rel.source) && snapshot.visibleNodeIds.has(rel.target))
      .map(mapLodEdgeToGraphEdge);
    
    get()._applySnapshot(snapshot, nodes, edges, newIndex);
  },
  
  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    
    const newIndex = state.historyIndex + 1;
    const snapshot = state.history[newIndex];
    if (!snapshot) return;
    
    const { loadedNodes, loadedRelations } = state;

    const nodes = Object.values(loadedNodes)
      .filter(n => snapshot.visibleNodeIds.has(n.uri))
      .map(mapLodNodeToGraphNode);
    
    const edges = Object.values(loadedRelations)
      .filter(rel => snapshot.visibleNodeIds.has(rel.source) && snapshot.visibleNodeIds.has(rel.target))
      .map(mapLodEdgeToGraphEdge);
    
    get()._applySnapshot(snapshot, nodes, edges, newIndex);
  },

  _applySnapshot: (snapshot, nodes, edges, newIndex) => {
    set({
      visibleNodeIds: new Set(snapshot.visibleNodeIds),
      pinnedNodes: new Set(snapshot.pinnedNodes),
      positions: { ...snapshot.positions },
      nodeSettings: snapshot.nodeSettings ? { ...snapshot.nodeSettings } : {},
      nodes,
      edges,
      rawNodes: [],
      rawRelations: [],
      historyIndex: newIndex
    });

    // Recalculate graph with restored nodeSettings
    get().updateGraphData?.();

    setTimeout(() => {
      const layout = get().layoutInstance;
      if (layout?.postMessage) {
        layout.postMessage({
          type: 'restorePositions',
          positions: snapshot.positions,
          pinnedNodes: [...snapshot.pinnedNodes],
        });
      }
    }, 50);
  },
  
  canUndo: () => {
    const state = get();
    return state.historyIndex > 0 && state.history.length > 1;
  },
  
  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1 && state.history.length > 0;
  },
});
