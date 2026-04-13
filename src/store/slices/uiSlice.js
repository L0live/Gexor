/**
 * uiSlice — Selection, layout, camera, simulation, positions, reset
 */
import { computeRadialTargets, setRadialActive, updateRadialCache } from '../../utils/radialLayout';
import { readPosition } from '../../utils/sharedPositions';
import { prioritizeAndFetch } from '../../services/prefetchQueue';
import { mapLodNodeToGraphNode } from '../utils';
import { fetchEntityExpand } from '../../services/queries/wikidata';

export const createUiSlice = (set, get) => ({
  selectedNode: null,
  selectedEdge: null,
  hoveredNodeId: null,
  hoveredEdgeId: null,
  centralNodeId: null,
  loadingSelectedNodeProperties: false,
  autoFetchProperties: false, // When true, auto-fetch outgoing properties on node select
  aggregateThreshold: 5, // Threshold below which incoming aggregates auto-expand

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

  // RightPanel state
  rightPanelOpen: false,
  rightPanelActiveTab: null,

  // Simple setters
  setAutoDragNode: (data) => set({ autoDragNode: data }),
  setLayoutInstance: (layout) => set({ layoutInstance: layout }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setHoveredEdgeId: (id) => set({ hoveredEdgeId: id }),
  setAutoFetchProperties: (value) => set({ autoFetchProperties: value }),
  setAggregateThreshold: (value) => set({ aggregateThreshold: value }),

  selectNode: (nodeId) => {
    let node = get().nodes.find(n => n.id === nodeId);

    if (!node) {
      // Entity not in visible graph — check loadedNodes or fetch it
      const lodNode = get().loadedNodes[nodeId];
      if (lodNode) {
        node = mapLodNodeToGraphNode(lodNode);
      } else {
        // Set a placeholder and fetch asynchronously
        set({ selectedNode: { id: nodeId, label: nodeId.split('/').pop(), isPreview: true }, selectedEdge: null, loadingSelectedNodeProperties: true });
        prioritizeAndFetch(nodeId)
          .then((fetched) => {
            const newLoadedNodes = { ...get().loadedNodes, [nodeId]: fetched };
            const graphNode = mapLodNodeToGraphNode(fetched);
            graphNode.isPreview = true;
            if (get().selectedNode?.id === nodeId) {
              set({ loadedNodes: newLoadedNodes, selectedNode: graphNode, loadingSelectedNodeProperties: false });
            } else {
              set({ loadedNodes: newLoadedNodes, loadingSelectedNodeProperties: false });
            }
          })
          .catch((err) => {
            console.warn(`[uiSlice] Failed to fetch preview for ${nodeId}:`, err);
            set({ loadingSelectedNodeProperties: false });
          });
        return;
      }
      node.isPreview = true;
    }

    set({ selectedNode: node, selectedEdge: null });

    // Aggregate nodes are synthetic — no property fetch needed
    if (node.isAggregate) return;

    // Lazy-fetch full properties if enabled and the node is a lightweight placeholder
    const hasProperties = node.properties && Object.keys(node.properties).length > 0;
    if (!hasProperties && get().autoFetchProperties) {
      set({ loadingSelectedNodeProperties: true });
      const uri = node.id;
      // prioritizeAndFetch moves this URI to the front of the prefetch queue
      // (or waits for an in-flight fetch) and returns the full LodNode.
      prioritizeAndFetch(uri)
        .then((lodNode) => {
          // Update loadedNodes so future selects have properties
          const newLoadedNodes = { ...get().loadedNodes, [uri]: lodNode };

          // Update selectedNode only if it's still the same node
          const currentSelected = get().selectedNode;
          const updatedGraphNode = mapLodNodeToGraphNode(lodNode);

          if (currentSelected?.id === uri) {
            set({
              loadedNodes: newLoadedNodes,
              selectedNode: updatedGraphNode,
              loadingSelectedNodeProperties: false,
            });
          } else {
            set({ loadedNodes: newLoadedNodes, loadingSelectedNodeProperties: false });
          }

          // Refresh the nodes array with updated property data
          get().updateGraphData();
        })
        .catch((err) => {
          console.warn(`[uiSlice] Failed to fetch properties for ${uri}:`, err);
          set({ loadingSelectedNodeProperties: false });
        });
    }

    // Fetch outgoing neighbors on-demand (for display in Propriétés section)
    // Only if autoFetchProperties is enabled and not already fetched
    const uri = node.id;
    const outgoingDone = get().expandedUris.has(uri) || get().outgoingFetchedUris.has(uri);
    if (!outgoingDone && get().autoFetchProperties) {
      get().fetchOutgoingForDisplay(uri);
    }
  },

  /**
   * Fetch outgoing neighbors for display purposes only (Propriétés section).
   * Edges are stored in outgoingDisplayRelations (NOT loadedRelations) so they
   * don't affect BFS graph traversal.
   */
  fetchOutgoingForDisplay: (uri) => {
    const outgoingDone = get().expandedUris.has(uri) || get().outgoingFetchedUris.has(uri);
    if (outgoingDone) return;

    fetchEntityExpand(uri, 'outgoing', 50)
      .then((expandResult) => {
        if (!expandResult?.neighbors) return;
        const newLoadedNodes = { ...get().loadedNodes };
        const newOutgoingDisplayRelations = { ...get().outgoingDisplayRelations };

        // Store the main node with full properties
        if (expandResult.node) {
          newLoadedNodes[uri] = expandResult.node;
        }

        // Store neighbor nodes as placeholders (not added to visible graph)
        for (const n of (expandResult.neighbors.nodes || [])) {
          if (!newLoadedNodes[n.uri]) {
            newLoadedNodes[n.uri] = n;
          }
        }

        // Store outgoing edges in display-only relations (not traversed by BFS)
        for (const e of (expandResult.neighbors.edges || [])) {
          if (!newOutgoingDisplayRelations[e.id]) {
            newOutgoingDisplayRelations[e.id] = e;
          }
        }

        const newOutgoingFetched = new Set(get().outgoingFetchedUris);
        newOutgoingFetched.add(uri);

        // Update selectedNode if still the same
        const currentSelected = get().selectedNode;
        const updatedNode = newLoadedNodes[uri] ? mapLodNodeToGraphNode(newLoadedNodes[uri]) : null;

        set({
          loadedNodes: newLoadedNodes,
          outgoingDisplayRelations: newOutgoingDisplayRelations,
          outgoingFetchedUris: newOutgoingFetched,
          ...(currentSelected?.id === uri && updatedNode ? { selectedNode: updatedNode } : {}),
        });
      })
      .catch((err) => {
        console.warn(`[uiSlice] Failed to fetch outgoing for ${uri}:`, err);
      });
  },
  
  selectEdge: (edgeId) => {
    const edge = get().edges.find(e => e.id === edgeId);
    if (!edge) return;

    set({ selectedEdge: edge, selectedNode: null });
  },

  clearSelection: () => set({ selectedNode: null, selectedEdge: null, rightPanelOpen: false }),
  clearSelectedNode: () => set({ selectedNode: null, selectedEdge: null, rightPanelOpen: false }),
  
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
    const { nodeSettings, pinnedNodes, positions, nodes } = get();
    const allTargets = {};
    let hasRadial = false;

    // Update cached strength (O(1) lookup in getRadialDisplayPos hot path)
    updateRadialCache(nodeSettings);

    for (const [rootId, settings] of Object.entries(nodeSettings)) {
      if (!settings || settings.renderMode !== 'radial') continue;
      hasRadial = true;

      const groupCenter = positions[rootId];
      if (!groupCenter) continue;

      // Build BFS depth map for this root from visible nodes
      // We need to recompute BFS depths locally for radial target computation
      const { loadedRelations, incomingEdgeIds } = get();
      const adjacency = {};
      Object.values(loadedRelations).forEach(rel => {
        const isAggregate = rel.classification === 'aggregate' || rel.tier === 'aggregate';
        if (!adjacency[rel.source]) adjacency[rel.source] = [];
        if (!adjacency[rel.target]) adjacency[rel.target] = [];
        adjacency[rel.source].push(rel.target);
        adjacency[rel.target].push(rel.source);
      });

      const maxDepth = 1; // depth supprimé du système — 1 couche de voisins directs
      const nodeDepthsForGroup = { [rootId]: 0 };
      let currentLevel = [rootId];
      const visited = new Set([rootId]);
      for (let d = 1; d <= maxDepth; d++) {
        const nextLevel = [];
        currentLevel.forEach(nodeId => {
          (adjacency[nodeId] || []).forEach(neighbor => {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              nodeDepthsForGroup[neighbor] = d;
              nextLevel.push(neighbor);
            }
          });
        });
        currentLevel = nextLevel;
        if (currentLevel.length === 0) break;
      }

      const targets = computeRadialTargets({
        groupId: rootId,
        groupCenter,
        nodeDepthsForGroup,
        spacingMode: settings.radialSpacingMode || 'fixed',
        spacing: settings.radialSpacing || 50,
        currentPositions: positions,
      });

      Object.assign(allTargets, targets);
    }

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
  
  // RightPanel actions
  openRightPanel: ({ tab } = {}) => set(state => ({
    rightPanelOpen: true,
    rightPanelActiveTab: tab ?? state.rightPanelActiveTab ?? 'properties',
  })),
  closeRightPanel: () => set({ rightPanelOpen: false }),
  toggleRightPanel: ({ tab } = {}) => {
    const state = get();
    if (state.rightPanelOpen) {
      set({ rightPanelOpen: false });
    } else {
      set({ rightPanelOpen: true, rightPanelActiveTab: tab ?? state.rightPanelActiveTab ?? 'properties' });
    }
  },
  setRightPanelTab: (tab) => set({ rightPanelActiveTab: tab }),

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
      showRelations: true,
      showBackground: false
    });
  },
});
