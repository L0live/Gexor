/**
 * RadialSpheres — Visual sphere outlines drawn by connecting neighboring
 * nodes on each depth layer with lines.
 * Purely decorative; rendered for each group in 'radial' renderMode.
 */
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import { getRadialDisplayPos } from '../../utils/radialLayout';

/** How many nearest neighbors to connect per node on a layer */
const K_NEIGHBORS = 3;
/** Number of interpolation points per curved segment */
const CURVE_RESOLUTION = 8;

/**
 * Curved lines connecting neighboring nodes on one depth layer of a radial group.
 * Each line is curved inward toward the group center, creating a geodesic-like arc
 * on the sphere surface.
 * Positions update every frame from the blended radial display positions.
 */
const LayerLines = ({ groupId, depth, color }) => {
  const lineRef = useRef();
  const geoRef = useRef();
  const frameCounter = useRef(0);

  // Pre-allocate buffer: each curved segment = CURVE_RESOLUTION sub-segments = (CURVE_RESOLUTION+1) verts
  // Using Line (continuous), stored as lineSegments pairs: CURVE_RESOLUTION * 2 verts per curve
  const maxEdges = 500;
  const vertsPerEdge = CURVE_RESOLUTION * 2; // pairs for lineSegments
  const posArray = useMemo(() => new Float32Array(maxEdges * vertsPerEdge * 3), []);

  // Cached structures to avoid re-allocation per frame
  const cachedNodeIds = useRef([]);
  const cachedDisplayPositions = useRef([]);

  useFrame(() => {
    if (!geoRef.current) return;

    // Throttle: update geometry only every 3 frames
    frameCounter.current++;
    if (frameCounter.current % 3 !== 0) return;

    const state = useGraphStore.getState();
    const { nodeGroupDepths, layoutInstance: layout } = state;

    // Group center position (blended)
    let centerPhys;
    if (layout) {
      const body = layout.getBody(groupId);
      centerPhys = body ? body.pos : state.positions[groupId];
    } else {
      centerPhys = state.positions[groupId];
    }
    if (!centerPhys) {
      geoRef.current.setDrawRange(0, 0);
      return;
    }
    const center = getRadialDisplayPos(groupId, centerPhys, state);

    // Collect node IDs at this depth in this group — reuse array
    const nodeIds = cachedNodeIds.current;
    nodeIds.length = 0;
    const depthEntries = nodeGroupDepths;
    for (const nodeId in depthEntries) {
      const depthsByGroup = depthEntries[nodeId];
      if (depthsByGroup[groupId] === depth) {
        nodeIds.push(nodeId);
      }
    }

    if (nodeIds.length < 2) {
      geoRef.current.setDrawRange(0, 0);
      return;
    }

    // Get blended display positions — reuse array
    const displayPositions = cachedDisplayPositions.current;
    displayPositions.length = 0;
    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      let physPos;
      if (layout) {
        const body = layout.getBody(nodeId);
        physPos = body ? body.pos : state.positions[nodeId];
      } else {
        physPos = state.positions[nodeId];
      }
      if (!physPos) continue;
      const dp = getRadialDisplayPos(nodeId, physPos, state);
      displayPositions.push(dp);
    }

    if (displayPositions.length < 2) {
      geoRef.current.setDrawRange(0, 0);
      return;
    }

    // For each node, connect to K nearest neighbors (avoid duplicates)
    const drawnEdges = new Set();
    const kTarget = Math.max(K_NEIGHBORS, displayPositions.length / 20 | 0);
    let vertIdx = 0;

    for (let i = 0; i < displayPositions.length; i++) {
      const a = displayPositions[i];

      // Simple inline KNN with partial sort — only need K best
      const dists = [];
      for (let j = 0; j < displayPositions.length; j++) {
        if (j === i) continue;
        const b = displayPositions[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        dists.push({ j, distSq: dx * dx + dy * dy + dz * dz });
      }
      // Partial sort: only need top kTarget+some buffer for dedup
      dists.sort((x, y) => x.distSq - y.distSq);

      let connected = 0;
      for (let k = 0; k < dists.length && connected < kTarget; k++) {
        const jIdx = dists[k].j;
        const edgeKey = i < jIdx ? i * 100000 + jIdx : jIdx * 100000 + i; // numeric key, faster than string
        if (drawnEdges.has(edgeKey)) continue;
        drawnEdges.add(edgeKey);

        const b = displayPositions[jIdx];

        // Midpoint
        const mx = (a.x + b.x) * 0.5;
        const my = (a.y + b.y) * 0.5;
        const mz = (a.z + b.z) * 0.5;

        // Vector from center to midpoint
        const cmx = mx - center.x, cmy = my - center.y, cmz = mz - center.z;
        const cmLen = Math.sqrt(cmx * cmx + cmy * cmy + cmz * cmz);

        // Average radius
        const rA = Math.sqrt((a.x - center.x) ** 2 + (a.y - center.y) ** 2 + (a.z - center.z) ** 2);
        const rB = Math.sqrt((b.x - center.x) ** 2 + (b.y - center.y) ** 2 + (b.z - center.z) ** 2);
        const avgR = (rA + rB) * 0.5;

        let cpx, cpy, cpz;
        if (cmLen > 0.01) {
          const scale = avgR / cmLen;
          cpx = center.x + cmx * scale;
          cpy = center.y + cmy * scale;
          cpz = center.z + cmz * scale;
        } else {
          cpx = mx; cpy = my; cpz = mz;
        }

        // Bezier sub-segments
        let prevX = a.x, prevY = a.y, prevZ = a.z;
        for (let s = 1; s <= CURVE_RESOLUTION; s++) {
          const t = s / CURVE_RESOLUTION;
          const it = 1 - t;
          const px = it * it * a.x + 2 * it * t * cpx + t * t * b.x;
          const py = it * it * a.y + 2 * it * t * cpy + t * t * b.y;
          const pz = it * it * a.z + 2 * it * t * cpz + t * t * b.z;

          const off = vertIdx * 3;
          posArray[off]     = prevX;
          posArray[off + 1] = prevY;
          posArray[off + 2] = prevZ;
          posArray[off + 3] = px;
          posArray[off + 4] = py;
          posArray[off + 5] = pz;
          vertIdx += 2;

          prevX = px; prevY = py; prevZ = pz;
        }

        connected++;
        if (vertIdx >= maxEdges * vertsPerEdge - vertsPerEdge) break;
      }
      if (vertIdx >= maxEdges * vertsPerEdge - vertsPerEdge) break;
    }

    const attr = geoRef.current.getAttribute('position');
    attr.array.set(posArray);
    attr.needsUpdate = true;
    geoRef.current.setDrawRange(0, vertIdx);
  });

  return (
    <lineSegments ref={lineRef} frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[posArray, 3]}
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={Math.max(0.08, 0.25 - depth * 0.04)}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
};

