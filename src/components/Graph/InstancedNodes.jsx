import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import { getCategoryColor, MAX_INSTANCES, NODE_RADIUS, AGGREGATE_NODE_COLOR, AGGREGATE_NODE_COLOR_LOADING, getAggregateScale, ADDED_PULSE_COLOR, ADDED_PULSE_DURATION, SHARED_NODE_OPACITY, SHARED_NODE_SCALE } from '../../constants/graphConstants';
import { getRadialDisplayPos } from '../../utils/radialLayout';
import { readPosition } from '../../utils/sharedPositions';

// Pré-alloué au niveau module — évite new THREE.Color() à chaque frame
const _pulseColor = new THREE.Color(ADDED_PULSE_COLOR);

const InstancedNodes = () => {
  const nodes = useGraphStore(state => state.nodes);
  
  const positions = useGraphStore(state => state.positions);
  const selectedNode = useGraphStore(state => state.selectedNode);
  const selectNode = useGraphStore(state => state.selectNode);
  const hoveredNodeId = useGraphStore(state => state.hoveredNodeId);
  const setHoveredNodeId = useGraphStore(state => state.setHoveredNodeId);

  // Seuil de LoD (doit être le même que dans Node.jsx)
  const lodThreshold = useMemo(() => {
    const factor = Math.max(0.2, 1 - (nodes.length / 1000));
    return 400 * factor;
  }, [nodes.length]);

  return (
    <AllNodesGroup
      nodes={nodes}
      positions={positions}
      selectedNode={selectedNode}
      selectNode={selectNode}
      hoveredNodeId={hoveredNodeId}
      setHoveredNodeId={setHoveredNodeId}
      lodThreshold={lodThreshold}
    />
  );
};

