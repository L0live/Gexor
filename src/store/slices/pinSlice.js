/**
 * pinSlice — Pinning system, groups, drag, BFS exploration
 */
import { DEFAULT_RADIAL_STRENGTH, DEFAULT_RADIAL_SPACING, DEFAULT_RADIAL_SPACING_MODE } from '../../constants/graphConstants';

const defaultPinSettings = (overrides = {}) => ({
  depth: 1,
  renderMode: 'force',          // 'force' | 'radial'
  radialStrength: DEFAULT_RADIAL_STRENGTH,
  radialSpacingMode: DEFAULT_RADIAL_SPACING_MODE, // 'fixed' | 'proportional'
  radialSpacing: DEFAULT_RADIAL_SPACING,
  ...overrides
});

export const createPinSlice = (set, get) => ({
  pinnedNodes: new Set(),
  pinnedSettings: {},
  draggedNodeId: null,
  unpinnedDuringDrag: new Set(),

  setGroupDepth: (nodeId, depth) => {
    set((state) => ({
      pinnedSettings: {
        ...state.pinnedSettings,
        [nodeId]: { ...state.pinnedSettings[nodeId], depth }
      }
    }));
    get().updateGraphData();
  },

  setGroupRenderMode: (nodeId, mode) => {
    set((state) => ({
      pinnedSettings: {
        ...state.pinnedSettings,
        [nodeId]: { ...state.pinnedSettings[nodeId], renderMode: mode }
      }
    }));
    get().wakeSimulation();
  },

  setRadialStrength: (nodeId, value) => {
    set((state) => ({
      pinnedSettings: {
        ...state.pinnedSettings,
        [nodeId]: { ...state.pinnedSettings[nodeId], radialStrength: value }
      }
    }));
    get().wakeSimulation();
  },

  setRadialSpacingMode: (nodeId, mode) => {
    set((state) => ({
      pinnedSettings: {
        ...state.pinnedSettings,
        [nodeId]: { ...state.pinnedSettings[nodeId], radialSpacingMode: mode }
      }
    }));
    get().wakeSimulation();
  },

  setRadialSpacing: (nodeId, value) => {
    set((state) => ({
      pinnedSettings: {
        ...state.pinnedSettings,
        [nodeId]: { ...state.pinnedSettings[nodeId], radialSpacing: value }
      }
    }));
    get().wakeSimulation();
  },

  setDraggedNode: (nodeId) => {
    set({ draggedNodeId: nodeId });
    if (nodeId) {
      get().wakeSimulation();
    }
  },
  
  pinAllNodes: () => {
    const worker = get().layoutInstance;
    // Build the pinned set from all currently visible nodes
    const pinnedSet = new Set();
    const newPinnedSettings = { ...get().pinnedSettings };
    get().nodes.forEach(n => {
      pinnedSet.add(n.id);
      if (!newPinnedSettings[n.id]) {
        newPinnedSettings[n.id] = defaultPinSettings();
      }
    });
    set({ pinnedNodes: pinnedSet, pinnedSettings: newPinnedSettings });
    if (worker?.postMessage) worker.postMessage({ type: 'pinAllNodes' });
    get().updateGraphData();
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
    const { pinnedNodes, pinnedSettings } = get();
    
    const newPinnedNodes = new Set(pinnedNodes);
    const newPinnedSettings = { ...pinnedSettings };
    const newGroupFilters = { ...get().groupFilters };
    const newGroupOpacityLevels = { ...get().groupOpacityLevels };

    if (pinnedNodes.has(nodeId)) {
      // Unpin
      newPinnedNodes.delete(nodeId);
      delete newPinnedSettings[nodeId];
      delete newGroupFilters[nodeId];
      delete newGroupOpacityLevels[nodeId];
      if (worker?.postMessage) worker.postMessage({ type: 'pinNode', nodeId, pinned: false });
    } else {
      // Pin
      newPinnedNodes.add(nodeId);
      newPinnedSettings[nodeId] = defaultPinSettings();
      newGroupFilters[nodeId] = { ...get().filters };
      newGroupOpacityLevels[nodeId] = { ...get().opacityLevels };
      if (worker?.postMessage) worker.postMessage({ type: 'pinNode', nodeId, pinned: true });
    }
    set({ 
      pinnedNodes: newPinnedNodes, 
      pinnedSettings: newPinnedSettings,
      groupFilters: newGroupFilters,
      groupOpacityLevels: newGroupOpacityLevels
    });
    get().updateGraphData();
    get().wakeSimulation();
    
    setTimeout(() => get().saveToHistory(), 100);
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
    set({ pinnedNodes: new Set(), pinnedSettings: {} });
    get().updateGraphData();
    get().wakeSimulation();
    
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  pinAllVisibleNodes: (visibleNodeIds) => {
    const worker = get().layoutInstance;
    const newPinnedNodes = new Set();
    const newPinnedSettings = { ...get().pinnedSettings };
    visibleNodeIds.forEach(nodeId => {
      newPinnedNodes.add(nodeId);
      if (!newPinnedSettings[nodeId]) {
        newPinnedSettings[nodeId] = defaultPinSettings();
      }
    });
    if (worker?.postMessage) {
      worker.postMessage({ type: 'pinNodes', nodeIds: [...visibleNodeIds] });
    }
    set({ pinnedNodes: newPinnedNodes, pinnedSettings: newPinnedSettings });
    get().updateGraphData();
    
    setTimeout(() => get().saveToHistory(), 100);
  },
});
