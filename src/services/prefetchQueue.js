/**
 * prefetchQueue — Background pre-loading of node properties
 *
 * Every neighbor placeholder added to the graph is enqueued here so its full
 * properties are fetched in the background before the user clicks on it.
 * When the user selects a node, prioritizeAndFetch() moves it to the front of
 * the queue (or waits for an in-flight fetch) so the details panel fills
 * instantly instead of waiting for a fresh API call.
 *
 * Usage:
 *   initPrefetchQueue(getState, setState)  — call once after store creation
 *   enqueue(uri)                           — add a placeholder to the queue
 *   prioritizeAndFetch(uri)               — returns Promise<LodNode>, priority
 */

import { fetchNodeProperties } from './queries/wikidata';
import * as cache from './cacheService';

// ── Internal state ────────────────────────────────────────────────────────
/** @type {string[]} Ordered list of URIs waiting to be pre-fetched */
const _queue = [];

/** @type {Map<string, Array<{resolve: Function, reject: Function}>>} */
const _callbacks = new Map();

/** True while the async worker loop is running */
let _processing = false;

/** URIs requested by the user (selectNode) — bypass simulation-idle wait */
const _priorityUris = new Set();

/** Injected by initPrefetchQueue */
let _getState = null;
let _setState = null;
/** Store reference for subscribe() — eliminates polling in _watchExternalFetch */
let _store = null;

// ── Initialisation ────────────────────────────────────────────────────────

/**
 * Register the Zustand store accessors. Must be called once after the store
 * is created (in useGraphStore.js).
 *
 * @param {() => object} getState — useGraphStore.getState
 * @param {(partial: object) => void} setState — useGraphStore.setState
 * @param {object} store — the full store object (for subscribe)
 */
export const initPrefetchQueue = (getState, setState, store) => {
  _getState = getState;
  _setState = setState;
  _store = store;
};

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Remove a URI from the queue and reject any pending callbacks.
 * Used when a node is removed from the graph to cancel unnecessary fetches.
 *
 * @param {string} uri — Wikidata entity URI
 */
export const dequeue = (uri) => {
  const idx = _queue.indexOf(uri);
  if (idx !== -1) _queue.splice(idx, 1);
  _priorityUris.delete(uri);
  // Reject pending callbacks
  const cbs = _callbacks.get(uri);
  if (cbs) {
    for (const { reject } of cbs) {
      reject(new Error(`dequeued: ${uri}`));
    }
    _callbacks.delete(uri);
  }
};

/**
 * Enqueue a URI for background pre-fetching (low priority, added at the end).
 * Silently ignores URIs that are already loaded, loading, or queued.
 *
 * @param {string} uri — Wikidata entity URI
 */
export const enqueue = (uri) => {
  if (!_getState) return;
  const state = _getState();

  // Skip if already fully loaded with properties
  const existing = state.loadedNodes?.[uri];
  if (existing?.properties && Object.keys(existing.properties).length > 0) return;

  // Skip if already being fetched by fetchAndExpandNode
  if (state.loadingUris?.has(uri)) return;

  // Skip if already in the queue or has pending callbacks
  if (_queue.includes(uri) || _callbacks.has(uri)) return;

  _queue.push(uri);
  console.debug(`[prefetchQueue] enqueue ${uri} (queue size: ${_queue.length})`);
  _startWorker();
};

/**
 * Promote a URI to the front of the queue and return a Promise that resolves
 * with the LodNode once its properties are loaded.
 *
 * If the node is already fully loaded, the Promise resolves immediately.
 * If it is currently being fetched by fetchAndExpandNode (loadingUris), the
 * Promise polls until that fetch completes.
 *
 * @param {string} uri — Wikidata entity URI
 * @returns {Promise<import('./queries/wikidata').LodNode>}
 */
export const prioritizeAndFetch = (uri) => {
  if (!_getState) return Promise.reject(new Error('prefetchQueue not initialized'));

  const state = _getState();

  // Already fully loaded — resolve immediately
  const existing = state.loadedNodes?.[uri];
  if (existing?.properties && Object.keys(existing.properties).length > 0) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    // Register callback before touching the queue
    if (!_callbacks.has(uri)) {
      _callbacks.set(uri, []);
    }
    _callbacks.get(uri).push({ resolve, reject });

    // Mark as priority so the worker skips the simulation-idle wait
    _priorityUris.add(uri);

    // If the store's fetchAndExpandNode is already loading this URI, just poll —
    // the callback will be resolved by our polling watcher (see _watchExternalFetch).
    if (state.loadingUris?.has(uri)) {
      _watchExternalFetch(uri);
      return;
    }

    // Move to front of queue (remove any existing occurrence first)
    const idx = _queue.indexOf(uri);
    if (idx !== -1) _queue.splice(idx, 1);
    _queue.unshift(uri);

    _startWorker();
  });
};

// ── Internal worker ───────────────────────────────────────────────────────

const _startWorker = () => {
  if (_processing) return;
  _processQueue();
};

