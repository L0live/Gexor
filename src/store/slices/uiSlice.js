/**
 * uiSlice — Selection, layout, camera, simulation, positions, reset
 */
import { DEFAULT_FILTERS, DEFAULT_FILTER_MODES, DEFAULT_OPACITY_LEVELS } from '../../constants/graphConstants';
import { computeRadialTargets, setRadialActive } from '../../utils/radialLayout';
import { readPosition } from '../../utils/sharedPositions';

export const createUiSlice = (set, get) => ({
  selectedNode: null,
  selectedEdge: null,
  selectedGroupId: null,
  hoveredNodeId: null,
  hoveredEdgeId: null,
  centralNodeId: null,

  positions: {},
  radialTargets: {},  // { [nodeId]: {x,y,z} } — computed radial target positions
  layoutRunning: false,
  layoutProgress: 0,
  layoutReady: false,
  layoutInstance: null,
  autoDragNode: null,

  cameraControlsRef: null,
  centerOnNodeId: null,
  centerOnPosition: null,

  simulationActive: false,
  simulationPaused: false,
  simulationStable: false,

  // Simple setters
  setAutoDragNode: (data) => set({ autoDragNode: data }),
  setLayoutInstance: (layout) => set({ layoutInstance: layout }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setHoveredEdgeId: (id) => set({ hoveredEdgeId: id }),

  selectNode: (nodeId) => {
    const node = get().nodes.find(n => n.id === nodeId);
    if (!node) return;

    const memberships = get().nodeGroupMemberships[nodeId] || [];
    const { pinnedNodes, selectedGroupId } = get();
    let newGroupId = selectedGroupId;

    if (pinnedNodes.has(nodeId)) {
      newGroupId = nodeId;
    } else if (memberships.length > 0) {
      if (!newGroupId || !memberships.includes(newGroupId)) {
        newGroupId = memberships[0];
      }
    } else {
      newGroupId = null;
    }

    set({ selectedNode: node, selectedEdge: null, selectedGroupId: newGroupId });
  },
  
  selectEdge: (edgeId) => {
    const edge = get().edges.find(e => e.id === edgeId);
    if (!edge) return;

    const { nodeGroupMemberships, selectedGroupId } = get();
    const sMem = nodeGroupMemberships[edge.source] || [];
    const tMem = nodeGroupMemberships[edge.target] || [];
    const intersection = sMem.filter(g => tMem.includes(g));

    let newGroupId = selectedGroupId;
    if (intersection.length > 0) {
      if (!newGroupId || !intersection.includes(newGroupId)) {
        newGroupId = intersection[0];
      }
    } else {
      newGroupId = null;
    }

    set({ selectedEdge: edge, selectedNode: null, selectedGroupId: newGroupId });
  },

  setSelectedGroup: (groupId) => set({ selectedGroupId: groupId }),
  clearSelection: () => set({ selectedNode: null, selectedEdge: null, selectedGroupId: null }),
  clearSelectedNode: () => set({ selectedNode: null, selectedEdge: null }),
  clearSelectedGroup: () => set({ selectedGroupId: null }),
  
  setPositions: (positions) => set({ positions }),
  
  /**
   * Read a single node's position. Tries SAB first (zero-alloc hot path),
   * falls back to the Zustand positions map.
   */
  getNodePosition: (nodeId) => {
    const sab = readPosition(nodeId);
    if (sab) return sab;
    return get().positions[nodeId] || null;
  },

  setLayoutRunning: (running) => set({ layoutRunning: running }),
  setLayoutProgress: (progress) => set({ layoutProgress: progress }),
  setLayoutReady: (ready) => set({ layoutReady: ready }),

  /**
   * Recompute radial target positions for all groups in 'radial' renderMode.
   * Called from the Scene useFrame loop (throttled) so that targets follow
   * the group center as the simulation runs.
   */
  updateRadialTargets: () => {
    const { pinnedNodes, pinnedSettings, nodeGroupDepths, positions } = get();
    const allTargets = {};
    let hasRadial = false;

    pinnedNodes.forEach(groupId => {
      const settings = pinnedSettings[groupId];
      if (!settings || settings.renderMode !== 'radial') return;
      hasRadial = true;

      const groupCenter = positions[groupId];
      if (!groupCenter) return;

      // Build nodeDepthsForGroup using for...in (avoids Object.entries allocation)
      const nodeDepthsForGroup = {};
      for (const nodeId in nodeGroupDepths) {
        const depthsByGroup = nodeGroupDepths[nodeId];
        const d = depthsByGroup[groupId];
        if (d !== undefined) {
          nodeDepthsForGroup[nodeId] = d;
        }
      }

      const targets = computeRadialTargets({
        groupId,
        groupCenter,
        nodeDepthsForGroup,
        spacingMode: settings.radialSpacingMode || 'fixed',
        spacing: settings.radialSpacing || 50,
        currentPositions: positions,
      });

      Object.assign(allTargets, targets);
    });

    setRadialActive(hasRadial);
    set({ radialTargets: allTargets });
  },

  // Simulation controls
  setSimulationActive: (active) => set({ simulationActive: active }),
  
  setSimulationPaused: (paused) => {
    set({ simulationPaused: paused });
    if (!paused) {
      set({ simulationStable: false });
    }
    const worker = get().layoutInstance;
    if (worker?.postMessage) {
      worker.postMessage({ type: 'pause', paused });
    }
  },
  
  setSimulationStable: (stable) => set({ simulationStable: stable }),

  wakeSimulation: () => {
    if (get().simulationStable) {
      set({ simulationStable: false });
      const worker = get().layoutInstance;
      if (worker?.postMessage) {
        worker.postMessage({ type: 'wake' });
      }
    }
  },
  
  // Camera controls
  setCameraControlsRef: (ref) => set({ cameraControlsRef: ref }),
  triggerCenterOnNode: (nodeId) => set({ centerOnNodeId: nodeId }),
  clearCenterOnNode: () => set({ centerOnNodeId: null }),
  triggerCenterOnPosition: (pos) => set({ centerOnPosition: pos }),
  clearCenterOnPosition: () => set({ centerOnPosition: null }),

  // Master reset
  resetAllSettings: () => {
    const { centralNodeId, layoutInstance: worker } = get();

    if (worker?.postMessage) {
      worker.postMessage({ type: 'resetAllPhysics', centralNodeId });
    }

    set({
      filters: { ...DEFAULT_FILTERS, selectedTags: new Set() },
      filterModes: { ...DEFAULT_FILTER_MODES },
      opacityLevels: { ...DEFAULT_OPACITY_LEVELS },
      individualNodeOpacity: {},
      individualEdgeOpacity: {},
      groupFilters: {},
      groupOpacityLevels: {},
      showRelations: true,
      showBackground: false
    });
  },
});
