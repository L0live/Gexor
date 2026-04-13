/**
 * useForceLayout — Manages @antv/layout-wasm ForceLayout (replaces old
 * ngraph-based Web Worker).
 *
 * Architecture
 * ────────────
 * • @antv/layout-wasm spawns its own internal Comlink Worker, so we do NOT
 *   create an additional Web Worker.
 * • SharedArrayBuffer (when available) stores positions — rendering
 *   components read from it in useFrame with zero allocation.
 * • A proxy `layoutInstance` is exposed via Zustand so existing code that
 *   calls `worker.postMessage({ type: '…' })` keeps working unchanged.
 * • Layout is batch on-demand: `force.execute(graph)` runs until convergence
 *   (or maxIteration).  Wake / perturbation triggers a new batch.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Graph } from '@antv/graphlib';
import { ForceLayout, initThreads, supportsThreads } from '@antv/layout-wasm';
import useGraphStore from '../store/useGraphStore';
import { FORCE_LAYOUT_DEFAULTS } from '../constants/graphConstants';
import { NODE_RADIUS } from '../constants/graphConstants';
import {
  createPositionBuffer,
  writeAllPositions,
  writePosition,
  readAllPositions,
  setNodeIndexMap,
} from '../utils/sharedPositions';

// ============================================================================

const useForceLayout = () => {
  /* ── Zustand selectors (stable references) ─────────────────────────────── */
  const nodes = useGraphStore(state => state.nodes);
  const edges = useGraphStore(state => state.edges);
  const setLayoutRunning = useGraphStore(state => state.setLayoutRunning);
  const setLayoutProgress = useGraphStore(state => state.setLayoutProgress);
  const setLayoutReady = useGraphStore(state => state.setLayoutReady);
  const setLayoutInstance = useGraphStore(state => state.setLayoutInstance);

  /* ── Local state & refs ────────────────────────────────────────────────── */
  const [isInitialized, setIsInitialized] = useState(false);
  const threadsRef = useRef(null);
  const graphRef = useRef(null);                   // @antv/graphlib Graph
  const layoutRunningRef = useRef(false);
  const pendingWakeRef = useRef(false);
  const simulationDoneResolveRef = useRef(null);   // Promise resolver
  const proxyRef = useRef(null);                   // stable proxy object
  const forceRef = useRef(null);                   // persistent ForceLayout — reused across batches
  const forceThreadsRef = useRef(null);            // threads object used to build forceRef (for invalidation)

  // ── Proxy message handler (backward compat) ─────────────────────────────
  //    Every place that previously did `worker.postMessage(msg)` now calls
  //    `layoutProxy.postMessage(msg)` — same interface, no worker.

  const handleProxyMessage = useCallback((msg) => {
    switch (msg.type) {
      /* Layout triggers */
      case 'wake':
      case 'resetAllPhysics':
        triggerWake();
        break;

      /* Drag body position – write to SAB + graph model */
      case 'setBodyPosition': {
        writePosition(msg.nodeId, msg.x, msg.y, msg.z);
        const graph = graphRef.current;
        if (graph && graph.hasNode(msg.nodeId)) {
          graph.mergeNodeData(msg.nodeId, { x: msg.x, y: msg.y, z: msg.z });
        }
        break;
      }

      /* History undo/redo: restore positions in bulk */
      case 'restorePositions': {
        const { positions, pinnedNodes } = msg;
        if (!positions) break;
        const graph = graphRef.current;
        for (const nodeId in positions) {
          if (graph && graph.hasNode(nodeId)) {
            graph.mergeNodeData(nodeId, {
              x: positions[nodeId].x,
              y: positions[nodeId].y,
              z: positions[nodeId].z,
            });
          }
        }
        writeAllPositions(positions);
        useGraphStore.getState().setPositions(positions);
        break;
      }

      /* These are already managed by Zustand slices — no physics action */
      case 'setDraggedNode':
      case 'pinNode':
      case 'unpinNode':
      case 'pinAllNodes':
      case 'unpinAllNodes':
      case 'pinNodes':
      case 'repinNodes':
      case 'resetVelocity':
      case 'pause':
      case 'setPinnedNodes':
        break;

      default:
        break;
    }
  }, []);

  // ── Internal helpers ─────────────────────────────────────────────────────

  /** Schedule a layout batch.  Debounced if one is already running. */
  const triggerWake = useCallback(() => {
    if (layoutRunningRef.current) {
      pendingWakeRef.current = true;
      return;
    }
    runLayoutBatchInternal(200);
  }, []);

  /** Core layout execution — single ForceLayout instance per run (UI-2 fix).
   *  Positions written to SAB at end only (PERF-6 fix). */
  const runLayoutBatchInternal = useCallback(async (iterations = 500) => {
    const graph = graphRef.current;
    const threads = threadsRef.current;
    if (!graph || !threads) return;
    if (layoutRunningRef.current) {
      pendingWakeRef.current = true;
      return;
    }

    layoutRunningRef.current = true;

    const { pinnedNodes, draggedNodeId } = useGraphStore.getState();

    // Snapshot pinned positions — they must not move
    const pinnedPositions = {};
    pinnedNodes.forEach(nodeId => {
      if (graph.hasNode(nodeId)) {
        const nd = graph.getNode(nodeId);
        pinnedPositions[nodeId] = { x: nd.data.x, y: nd.data.y, z: nd.data.z };
      }
    });
    if (draggedNodeId && graph.hasNode(draggedNodeId)) {
      const nd = graph.getNode(draggedNodeId);
      pinnedPositions[draggedNodeId] = { x: nd.data.x, y: nd.data.y, z: nd.data.z };
    }

    // Reuse persistent ForceLayout instance — creates a new thread pool only when
    // threads change (e.g. single-thread fallback). FORCE_LAYOUT_DEFAULTS.maxIteration (500)
    // is used as the cap; minMovement: 0.01 ensures early-exit for already-converged layouts.
    const getOrCreateForce = (t) => {
      if (!forceRef.current || forceThreadsRef.current !== t) {
        forceRef.current = new ForceLayout({ threads: t, ...FORCE_LAYOUT_DEFAULTS, distanceThresholdMode: 'max' });
        forceThreadsRef.current = t;
      }
      return forceRef.current;
    };

    try {
      let result;
      try {
        result = await getOrCreateForce(threads).execute(graph);
      } catch (err) {
        console.warn('[useForceLayout] multi-thread failed, falling back to single-thread:', err.message);
        const stThreads = await initThreads(false);
        threadsRef.current = stThreads;
        result = await getOrCreateForce(stThreads).execute(graph);
      }

      // Build positions map and restore pinned nodes
      const newPositions = {};
      result.nodes.forEach(n => {
        if (pinnedPositions[n.id]) {
          const pp = pinnedPositions[n.id];
          graph.mergeNodeData(n.id, { x: pp.x, y: pp.y, z: pp.z });
          newPositions[n.id] = pp;
        } else {
          graph.mergeNodeData(n.id, {
            x: n.data.x,
            y: n.data.y,
            z: n.data.z ?? 0,
          });
          newPositions[n.id] = {
            x: n.data.x,
            y: n.data.y,
            z: n.data.z ?? 0,
          };
        }
      });

      // Write to SAB + Zustand once at the end (PERF-6)
      writeAllPositions(newPositions);
      useGraphStore.getState().setPositions(newPositions);
      useGraphStore.getState().setLayoutReady(true);
    } catch (err) {
      console.error('[useForceLayout] layout execution failed:', err.message);
    }

    // Finalize
    layoutRunningRef.current = false;
    useGraphStore.getState().setLayoutRunning(false);
    useGraphStore.getState().setLayoutProgress(100);
    useGraphStore.getState().setLayoutReady(true);
    useGraphStore.getState().setSimulationStable(true);

    if (simulationDoneResolveRef.current) {
      simulationDoneResolveRef.current();
      simulationDoneResolveRef.current = null;
    }

    // Drain pending wake
    if (pendingWakeRef.current) {
      pendingWakeRef.current = false;
      queueMicrotask(() => runLayoutBatchInternal(200));
    }
  }, []);

  // ── Initialise WASM threads (once) ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Suppress uncaught WASM worker errors (rayon may crash in some browsers)
    const swallowWasmCrash = (e) => {
      const msg = e?.message || e?.reason?.message || e?.reason?.toString?.() || '';
      if (msg.includes('unreachable') || msg.includes('RuntimeError')) {
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
        console.warn('[useForceLayout] Suppressed WASM worker crash (rayon thread_local)');
        return true;
      }
    };
    window.addEventListener('error', swallowWasmCrash, true);
    window.addEventListener('unhandledrejection', swallowWasmCrash, true);

    async function init() {
      try {
        const supported = await supportsThreads();
        const threads = await initThreads(supported);
        if (cancelled) return;
        threadsRef.current = threads;
      } catch (err) {
        console.warn('[useForceLayout] multi-thread init failed, trying single-thread:', err.message);
        try {
          const threads = await initThreads(false);
          if (cancelled) return;
          threadsRef.current = threads;
        } catch (err2) {
          console.error('[useForceLayout] WASM init failed completely:', err2.message);
          window.removeEventListener('error', swallowWasmCrash, true);
          window.removeEventListener('unhandledrejection', swallowWasmCrash, true);
          // Still mark as initialized so the app isn't stuck waiting
          setIsInitialized(true);
          return;
        }
      }

      // Keep crash handler alive — crossbeam can panic during force.execute()
      // It will be cleaned up when the component unmounts

      // Expose proxy as layoutInstance
      const proxy = {
        postMessage: (msg) => handleProxyMessage(msg),
      };
      proxyRef.current = proxy;
      setLayoutInstance(proxy);
      setIsInitialized(true);
    }

    init();
    return () => {
      cancelled = true;
      window.removeEventListener('error', swallowWasmCrash, true);
      window.removeEventListener('unhandledrejection', swallowWasmCrash, true);
    };
  }, [handleProxyMessage, setLayoutInstance]);

  // ── Helper: compute initial position for a new node ──────────────────────
  const computeNewNodePosition = useCallback((nodeId, edgesList, currentPositions) => {
    // Find a connected neighbour with a known position
    let parentPos = null;
    for (const e of edgesList) {
      if (e.source === nodeId && currentPositions[e.target]) {
        parentPos = currentPositions[e.target]; break;
      }
      if (e.target === nodeId && currentPositions[e.source]) {
        parentPos = currentPositions[e.source]; break;
      }
    }

    if (parentPos) {
      // PERF-5: spawn at linkDistance*0.5 in a random direction (not ±2.5)
      const spawnDist = FORCE_LAYOUT_DEFAULTS.linkDistance * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      return {
        x: parentPos.x + spawnDist * Math.sin(phi) * Math.cos(theta),
        y: parentPos.y + spawnDist * Math.sin(phi) * Math.sin(theta),
        z: parentPos.z + spawnDist * Math.cos(phi),
      };
    }
    return {
      x: (Math.random() - 0.5) * 40,
      y: (Math.random() - 0.5) * 40,
      z: (Math.random() - 0.5) * 40,
    };
  }, []);

  // ── Build / incrementally update @antv/graphlib Graph on data changes ───
  // PERF-1: Diff-based incremental update instead of full rebuild every time
  useEffect(() => {
    if (!threadsRef.current) return;

    const { positions: currentPositions } = useGraphStore.getState();

    if (!nodes || nodes.length === 0) {
      graphRef.current = null;
      return;
    }

    // Connection counts for mass & nodeSize
    const connectionCounts = {};
    edges.forEach(e => {
      connectionCounts[e.source] = (connectionCounts[e.source] || 0) + 1;
      connectionCounts[e.target] = (connectionCounts[e.target] || 0) + 1;
    });

    const newNodeIds = new Set(nodes.map(n => n.id));
    const graph = graphRef.current;
    let structureChanged = false;

    if (graph && graph.getAllNodes().length > 0) {
      // ── Incremental diff ─────────────────────────────────────────────
      const existingNodeIds = new Set(graph.getAllNodes().map(n => n.id));

      // Remove nodes no longer present
      for (const oldId of existingNodeIds) {
        if (!newNodeIds.has(oldId)) {
          // Remove edges connected to this node first
          try {
            const related = graph.getRelatedEdges(oldId);
            for (const e of related) graph.removeEdge(e.id);
          } catch (_) { /* node may already be disconnected */ }
          graph.removeNode(oldId);
          structureChanged = true;
        }
      }

      // Add new nodes
      for (const n of nodes) {
        if (!existingNodeIds.has(n.id)) {
          const degree = connectionCounts[n.id] || 0;
          const pos = currentPositions[n.id] || computeNewNodePosition(n.id, edges, currentPositions);
          graph.addNode({
            id: n.id,
            data: {
              x: pos.x, y: pos.y, z: pos.z,
              mass: 1 + Math.log(degree + 1) * 0.5,
              nodeSize: NODE_RADIUS * 2 + Math.log(degree + 1) * 3, // PERF-2
            },
          });
          structureChanged = true;
        } else {
          // Update mass/nodeSize for existing nodes (degree may have changed)
          const degree = connectionCounts[n.id] || 0;
          graph.mergeNodeData(n.id, {
            mass: 1 + Math.log(degree + 1) * 0.5,
            nodeSize: NODE_RADIUS * 2 + Math.log(degree + 1) * 3,
          });
        }
      }

      // Diff edges
      const existingEdgeIds = new Set(graph.getAllEdges().map(e => e.id));
      const newEdgeSet = new Set();
      const validNodeIds = new Set(graph.getAllNodes().map(n => n.id));
      let edgeIdx = existingEdgeIds.size;
      edges.forEach(e => {
        if (!validNodeIds.has(e.source) || !validNodeIds.has(e.target)) return;
        const edgeId = `e_${e.source}_${e.target}`;
        newEdgeSet.add(edgeId);
        if (!existingEdgeIds.has(edgeId)) {
          graph.addEdge({ id: edgeId, source: e.source, target: e.target, data: { weight: 1 } });
          structureChanged = true;
        }
      });
      for (const oldEdgeId of existingEdgeIds) {
        if (!newEdgeSet.has(oldEdgeId)) {
          graph.removeEdge(oldEdgeId);
          structureChanged = true;
        }
      }
    } else {
      // ── First build: create graph from scratch ──────────────────────
      const newGraph = new Graph();

      for (const n of nodes) {
        const degree = connectionCounts[n.id] || 0;
        const pos = currentPositions[n.id] || computeNewNodePosition(n.id, edges, currentPositions);
        newGraph.addNode({
          id: n.id,
          data: {
            x: pos.x, y: pos.y, z: pos.z,
            mass: 1 + Math.log(degree + 1) * 0.5,
            nodeSize: NODE_RADIUS * 2 + Math.log(degree + 1) * 3, // PERF-2
          },
        });
      }

      edges.forEach(e => {
        if (newNodeIds.has(e.source) && newNodeIds.has(e.target)) {
          newGraph.addEdge({
            id: `e_${e.source}_${e.target}`,
            source: e.source,
            target: e.target,
            data: { weight: 1 },
          });
        }
      });

      graphRef.current = newGraph;
      structureChanged = true;
    }

    // Rebuild SAB index (needed even for incremental — node order may change)
    const currentGraph = graphRef.current;
    const allNodes = currentGraph.getAllNodes();
    const nodeIndexMap = {};
    allNodes.forEach((n, i) => { nodeIndexMap[n.id] = i; });
    createPositionBuffer(nodeIndexMap);

    // Write positions to SAB + Zustand
    const initPositions = {};
    allNodes.forEach(nd => {
      initPositions[nd.id] = { x: nd.data.x, y: nd.data.y, z: nd.data.z };
    });
    writeAllPositions(initPositions);
    useGraphStore.getState().setPositions({ ...currentPositions, ...initPositions });

    // Only wake simulation if graph structure actually changed
    if (structureChanged && allNodes.length > 0) {
      if (layoutRunningRef.current) {
        pendingWakeRef.current = true;
      } else {
        runLayoutBatchInternal(200);
      }
    }
  }, [nodes, edges, isInitialized, runLayoutBatchInternal, computeNewNodePosition]);

  // ── Public API ─────────────────────────────────────────────────────────

  /** Run burst simulation (returns a Promise resolved on completion). */
  const runSimulation = useCallback((iterations = 400) => {
    if (!graphRef.current || !threadsRef.current) {
      useGraphStore.getState().setLayoutReady(true);
      return Promise.resolve();
    }

    useGraphStore.getState().setSimulationStable(false);
    useGraphStore.getState().setLayoutRunning(true);
    useGraphStore.getState().setLayoutProgress(0);

    const promise = new Promise(resolve => {
      simulationDoneResolveRef.current = resolve;
    });

    runLayoutBatchInternal(iterations);
    return promise;
  }, [runLayoutBatchInternal]);

  /** Stop any running simulation. */
  const stopSimulation = useCallback(() => {
    layoutRunningRef.current = false;
    pendingWakeRef.current = false;
    useGraphStore.getState().setLayoutRunning(false);
  }, []);

  return { runSimulation, stopSimulation, isInitialized };
};

export default useForceLayout;