/**
 * Renders neighbor-connected lines for each depth layer of radial groups.
 */
const RadialSpheres = () => {
  const pinnedNodes = useGraphStore(state => state.pinnedNodes);
  const pinnedSettings = useGraphStore(state => state.pinnedSettings);
  const nodeGroupDepths = useGraphStore(state => state.nodeGroupDepths);

  // Collect layers that need rendering
  const layers = useMemo(() => {
    const result = [];

    pinnedNodes.forEach(groupId => {
      const settings = pinnedSettings[groupId];
      if (!settings || settings.renderMode !== 'radial') return;

      const maxExploreDepth = settings.depth || 1;

      // Find which depths have nodes
      const depthsWithNodes = new Set();
      Object.entries(nodeGroupDepths).forEach(([nodeId, depthsByGroup]) => {
        const d = depthsByGroup[groupId];
        if (d !== undefined && d > 0 && d <= maxExploreDepth) {
          depthsWithNodes.add(d);
        }
      });

      depthsWithNodes.forEach(d => {
        result.push({ groupId, depth: d });
      });
    });

    return result;
  }, [pinnedNodes, pinnedSettings, nodeGroupDepths]);

  if (layers.length === 0) return null;

  return (
    <>
      {layers.map(({ groupId, depth }) => (
        <LayerLines
          key={`${groupId}-d${depth}`}
          groupId={groupId}
          depth={depth}
          color="#ffe600"
        />
      ))}
    </>
  );
};

export default RadialSpheres;
