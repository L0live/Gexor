/**
 * pinSlice — Pinning system (position lock), drag management
 *
 * Pin is purely a position lock. Per-node settings (depth, direction,
 * radial) are managed in nodeSettings on dataSlice.
 */

// Debounce: collapse rapid pin operations into a single history snapshot
let _saveHistoryTimer = null;
const _debouncedSaveHistory = (get) => {
  if (_saveHistoryTimer) clearTimeout(_saveHistoryTimer);
  _saveHistoryTimer = setTimeout(() => {
    _saveHistoryTimer = null;
    get().saveToHistory();
  }, 150);
};

export const createPinSlice = (set, get) => ({
  pinnedNodes: new Set(),
  draggedNodeId: null,
  unpinnedDuringDrag: new Set(),

  setDraggedNode: (nodeId) => {
    set({ draggedNodeId: nodeId });
    if (nodeId) {
      get().wakeSimulation();
    }
  },
  
  pinAllNodes: () => {
    const worker = get().layoutInstance;
    const pinnedSet = new Set();
    get().nodes.forEach(n => {
      pinnedSet.add(n.id);
    });
    set({ pinnedNodes: pinnedSet });
    if (worker?.postMessage) worker.postMessage({ type: 'pinAllNodes' });
  },
  
  unpinNode: (nodeId) => {
    const worker = get().layoutInstance;
    const { pinnedNodes } = get();
    const unpinnedSet = new Set();
    if (pinnedNodes.has(nodeId)) {
      unpinnedSet.add(nodeId);
    }
    set({ unpinnedDuringDrag: unpinnedSet });
    if (worker?.postMessage) worker.postMessage({ type: 'unpinNode', nodeId });
    get().wakeSimulation();
  },
  
  repinNodes: () => {
    const worker = get().layoutInstance;
    const { unpinnedDuringDrag } = get();
    if (worker?.postMessage && unpinnedDuringDrag.size > 0) {
      worker.postMessage({ type: 'repinNodes', nodeIds: [...unpinnedDuringDrag] });
    }
    set({ 
      draggedNodeId: null, 
      unpinnedDuringDrag: new Set()
    });
  },
  
  pinDraggedNodeOnly: (draggedNodeId) => {
    if (!draggedNodeId) return;
    const worker = get().layoutInstance;
    if (worker?.postMessage) {
      worker.postMessage({ type: 'pinNode', nodeId: draggedNodeId, pinned: true });
    }
    set({ 
      draggedNodeId: null, 
      simulationActive: true
    });
  },
  
  toggleNodePin: (nodeId) => {
    const worker = get().layoutInstance;
    const { pinnedNodes } = get();
    
    const newPinnedNodes = new Set(pinnedNodes);

    if (pinnedNodes.has(nodeId)) {
      // Unpin (position lock only — nodeSettings are independent)
      newPinnedNodes.delete(nodeId);
      if (worker?.postMessage) worker.postMessage({ type: 'pinNode', nodeId, pinned: false });
    } else {
      // Pin (position lock only — no nodeSettings creation)
      newPinnedNodes.add(nodeId);
      if (worker?.postMessage) worker.postMessage({ type: 'pinNode', nodeId, pinned: true });
    }
    set({ pinnedNodes: newPinnedNodes });
    get().wakeSimulation();
    
    _debouncedSaveHistory(get);
  },
  
  isPinned: (nodeId) => {
    return get().pinnedNodes.has(nodeId);
  },
  
  unpinAllNodes: () => {
    const worker = get().layoutInstance;
    const { pinnedNodes } = get();
    if (worker?.postMessage) {
      worker.postMessage({ type: 'unpinAllNodes', pinnedNodeIds: [...pinnedNodes] });
    }
    set({ pinnedNodes: new Set() });
    get().updateGraphData();
    get().wakeSimulation();
    
    _debouncedSaveHistory(get);
  },
  
  pinAllVisibleNodes: (visibleNodeIds) => {
    const worker = get().layoutInstance;
    const newPinnedNodes = new Set();
    visibleNodeIds.forEach(nodeId => {
      newPinnedNodes.add(nodeId);
    });
    if (worker?.postMessage) {
      worker.postMessage({ type: 'pinNodes', nodeIds: [...visibleNodeIds] });
    }
    set({ pinnedNodes: newPinnedNodes });
    
    _debouncedSaveHistory(get);
  },
});