const _processQueue = async () => {
  _processing = true;
  console.debug('[prefetchQueue] worker started');

  while (_queue.length > 0) {
    const uri = _queue[0];

    // Pause while the force layout is running or the simulation is active and
    // not yet stable — but only for background (non-priority) prefetches.
    // User-selected nodes (prioritizeAndFetch) must be processed immediately.
    if (!_priorityUris.has(uri)) {
      await _waitForSimulationIdle();
      // Small gap between background fetches to avoid bursting the rate limiter
      await new Promise(r => setTimeout(r, 120));
    }

    _queue.shift();
    _priorityUris.delete(uri);
    const state = _getState();

    // Already fully loaded (e.g. by fetchAndExpandNode between our enqueue and now)
    const existing = state.loadedNodes?.[uri];
    if (existing?.properties && Object.keys(existing.properties).length > 0) {
      _resolveCallbacks(uri, existing);
      continue;
    }

    // fetchAndExpandNode is concurrently loading this URI — hand off to watcher
    if (state.loadingUris?.has(uri)) {
      _watchExternalFetch(uri);
      continue;
    }

    // Mark as loading in the store (keeps loadingUris / UI spinner consistent)
    _setState(s => ({
      loadingUris: new Set([...s.loadingUris, uri]),
      sparqlRequestCount: s.sparqlRequestCount + 1,
    }));

    try {
      // Honour the cache before hitting the network
      const cacheKey = cache.cacheKey('wikidata', `node:${uri}`);
      let lodNode = await cache.get(cacheKey);

      if (!lodNode || !lodNode.properties || Object.keys(lodNode.properties).length === 0) {
        lodNode = await fetchNodeProperties(uri);
        await cache.set(cacheKey, lodNode, 'wikidata');
      }

      // Merge into the store
      _setState(s => {
        const newLoadedNodes = { ...s.loadedNodes, [uri]: lodNode };
        const newLoadingUris = new Set(s.loadingUris);
        newLoadingUris.delete(uri);
        return {
          loadedNodes: newLoadedNodes,
          loadingUris: newLoadingUris,
          sparqlRequestCount: Math.max(0, s.sparqlRequestCount - 1),
        };
      });

      // Do NOT call updateGraphData() here — background property fetches only
      // enrich `loadedNodes`, they don't change graph structure (nodes/edges).
      // Calling it would re-trigger the force layout for every queued node.
      // selectNode's .then() handler calls updateGraphData() once when needed.
      _resolveCallbacks(uri, lodNode);
      console.debug(`[prefetchQueue] prefetched ${uri}`);
    } catch (err) {
      console.warn(`[prefetchQueue] failed to prefetch ${uri}:`, err);
      _setState(s => {
        const newLoadingUris = new Set(s.loadingUris);
        newLoadingUris.delete(uri);
        return {
          loadingUris: newLoadingUris,
          sparqlRequestCount: Math.max(0, s.sparqlRequestCount - 1),
        };
      });
      _rejectCallbacks(uri, err);
    }
  }

  _processing = false;
  console.debug('[prefetchQueue] worker idle');
};

/**
 * Watch until fetchAndExpandNode finishes loading a URI that was already
 * in-flight when we tried to process it. Uses Zustand subscribe for zero-latency
 * detection instead of polling every 200ms for up to 30 seconds.
 *
 * @param {string} uri
 */
const _watchExternalFetch = (uri) => {
  // Resolve or re-queue based on current store state
  const _resolve = (state) => {
    const node = state.loadedNodes?.[uri];
    if (node?.properties && Object.keys(node.properties).length > 0) {
      _resolveCallbacks(uri, node);
    } else {
      // External fetch failed — take over
      _queue.unshift(uri);
      _startWorker();
    }
  };

  // Fast path: already done by the time we check
  const current = _getState();
  if (!current.loadingUris?.has(uri)) {
    _resolve(current);
    return;
  }

  let unsubscribe = null;

  // 30s hard timeout — gives up and rejects if external fetch hangs
  const timeout = setTimeout(() => {
    if (unsubscribe) unsubscribe();
    _rejectCallbacks(uri, new Error(`[prefetchQueue] timeout waiting for external fetch: ${uri}`));
  }, 30_000);

  // Subscribe to store changes — fires synchronously when loadingUris changes
  unsubscribe = (_store || { subscribe: (fn) => { fn(_getState()); return () => {}; } }).subscribe((state) => {
    if (state.loadingUris?.has(uri)) return; // still loading
    clearTimeout(timeout);
    unsubscribe();
    _resolve(state);
  });
};

// ── Callback helpers ──────────────────────────────────────────────────────

/**
 * Resolve after the force layout and simulation have settled.
 * The queue worker calls this before each prefetch to avoid hammering the
 * store with state updates while physics is running.
 */
const _waitForSimulationIdle = () => new Promise(resolve => {
  const check = () => {
    if (!_getState) { resolve(); return; }
    const { layoutRunning, simulationActive, simulationStable } = _getState();
    // Idle = no layout running AND (simulation stopped or stable)
    if (!layoutRunning && (!simulationActive || simulationStable)) {
      resolve();
    } else {
      setTimeout(check, 300);
    }
  };
  check();
});

const _resolveCallbacks = (uri, lodNode) => {
  _priorityUris.delete(uri);
  const cbs = _callbacks.get(uri);
  if (cbs) {
    cbs.forEach(({ resolve }) => resolve(lodNode));
    _callbacks.delete(uri);
  }
};

const _rejectCallbacks = (uri, err) => {
  _priorityUris.delete(uri);
  const cbs = _callbacks.get(uri);
  if (cbs) {
    cbs.forEach(({ reject }) => reject(err));
    _callbacks.delete(uri);
  }
};