const AllNodesGroup = ({
  nodes, positions, selectedNode,
  selectNode, hoveredNodeId, setHoveredNodeId, lodThreshold
}) => {
  const meshRef = useRef();
  const boundsFrameRef = useRef(0);

  const _obj = useMemo(() => new THREE.Object3D(), []);
  const _color = useMemo(() => new THREE.Color(), []);
  const _v3 = useMemo(() => new THREE.Vector3(), []);

  // Frustum culling objects — reused every frame to avoid allocations
  const _frustum = useMemo(() => new THREE.Frustum(), []);
  const _projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const _testSphere = useMemo(() => new THREE.Sphere(), []);

  // Refs updated by Zustand subscription — eliminates getState() from the hot path
  const recentlyAddedNodesRef = useRef({});
  const radialTargetsRef = useRef({});
  const nodeSettingsRef = useRef({});

  useEffect(() => {
    // Initialize synchronously so first frame has correct values
    const s = useGraphStore.getState();
    recentlyAddedNodesRef.current = s.recentlyAddedNodes || {};
    radialTargetsRef.current = s.radialTargets || {};
    nodeSettingsRef.current = s.nodeSettings || {};

    // Subscribe to future changes (runs outside the frame loop)
    return useGraphStore.subscribe((state) => {
      recentlyAddedNodesRef.current = state.recentlyAddedNodes || {};
      radialTargetsRef.current = state.radialTargets || {};
      nodeSettingsRef.current = state.nodeSettings || {};
    });
  }, []);

  // All nodes are visible (no filters)
  const visibleNodes = nodes;

  useEffect(() => {
    if (!meshRef.current) return;
    const count = MAX_INSTANCES;
    const colors = new Float32Array(count * 3);
    const attr = new THREE.InstancedBufferAttribute(colors, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    meshRef.current.instanceColor = attr;
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;

    const count = visibleNodes.length;
    const safeCount = Math.min(count, MAX_INSTANCES);
    const camPos = state.camera.position;

    // Build lightweight storeState from refs — no getState() call in hot path
    const storeState = {
      recentlyAddedNodes: recentlyAddedNodesRef.current,
      radialTargets: radialTargetsRef.current,
      nodeSettings: nodeSettingsRef.current,
    };

    let hasPulse = false;

    // Per-instance frustum culling (Three.js only culls the whole InstancedMesh)
    // Only worthwhile with enough nodes to justify the frustum setup cost
    const doCulling = safeCount >= 100;
    if (doCulling) {
      _projScreenMatrix.multiplyMatrices(
        state.camera.projectionMatrix,
        state.camera.matrixWorldInverse
      );
      _frustum.setFromProjectionMatrix(_projScreenMatrix);
    }

    for (let i = 0; i < safeCount; i++) {
      const node = visibleNodes[i];
      let pos;
      // SAB hot path (zero alloc) → Zustand fallback
      pos = readPosition(node.id) || positions[node.id];

      if (!pos) {
        _obj.matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _obj.matrix);
        continue;
      }

      // Radial plugin: blend display position toward radial target (pure visual)
      const radialPos = getRadialDisplayPos(node.id, pos, storeState);

      _v3.set(radialPos.x, radialPos.y, radialPos.z);
      const isSelected = selectedNode?.id === node.id;

      // Skip off-screen instances (frustum test is cheaper than full matrix update)
      if (doCulling && !isSelected) {
        _testSphere.set(_v3, (node.size || NODE_RADIUS) * 2);
        if (!_frustum.intersectsSphere(_testSphere)) {
          _obj.matrix.makeScale(0, 0, 0);
          meshRef.current.setMatrixAt(i, _obj.matrix);
          continue;
        }
      }

      const dist = camPos.distanceTo(_v3);

      if (dist < lodThreshold * 0.9 || isSelected) {
        _obj.matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _obj.matrix);
        continue;
      }

      _obj.position.copy(_v3);
      const isAggregate = node.isAggregate;
      const baseSize = (node.size || NODE_RADIUS) * 1.5;
      let size = isAggregate ? baseSize * getAggregateScale(node.aggregateCount) : baseSize;
      if (node.isSharedNode) size *= SHARED_NODE_SCALE;

      // Pulse scale for recently-added nodes
      const recentlyAdded = storeState.recentlyAddedNodes?.[node.id];
      const addedElapsed = recentlyAdded ? Date.now() - recentlyAdded : Infinity;
      if (addedElapsed < ADDED_PULSE_DURATION) {
        hasPulse = true;
        const pulse = Math.max(0, 1 - addedElapsed / ADDED_PULSE_DURATION) * (0.5 + 0.5 * Math.sin(addedElapsed * 0.008));
        size *= (1 + pulse * 0.3);
      }

      _obj.scale.set(size, size, 1); 
      _obj.quaternion.copy(state.camera.quaternion);
      _obj.updateMatrix();
      meshRef.current.setMatrixAt(i, _obj.matrix);

      let c;
      if (addedElapsed < ADDED_PULSE_DURATION) {
        // Blend color toward green for recently added
        const t = Math.max(0, 1 - addedElapsed / ADDED_PULSE_DURATION) * 0.5;
        const baseColor = isAggregate
          ? (node.loadingChildren ? AGGREGATE_NODE_COLOR_LOADING : AGGREGATE_NODE_COLOR)
          : getCategoryColor(node.type);
        _color.set(baseColor);
        _color.lerp(_pulseColor, t);
      } else {
        c = isAggregate
          ? (node.loadingChildren ? AGGREGATE_NODE_COLOR_LOADING : AGGREGATE_NODE_COLOR)
          : getCategoryColor(node.type);
        _color.set(c);
      }
      meshRef.current.setColorAt(i, _color);
    }

    meshRef.current.count = safeCount;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

    // frameloop="demand" : maintenir le rendu pendant les animations pulse
    if (hasPulse) state.invalidate();

    // Throttle expensive computeBoundingSphere to every 30 frames
    boundsFrameRef.current++;
    if (boundsFrameRef.current >= 30) {
      boundsFrameRef.current = 0;
      meshRef.current.computeBoundingSphere();
    }
  });

  const handlePointerMove = (e) => {
    e.stopPropagation();
    const node = visibleNodes[e.instanceId];
    if (node && hoveredNodeId !== node.id) {
      setHoveredNodeId(node.id);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    setHoveredNodeId(null);
    document.body.style.cursor = 'default';
  };

  const handleClick = (e) => {
    e.stopPropagation();
    const node = visibleNodes[e.instanceId];
    if (node) selectNode(node.id);
  };

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, MAX_INSTANCES]} 
      frustumCulled={true}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    >
      <circleGeometry args={[0.5, 16]} />
      <meshBasicMaterial 
        transparent 
        opacity={1.0}
        depthWrite={false} 
        toneMapped={false}
      />
    </instancedMesh>
  );
};

export default InstancedNodes;
