import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import { COLOR_MAP, MAX_INSTANCES, NODE_RADIUS } from '../../constants/graphConstants';
import { getRadialDisplayPos } from '../../utils/radialLayout';
import { readPosition } from '../../utils/sharedPositions';

const InstancedNodes = ({ groupId = null }) => {
  const allNodes = useGraphStore(state => state.nodes);
  const nodeGroupMemberships = useGraphStore(state => state.nodeGroupMemberships);
  
  // Use group-specific filters if groupId is provided
  const filters = useGraphStore(state => groupId ? (state.groupFilters[groupId] || state.filters) : state.filters);
  const opacityLevels = useGraphStore(state => groupId ? (state.groupOpacityLevels[groupId] || state.opacityLevels) : state.opacityLevels);
  
  const positions = useGraphStore(state => state.positions);
  const selectedNode = useGraphStore(state => state.selectedNode);
  const selectNode = useGraphStore(state => state.selectNode);
  const hoveredNodeId = useGraphStore(state => state.hoveredNodeId);
  const setHoveredNodeId = useGraphStore(state => state.setHoveredNodeId);

  // Filter nodes for this specific group instance
  const nodes = useMemo(() => {
    if (!groupId) {
      // Orphans (not in any group)
      return allNodes.filter(n => !nodeGroupMemberships[n.id] || nodeGroupMemberships[n.id].length === 0);
    }
    return allNodes.filter(n => (nodeGroupMemberships[n.id] || []).includes(groupId));
  }, [allNodes, nodeGroupMemberships, groupId]);

  // Seuil de LoD (doit être le même que dans Node.jsx)
  const lodThreshold = useMemo(() => {
    const factor = Math.max(0.2, 1 - (allNodes.length / 1000));
    return 400 * factor;
  }, [allNodes.length]);

  const categories = ['Entity', 'Event', 'Context', 'Default'];

  return (
    <>
      {categories.map(cat => (
        <NodeCategoryGroup
          key={cat}
          type={cat}
          nodes={nodes.filter(n => cat === 'Default' ? !['Entity', 'Event', 'Context'].includes(n.type) : n.type === cat)}
          filters={filters}
          positions={positions}
          selectedNode={selectedNode}
          opacityLevel={opacityLevels[cat] ?? 1.0}
          selectNode={selectNode}
          hoveredNodeId={hoveredNodeId}
          setHoveredNodeId={setHoveredNodeId}
          lodThreshold={lodThreshold}
        />
      ))}
    </>
  );
};

const NodeCategoryGroup = ({ 
  type, nodes, filters, positions, selectedNode, 
  opacityLevel, selectNode, hoveredNodeId, setHoveredNodeId, lodThreshold 
}) => {
  const meshRef = useRef();
  const highlightMeshRef = useRef();
  const boundsFrameRef = useRef(0);

  const _obj = useMemo(() => new THREE.Object3D(), []);
  const _color = useMemo(() => new THREE.Color(), []);
  const _v3 = useMemo(() => new THREE.Vector3(), []);

  const visibleNodes = useMemo(() => {
    return nodes.filter(node => 
      (filters[node.type] || (type === 'Default' && filters['Default'])) &&
      (node.confiance >= (filters.minConfiance || 0))
    );
  }, [nodes, filters, type]);

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

    // Cache store state once per frame for radial plugin
    const storeState = useGraphStore.getState();

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
      const dist = camPos.distanceTo(_v3);
      const isSelected = selectedNode?.id === node.id;

      if (dist < lodThreshold * 0.9 || isSelected) {
        _obj.matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _obj.matrix);
        continue;
      }

      _obj.position.copy(_v3);
      const size = (node.size || NODE_RADIUS) * 1.5;
      _obj.scale.set(size, size, 1); 
      _obj.quaternion.copy(state.camera.quaternion);
      _obj.updateMatrix();
      meshRef.current.setMatrixAt(i, _obj.matrix);

      const c = COLOR_MAP[node.type] || COLOR_MAP['Default'];
      _color.set(c);
      meshRef.current.setColorAt(i, _color);

      if (highlightMeshRef.current) {
        if (opacityLevel > 1.0) {
          _obj.scale.set(size * 1.15, size * 1.15, 1);
          _obj.updateMatrix();
          highlightMeshRef.current.setMatrixAt(i, _obj.matrix);
        } else {
          _obj.scale.set(0, 0, 0);
          _obj.updateMatrix();
          highlightMeshRef.current.setMatrixAt(i, _obj.matrix);
        }
      }
    }

    meshRef.current.count = safeCount;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    
    // Throttle expensive computeBoundingSphere to every 30 frames
    boundsFrameRef.current++;
    if (boundsFrameRef.current >= 30) {
      boundsFrameRef.current = 0;
      meshRef.current.computeBoundingSphere();
    }
    
    if (highlightMeshRef.current) {
      highlightMeshRef.current.count = safeCount;
      highlightMeshRef.current.instanceMatrix.needsUpdate = true;
      if (boundsFrameRef.current === 0) {
        highlightMeshRef.current.computeBoundingSphere();
      }
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
    <>
      <instancedMesh 
        ref={meshRef} 
        args={[null, null, MAX_INSTANCES]} 
        frustumCulled={true}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        visible={opacityLevel > 0.001}
      >
        <circleGeometry args={[0.5, 16]} />
        <meshBasicMaterial 
          transparent 
          opacity={Math.min(1.0, opacityLevel)}
          depthWrite={false} 
          toneMapped={false}
        />
      </instancedMesh>
      
      <instancedMesh
        ref={highlightMeshRef}
        args={[null, null, MAX_INSTANCES]}
        frustumCulled={true}
        visible={opacityLevel > 1.0}
      >
        <circleGeometry args={[0.5, 16]} />
        <meshBasicMaterial
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          color="#ffffff"
          opacity={opacityLevel > 1.0 ? Math.min(1.0, (opacityLevel - 1.0) * 2.0) : 0} 
        />
      </instancedMesh>
    </>
  );
};

export default InstancedNodes;
