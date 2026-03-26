/**
 * radialLayout.js — Fibonacci Sphere distribution & radial target computation
 * 
 * Generates equidistant points on concentric spheres (one per BFS depth layer),
 * then assigns each node to its nearest target point (greedy nearest-neighbor).
 * 
 * PLUGIN DESIGN: This module is a pure visual plugin. It never modifies physics
 * bodies. The simulation runs independently; radial targets are blended into
 * display positions at render time only.
 */

/**
 * Compute the blended display position for a node, mixing the physics position
 * with its radial target. Called per-node per-frame from InstancedNodes / Node.
 * 
 * All state is passed explicitly to avoid circular dependency with the store.
 * 
 * @param {string} nodeId
 * @param {{x: number, y: number, z: number}} physicsPos — raw body.pos from the layout
 * @param {Object} storeState — the current zustand store snapshot (from getState())
 * @returns {{x: number, y: number, z: number}} — position to use for rendering
 */
// Module-level flag: set to true when any group has radial mode.
// Updated by updateRadialTargets in uiSlice via setRadialActive().
let _radialActive = false;
export function setRadialActive(v) { _radialActive = v; }

// Cached radial strength — O(1) lookup instead of O(n) loop through nodeSettings.
// Updated by updateRadialCache(), called from uiSlice.updateRadialTargets().
let _radialStrengthCache = 0;

/**
 * Update the cached radial strength from the current nodeSettings.
 * Call this whenever nodeSettings changes (from uiSlice.updateRadialTargets).
 * @param {Object} nodeSettings
 */
export function updateRadialCache(nodeSettings) {
  _radialStrengthCache = 0;
  for (const settings of Object.values(nodeSettings)) {
    if (settings?.renderMode === 'radial' && (settings.radialStrength || 0) > 0) {
      _radialStrengthCache = settings.radialStrength;
      break;
    }
  }
}

export function getRadialDisplayPos(nodeId, physicsPos, storeState) {
  // Fast path: no radial groups active at all
  if (!_radialActive) return physicsPos;

  const target = storeState.radialTargets[nodeId];
  if (!target) return physicsPos;

  // O(1) cached strength lookup — no per-frame nodeSettings iteration
  const strength = _radialStrengthCache;
  if (strength <= 0) return physicsPos;

  // Lerp between physics and radial target
  return {
    x: physicsPos.x + (target.x - physicsPos.x) * strength,
    y: physicsPos.y + (target.y - physicsPos.y) * strength,
    z: physicsPos.z + (target.z - physicsPos.z) * strength,
  };
}

/**
 * Generate N approximately equidistant points on a unit sphere using the
 * Fibonacci / golden-angle spiral algorithm.
 * @param {number} n - Number of points
 * @returns {Array<{x: number, y: number, z: number}>}
 */
function fibonacciSphere(n) {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0, z: 0 }];

  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.399963

  for (let i = 0; i < n; i++) {
    // y goes from 1 to -1 (uniform spacing along vertical axis)
    const y = 1 - (2 * i) / (n - 1);
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;

    points.push({
      x: Math.cos(theta) * radiusAtY,
      y: y,
      z: Math.sin(theta) * radiusAtY,
    });
  }

  return points;
}

/**
 * Compute the radius for a given depth layer.
 * Exported so that visual sphere helpers can reuse the exact same formula.
 * 
 * @param {number} depth - BFS depth (1-based)
 * @param {number} nodeCount - Number of nodes in this layer
 * @param {string} spacingMode - 'fixed' | 'proportional'
 * @param {number} spacing - Base spacing value
 * @returns {number}
 */
export function computeLayerRadius(depth, nodeCount, spacingMode, spacing) {
  if (spacingMode === 'proportional') {
    const r = 50 + Math.sqrt(nodeCount) * 5;
    return depth * r;
  }
  return depth * spacing;
}

/**
 * Compute radial target positions for all nodes of a single group.
 * 
 * @param {Object} params
 * @param {string} params.groupId - The pinned node ID acting as group center
 * @param {{x: number, y: number, z: number}} params.groupCenter - Current 3D position of group center
 * @param {Object<string, number>} params.nodeDepthsForGroup - { nodeId: bfsDepth } for this group
 * @param {string} params.spacingMode - 'fixed' | 'proportional'
 * @param {number} params.spacing - Base spacing value
 * @param {Object<string, {x: number, y: number, z: number}>} params.currentPositions - Current node positions (for greedy assignment)
 * @returns {Object<string, {x: number, y: number, z: number}>} - { nodeId: targetPosition }
 */
export function computeRadialTargets({
  groupId,
  groupCenter,
  nodeDepthsForGroup,
  spacingMode,
  spacing,
  currentPositions,
}) {
  if (!groupCenter) return {};

  // 1. Group nodes by BFS depth layer
  const layerNodes = {}; // { depth: [nodeId, ...] }
  let maxDepth = 0;

  Object.entries(nodeDepthsForGroup).forEach(([nodeId, depth]) => {
    if (nodeId === groupId) return; // center node stays at center
    if (!layerNodes[depth]) layerNodes[depth] = [];
    layerNodes[depth].push(nodeId);
    if (depth > maxDepth) maxDepth = depth;
  });

  const targets = {};
  // Center node target = group center position
  targets[groupId] = { ...groupCenter };

  // 2. For each depth layer, compute sphere radius and distribute points
  for (let d = 1; d <= maxDepth; d++) {
    const nodesInLayer = layerNodes[d];
    if (!nodesInLayer || nodesInLayer.length === 0) continue;

    const n = nodesInLayer.length;

    // Compute sphere radius for this layer (reuse shared formula)
    const radius = computeLayerRadius(d, n, spacingMode, spacing);

    // Generate equidistant points on sphere
    const spherePoints = fibonacciSphere(Math.ceil(n * 1.1)); // generate a few extra to improve assignment quality

    // Convert to absolute positions (offset by group center)
    const absolutePoints = spherePoints.map(p => ({
      x: groupCenter.x + p.x * radius,
      y: groupCenter.y + p.y * radius,
      z: groupCenter.z + p.z * radius,
    }));

    // 3. Greedy nearest-neighbor assignment:
    // For each node, find the closest unassigned sphere point
    const assignedPoints = new Set();
    
    // Sort nodes by distance to center (closest first, they get priority)
    const nodeDistances = nodesInLayer.map(nodeId => {
      const pos = currentPositions[nodeId] || groupCenter;
      const dx = pos.x - groupCenter.x;
      const dy = pos.y - groupCenter.y;
      const dz = pos.z - groupCenter.z;
      return { nodeId, distSq: dx * dx + dy * dy + dz * dz, pos };
    });
    nodeDistances.sort((a, b) => a.distSq - b.distSq);

    nodeDistances.forEach(({ nodeId, pos }) => {
      let bestIdx = -1;
      let bestDistSq = Infinity;

      for (let i = 0; i < absolutePoints.length; i++) {
        if (assignedPoints.has(i)) continue;
        const tp = absolutePoints[i];
        const dx = pos.x - tp.x;
        const dy = pos.y - tp.y;
        const dz = pos.z - tp.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        assignedPoints.add(bestIdx);
        targets[nodeId] = absolutePoints[bestIdx];
      }
    });
  }

  return targets;
}
