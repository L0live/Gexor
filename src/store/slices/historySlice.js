/**
 * historySlice — Undo/redo snapshots
 */
import { mapReecToNode, mapRelationToEdge } from '../utils';
import { MAX_HISTORY_SIZE } from '../../constants/graphConstants';

export const createHistorySlice = (set, get) => ({
  history: [],
  historyIndex: -1,
  maxHistorySize: MAX_HISTORY_SIZE,

  saveToHistory: () => {
    const state = get();
    const snapshot = {
      visibleReecIds: new Set(state.visibleReecIds),
      pinnedNodes: new Set(state.pinnedNodes),
      positions: { ...state.positions }
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
    
    const nodes = state.availableReecs
      .filter(reec => snapshot.visibleReecIds.has(reec.reec_id))
      .map(mapReecToNode);
    
    const edges = state.availableRelations
      .filter(rel => snapshot.visibleReecIds.has(rel.source_reec_id) && snapshot.visibleReecIds.has(rel.target_reec_id))
      .map(mapRelationToEdge);
    
    get()._applySnapshot(snapshot, nodes, edges, newIndex);
  },
  
  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    
    const newIndex = state.historyIndex + 1;
    const snapshot = state.history[newIndex];
    if (!snapshot) return;
    
    const nodes = state.availableReecs
      .filter(reec => snapshot.visibleReecIds.has(reec.reec_id))
      .map(mapReecToNode);
    
    const edges = state.availableRelations
      .filter(rel => snapshot.visibleReecIds.has(rel.source_reec_id) && snapshot.visibleReecIds.has(rel.target_reec_id))
      .map(mapRelationToEdge);
    
    get()._applySnapshot(snapshot, nodes, edges, newIndex);
  },

  _applySnapshot: (snapshot, nodes, edges, newIndex) => {
    const state = get();
    set({
      visibleReecIds: new Set(snapshot.visibleReecIds),
      pinnedNodes: new Set(snapshot.pinnedNodes),
      positions: { ...snapshot.positions },
      nodes,
      edges,
      rawReecs: state.availableReecs.filter(reec => snapshot.visibleReecIds.has(reec.reec_id)),
      rawRelations: state.availableRelations.filter(rel => 
        snapshot.visibleReecIds.has(rel.source_reec_id) && snapshot.visibleReecIds.has(rel.target_reec_id)
      ),
      historyIndex: newIndex
    });
    
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
