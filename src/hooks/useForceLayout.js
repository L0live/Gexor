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

  /** Core layout execution — runs force.execute in small batches. */
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
    // Also keep dragged node fixed
    if (draggedNodeId && graph.hasNode(draggedNodeId)) {
      const nd = graph.getNode(draggedNodeId);
      pinnedPositions[draggedNodeId] = { x: nd.data.x, y: nd.data.y, z: nd.data.z };
    }

    // Run in batches for progress feedback
    const batchSize = 100;
    const numBatches = Math.ceil(iterations / batchSize);
    let readySent = false;

    for (let i = 0; i < numBatches; i++) {
      try {
        const force = new ForceLayout({
          threads,
          ...FORCE_LAYOUT_DEFAULTS,
          maxIteration: batchSize,
        });

        const result = await force.execute(graph);

        // Build new positions map
        const newPositions = {};
        result.nodes.forEach(n => {
          if (pinnedPositions[n.id]) {
            // Restore pinned/dragged to saved position
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

        // Sync SAB + Zustand
        writeAllPositions(newPositions);
        useGraphStore.getState().setPositions(newPositions);

        // Progress
        const progress = Math.min(95, ((i + 1) / numBatches) * 95);
        useGraphStore.getState().setLayoutProgress(progress);

        if (!readySent) {
          useGraphStore.getState().setLayoutReady(true);
          readySent = true;
        }
      } catch (err) {
        console.warn('[useForceLayout] batch failed, falling back to single-thread:', err.message);
        // Re-init threads in single-thread mode and retry this batch
        try {
          const stThreads = await initThreads(false);
          threadsRef.current = stThreads;
          const retryForce = new ForceLayout({
            threads: stThreads,
            ...FORCE_LAYOUT_DEFAULTS,
            maxIteration: batchSize,
          });
          const retryResult = await retryForce.execute(graph);
          const newPositions = {};
          retryResult.nodes.forEach(n => {
            if (pinnedPositions[n.id]) {
              const pp = pinnedPositions[n.id];
              graph.mergeNodeData(n.id, { x: pp.x, y: pp.y, z: pp.z });
              newPositions[n.id] = pp;
            } else {
              graph.mergeNodeData(n.id, { x: n.data.x, y: n.data.y, z: n.data.z ?? 0 });
              newPositions[n.id] = { x: n.data.x, y: n.data.y, z: n.data.z ?? 0 };
            }
          });
          writeAllPositions(newPositions);
          useGraphStore.getState().setPositions(newPositions);
          if (!readySent) {
            useGraphStore.getState().setLayoutReady(true);
            readySent = true;
          }
        } catch (err2) {
          console.error('[useForceLayout] single-thread fallback also failed:', err2.message);
          break;
        }
      }
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

    // Drain pending wake — queueMicrotask runs before the next macrotask
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

  // ── Build / rebuild @antv/graphlib Graph on data changes ───────────────
  useEffect(() => {
    if (!threadsRef.current) return;

    const { positions: currentPositions, pinnedNodes } = useGraphStore.getState();

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

    // All nodes are visible (no category filters)
    const filteredNodes = nodes;

    // Build nodeIndexMap & SAB
    const nodeIndexMap = {};
    filteredNodes.forEach((n, i) => { nodeIndexMap[n.id] = i; });
    createPositionBuffer(nodeIndexMap);

    // Create fresh Graph
    const graph = new Graph();

    filteredNodes.forEach(n => {
      const degree = connectionCounts[n.id] || 0;
      const existingPos = currentPositions[n.id];

      let x, y, z;
      if (existingPos) {
        x = existingPos.x;
        y = existingPos.y;
        z = existingPos.z;
      } else {
        // Position new nodes near a connected neighbour
        let parentPos = null;
        for (const e of edges) {
          if (e.source === n.id && currentPositions[e.target]) {
            parentPos = currentPositions[e.target];
            break;
          }
          if (e.target === n.id && currentPositions[e.source]) {
            parentPos = currentPositions[e.source];
            break;
          }
        }

        if (parentPos) {
          const off = 5;
          x = parentPos.x + (Math.random() - 0.5) * off;
          y = parentPos.y + (Math.random() - 0.5) * off;
          z = parentPos.z + (Math.random() - 0.5) * off;
        } else {
          x = (Math.random() - 0.5) * 40;
          y = (Math.random() - 0.5) * 40;
          z = (Math.random() - 0.5) * 40;
        }
      }

      graph.addNode({
        id: n.id,
        data: {
          x, y, z,
          mass: 1 + Math.log(degree + 1) * 0.5,
          // nodeSize as proxy for per-node repulsion (larger → bigger exclusion zone)
          nodeSize: (degree + 1) * 2,
        },
      });
    });

    // Add edges
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    let edgeIdx = 0;
    edges.forEach(e => {
      if (filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)) {
        graph.addEdge({
          id: `e_${edgeIdx++}`,
          source: e.source,
          target: e.target,
          data: { weight: 1 },
        });
      }
    });

    graphRef.current = graph;

    // Write initial positions to SAB + Zustand
    const initPositions = {};
    const allNodes = graph.getAllNodes();
    allNodes.forEach(nd => {
      initPositions[nd.id] = { x: nd.data.x, y: nd.data.y, z: nd.data.z };
    });
    writeAllPositions(initPositions);
    useGraphStore.getState().setPositions({ ...currentPositions, ...initPositions });

    // Auto-wake the simulation when the graph structure changes.
    // The graphRef is now up-to-date, so the layout will run on the correct graph.
    // If a layout is already running (from a prior stale wake), queue a pending
    // wake so it re-runs with the new graph once the current batch finishes.
    if (graph.getAllNodes().length > 0) {
      if (layoutRunningRef.current) {
        pendingWakeRef.current = true;
      } else {
        runLayoutBatchInternal(200);
      }
    }
  }, [nodes, edges, isInitialized, runLayoutBatchInternal]);

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
