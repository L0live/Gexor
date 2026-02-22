/**
 * sharedPositions.js — Module-level singleton for SharedArrayBuffer position I/O.
 *
 * The hook (useForceLayout) sets the SAB + nodeIndexMap once after graph init.
 * Rendering components (InstancedNodes/Edges, Scene) read positions via
 * readPosition() in their useFrame loop — zero allocation, zero message-passing.
 *
 * Layout writes happen from the main thread after each force.execute() batch.
 * Drag writes happen synchronously from Scene.jsx.
 *
 * Falls back gracefully: when SAB is unavailable, readPosition returns null
 * and consumers use the Zustand positions map instead.
 */

import { SAB_POSITION_STRIDE, MAX_INSTANCES } from '../constants/graphConstants';

// ── Module-level state ─────────────────────────────────────────────────────
let _sab = null;            // SharedArrayBuffer (or null)
let _f32 = null;            // Float32Array view over _sab
let _nodeIndexMap = {};      // { [nodeId]: number }  → index into _f32
let _reverseMap = [];        // index → nodeId  (rebuilt on setPositionBuffer)

// ── Feature detection ──────────────────────────────────────────────────────
export function canUseSharedArrayBuffer() {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined'
    );
  } catch {
    return false;
  }
}

// ── Buffer lifecycle ───────────────────────────────────────────────────────

/**
 * Allocate (or re-allocate) the SAB and build the index maps.
 * Called by useForceLayout whenever the node list changes.
 *
 * @param {Object} nodeIndexMap  { [nodeId]: arrayIndex }
 * @returns {{ sab: SharedArrayBuffer, f32: Float32Array } | null}
 */
export function createPositionBuffer(nodeIndexMap) {
  _nodeIndexMap = nodeIndexMap;
  _reverseMap = Object.entries(nodeIndexMap).reduce((arr, [id, idx]) => {
    arr[idx] = id;
    return arr;
  }, []);

  if (!canUseSharedArrayBuffer()) {
    _sab = null;
    _f32 = null;
    return null;
  }

  // Pre-allocate for MAX_INSTANCES to avoid re-allocation on node addition
  const byteLength = MAX_INSTANCES * SAB_POSITION_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  _sab = new SharedArrayBuffer(byteLength);
  _f32 = new Float32Array(_sab);
  return { sab: _sab, f32: _f32 };
}

/**
 * Update only the node index map (e.g. after filtering changes node set).
 */
export function setNodeIndexMap(nodeIndexMap) {
  _nodeIndexMap = nodeIndexMap;
  _reverseMap = Object.entries(nodeIndexMap).reduce((arr, [id, idx]) => {
    arr[idx] = id;
    return arr;
  }, []);
}

/**
 * Get the current Float32Array view (may be null).
 */
export function getPositionF32() {
  return _f32;
}

/**
 * Get the current node index map.
 */
export function getNodeIndexMap() {
  return _nodeIndexMap;
}

// ── Read / Write ───────────────────────────────────────────────────────────

/**
 * Read a node's position from the SAB.
 * Returns { x, y, z } or null if SAB is unavailable or nodeId is unknown.
 *
 * @param {string} nodeId
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function readPosition(nodeId) {
  if (!_f32) return null;
  const idx = _nodeIndexMap[nodeId];
  if (idx === undefined) return null;
  const offset = idx * SAB_POSITION_STRIDE;
  return {
    x: _f32[offset],
    y: _f32[offset + 1],
    z: _f32[offset + 2],
  };
}

/**
 * Write a node's position into the SAB.
 * Used by drag (Scene.jsx) and layout results.
 *
 * @param {string} nodeId
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function writePosition(nodeId, x, y, z) {
  if (!_f32) return;
  const idx = _nodeIndexMap[nodeId];
  if (idx === undefined) return;
  const offset = idx * SAB_POSITION_STRIDE;
  _f32[offset] = x;
  _f32[offset + 1] = y;
  _f32[offset + 2] = z;
}

/**
 * Bulk-write all positions from a { [nodeId]: {x, y, z} } map.
 * Called after force.execute() completes.
 *
 * @param {Object} positionsMap  { [nodeId]: { x, y, z } }
 */
export function writeAllPositions(positionsMap) {
  if (!_f32) return;
  for (const nodeId in positionsMap) {
    const idx = _nodeIndexMap[nodeId];
    if (idx === undefined) continue;
    const offset = idx * SAB_POSITION_STRIDE;
    const p = positionsMap[nodeId];
    _f32[offset] = p.x;
    _f32[offset + 1] = p.y;
    _f32[offset + 2] = p.z;
  }
}

/**
 * Read ALL positions from SAB into a plain { [nodeId]: {x,y,z} } map.
 * Used for cold-path sync to Zustand store and history snapshots.
 *
 * @returns {Object}  { [nodeId]: { x, y, z } }
 */
export function readAllPositions() {
  if (!_f32) return {};
  const out = {};
  for (let i = 0; i < _reverseMap.length; i++) {
    const nodeId = _reverseMap[i];
    if (!nodeId) continue;
    const offset = i * SAB_POSITION_STRIDE;
    out[nodeId] = {
      x: _f32[offset],
      y: _f32[offset + 1],
      z: _f32[offset + 2],
    };
  }
  return out;
}
