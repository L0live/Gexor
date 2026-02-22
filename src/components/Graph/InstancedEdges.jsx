import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import { NODE_RADIUS, ARROW_SIZE, MAX_INSTANCES } from '../../constants/graphConstants';
import { getRadialDisplayPos } from '../../utils/radialLayout';
import { readPosition } from '../../utils/sharedPositions';

const InstancedEdges = ({ groupId = null }) => {
  const allEdges = useGraphStore(state => state.edges);
  const allNodes = useGraphStore(state => state.nodes);
  const nodeGroupMemberships = useGraphStore(state => state.nodeGroupMemberships);
  
  // Use group-specific filters if groupId is provided
  const filters = useGraphStore(state => groupId ? (state.groupFilters[groupId] || state.filters) : state.filters);
  const opacityLevels = useGraphStore(state => groupId ? (state.groupOpacityLevels[groupId] || state.opacityLevels) : state.opacityLevels);
  
  const selectEdge = useGraphStore(state => state.selectEdge);
  const selectedEdge = useGraphStore(state => state.selectedEdge);
  const positions = useGraphStore(state => state.positions);
  const hoveredEdgeId = useGraphStore(state => state.hoveredEdgeId);
  const setHoveredEdgeId = useGraphStore(state => state.setHoveredEdgeId);

  // Filter edges for this specific group instance
  const edges = useMemo(() => {
    if (!groupId) {
      // Edges that are not fully contained within ANY group
      // (includes cross-group edges and edges with orphans)
      return allEdges.filter(e => {
        const sMem = nodeGroupMemberships[e.source] || [];
        const tMem = nodeGroupMemberships[e.target] || [];
        // Check if there is any group that contains both ends
        const commonGroups = sMem.filter(g => tMem.includes(g));
        return commonGroups.length === 0;
      });
    }
    // Edges fully contained within this group
    return allEdges.filter(e => {
      const sMem = nodeGroupMemberships[e.source] || [];
      const tMem = nodeGroupMemberships[e.target] || [];
      return sMem.includes(groupId) && tMem.includes(groupId);
    });
  }, [allEdges, nodeGroupMemberships, groupId]);

  const meshRef = useRef();
  const arrowMeshRef = useRef();
  const highlightMeshRef = useRef();
  const highlightArrowMeshRef = useRef();
  const boundsFrameRef = useRef(0);

  const _obj = useMemo(() => new THREE.Object3D(), []);
  const _v1 = useMemo(() => new THREE.Vector3(), []);
  const _v2 = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _mid = useMemo(() => new THREE.Vector3(), []);
  const _m = useMemo(() => new THREE.Matrix4(), []);
  const _color = useMemo(() => new THREE.Color(), []);
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  // Seuils LoD adaptatifs
  const lodThresholds = useMemo(() => {
    const total = allEdges.length;
    const factor = Math.max(0.15, 1 - (total / MAX_INSTANCES));
    return {
      lod1: 500 * factor,  // Disparition flèche
      lod2: 1500 * factor  // Disparition ligne
    };
  }, [allEdges.length]);

  // Build a type lookup map once (avoids O(n) .find per edge)
  const nodeTypeMap = useMemo(() => {
    const map = {};
    allNodes.forEach(n => { map[n.id] = n.type; });
    return map;
  }, [allNodes]);

  // Filter and process edges
  const visibleEdges = useMemo(() => {
    if (!filters['Relations']) return [];
    return edges.filter(edge => {
      const sType = nodeTypeMap[edge.source];
      const tType = nodeTypeMap[edge.target];
      return sType && tType && 
             filters[sType] && 
             filters[tType] && 
             (edge.confiance >= (filters.minConfiance || 0));
    });
  }, [edges, nodeTypeMap, filters]);

  const hoveredEdge = useMemo(() => {
    return hoveredEdgeId ? edges.find(e => e.id === hoveredEdgeId) : null;
  }, [hoveredEdgeId, edges]);

  const [_hoveredMidpoint, setHoveredMidpoint] = useState(new THREE.Vector3());

  // UseFrame pour mettre à jour les matrices
  useFrame((state) => {
    if (!meshRef.current) return;

    // Récupérer le store DIRECTEMENT pour éviter tout lag de React
    const store = useGraphStore.getState();
    const currentPositions = store.positions;
    const currentHoveredEdgeId = store.hoveredEdgeId;
    const relOpacity = (groupId && store.groupOpacityLevels[groupId])
        ? (store.groupOpacityLevels[groupId].Relations ?? 0.5)
        : (store.opacityLevels && store.opacityLevels.Relations !== undefined) ? store.opacityLevels.Relations : 0.5;

    // Mettre à jour l'opacité globale des matériaux une fois par frame
    if (meshRef.current && meshRef.current.material) {
      const finalOp = Math.min(0.6, relOpacity);
      meshRef.current.material.opacity = finalOp;
      meshRef.current.visible = finalOp > 0.001;
    }
    if (arrowMeshRef.current && arrowMeshRef.current.material) {
      const finalOp = Math.min(0.6, relOpacity);
      arrowMeshRef.current.material.opacity = finalOp;
      arrowMeshRef.current.visible = finalOp > 0.001;
    }
    
    const count = visibleEdges.length;
    const safeCount = Math.min(count, MAX_INSTANCES);

    for (let i = 0; i < safeCount; i++) {
      const edge = visibleEdges[i];
      
      let source, target;
      // SAB hot path (zero alloc) → Zustand fallback
      source = readPosition(edge.source) || currentPositions[edge.source];
      target = readPosition(edge.target) || currentPositions[edge.target];

      if (!source || !target) {
        _m.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _m);
        if (arrowMeshRef.current) arrowMeshRef.current.setMatrixAt(i, _m);
        continue;
      }

      // Radial plugin: blend edge endpoints to match node display positions
      source = getRadialDisplayPos(edge.source, source, store);
      target = getRadialDisplayPos(edge.target, target, store);

      _v1.set(source.x, source.y, source.z);
      _v2.set(target.x, target.y, target.z);
      
      // Update midpoint if this edge is hovered
      if (currentHoveredEdgeId === edge.id) {
        _mid.addVectors(_v1, _v2).multiplyScalar(0.5);
        if (_hoveredMidpoint.distanceTo(_mid) > 1) {
          setHoveredMidpoint(_mid.clone());
        }
      }

      _dir.subVectors(_v2, _v1);
      const dist = _dir.length();
      
      // On dessine seulement si la distance est valide (plus de 0)
      if (isNaN(dist) || dist < (NODE_RADIUS * 2 + ARROW_SIZE)) {
        _m.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _m);
        if (arrowMeshRef.current) arrowMeshRef.current.setMatrixAt(i, _m);
        continue;
      }

      _dir.normalize();
      
      // Points effectifs du trait
      const edgeVisibleLen = dist - (NODE_RADIUS * 2 + ARROW_SIZE);
      
      // Positionner le cylindre : milieu de la partie visible
      // On réutilise _mid pour éviter d'allouer de la mémoire
      _mid.copy(_v1).addScaledVector(_dir, NODE_RADIUS + edgeVisibleLen * 0.5);

      // Calcul LoD basé sur la distance à la caméra
      const distToCam = state.camera.position.distanceTo(_mid);
      const isSelected = selectedEdge?.id === edge.id;
      
      // LoD 2: Trop loin, on cache tout (sauf si sélectionné)
      if (distToCam > lodThresholds.lod2 && !isSelected) {
        _m.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _m);
        if (arrowMeshRef.current) arrowMeshRef.current.setMatrixAt(i, _m);
        continue;
      }

      _obj.position.copy(_mid);
      _obj.quaternion.setFromUnitVectors(_up, _dir);
      
      // Épaisseur originale (environ 0.15 radius = 0.3 diamètre pour matcher Line)
      const thickness = isSelected ? 0.6 : 0.2; 
      _obj.scale.set(thickness, edgeVisibleLen, thickness);
      _obj.updateMatrix();
      meshRef.current.setMatrixAt(i, _obj.matrix);

      // 2. Update Arrow
      if (arrowMeshRef.current) {
        // LoD 1: Flèche disparait si trop loin (sauf si sélectionné)
        if (distToCam > lodThresholds.lod1 && !isSelected) {
          _m.makeScale(0, 0, 0);
          arrowMeshRef.current.setMatrixAt(i, _m);
          if (highlightArrowMeshRef.current) highlightArrowMeshRef.current.setMatrixAt(i, _m);
        } else {
          _mid.copy(_v2).addScaledVector(_dir, -(NODE_RADIUS + ARROW_SIZE / 2));
          _obj.position.copy(_mid);
          // Scale de la flèche standard (1.0 pour thickness 0.2)
          const arrowScale = isSelected ? 3.0 : 1.0;
          _obj.scale.set(arrowScale, 1.0, arrowScale); 
          _obj.updateMatrix();
          arrowMeshRef.current.setMatrixAt(i, _obj.matrix);
          
          if (highlightArrowMeshRef.current) {
            _obj.scale.set(arrowScale * 1.2, 1.1, arrowScale * 1.2);
            _obj.updateMatrix();
            highlightArrowMeshRef.current.setMatrixAt(i, _obj.matrix);
          }
        }
      }

      // 3. Update Highlight Mesh (Contour)
      if (highlightMeshRef.current) {
        if (relOpacity > 1.0) {
          _obj.position.copy(_mid.copy(_v1).addScaledVector(_dir, NODE_RADIUS + edgeVisibleLen * 0.5));
          _obj.quaternion.setFromUnitVectors(_up, _dir);
          _obj.scale.set(thickness * 1.5, edgeVisibleLen, thickness * 1.5);
          _obj.updateMatrix();
          highlightMeshRef.current.setMatrixAt(i, _obj.matrix);
        } else {
          _m.makeScale(0, 0, 0);
          highlightMeshRef.current.setMatrixAt(i, _m);
        }
      }

      // 3. Update Colors
      const baseColor = isSelected ? '#60a5fa' : '#475569';
      _color.set(baseColor);
      meshRef.current.setColorAt(i, _color);
      if (arrowMeshRef.current) arrowMeshRef.current.setColorAt(i, _color);
    }

    meshRef.current.count = safeCount;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    
    // Throttle expensive computeBoundingSphere to every 30 frames
    boundsFrameRef.current++;
    const shouldRecomputeBounds = boundsFrameRef.current >= 30;
    if (shouldRecomputeBounds) {
      boundsFrameRef.current = 0;
      meshRef.current.computeBoundingSphere();
    }
    
    if (arrowMeshRef.current) {
      arrowMeshRef.current.count = safeCount;
      arrowMeshRef.current.instanceMatrix.needsUpdate = true;
      if (arrowMeshRef.current.instanceColor) arrowMeshRef.current.instanceColor.needsUpdate = true;
      if (shouldRecomputeBounds) arrowMeshRef.current.computeBoundingSphere();
    }

    if (highlightMeshRef.current) {
      highlightMeshRef.current.count = relOpacity > 1.0 ? safeCount : 0;
      highlightMeshRef.current.instanceMatrix.needsUpdate = true;
      if (shouldRecomputeBounds) highlightMeshRef.current.computeBoundingSphere();
    }

    if (highlightArrowMeshRef.current) {
      highlightArrowMeshRef.current.count = relOpacity > 1.0 ? safeCount : 0;
      highlightArrowMeshRef.current.instanceMatrix.needsUpdate = true;
      if (shouldRecomputeBounds) highlightArrowMeshRef.current.computeBoundingSphere();
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) {
      const edge = visibleEdges[e.instanceId];
      if (edge) selectEdge(edge.id);
    }
  };

  const handlePointerMove = (e) => {
    e.stopPropagation();
    const index = e.instanceId;
    const edge = visibleEdges[index];
    if (edge && hoveredEdgeId !== edge.id) {
      setHoveredEdgeId(edge.id);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = () => {
    setHoveredEdgeId(null);
    document.body.style.cursor = 'default';
  };

  // Initialiser l'attribut de couleur car setColorAt en a besoin
  useEffect(() => {
    if (meshRef.current) {
      const colors = new Float32Array(MAX_INSTANCES * 3);
      meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      meshRef.current.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    if (arrowMeshRef.current) {
      const colors = new Float32Array(MAX_INSTANCES * 3);
      arrowMeshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      arrowMeshRef.current.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);

  return (
    <group>
      {/* Cylinders for edges */}
      <instancedMesh 
        ref={meshRef} 
        args={[null, null, MAX_INSTANCES]} 
        frustumCulled={true}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshBasicMaterial transparent opacity={Math.min(1.0, opacityLevels.Relations !== undefined ? opacityLevels.Relations : 0.5)} depthWrite={false} />
      </instancedMesh>

      {/* Cones for arrows */}
      <instancedMesh 
        ref={arrowMeshRef} 
        args={[null, null, MAX_INSTANCES]} 
        frustumCulled={true}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <coneGeometry args={[1, ARROW_SIZE, 3]} />
        <meshBasicMaterial transparent opacity={Math.min(1.0, opacityLevels.Relations !== undefined ? opacityLevels.Relations : 0.5)} depthWrite={false} />
      </instancedMesh>

      {/* Highlights for edges (Contour) */}
      <instancedMesh 
        ref={highlightMeshRef} 
        args={[null, null, MAX_INSTANCES]} 
        frustumCulled={true}
      >
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshBasicMaterial 
          transparent 
          opacity={(opacityLevels.Relations || 0.5) > 1.0 ? Math.min(1.0, (opacityLevels.Relations - 1.0) * 2.0) : 0} 
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color="#ffffff"
        />
      </instancedMesh>

      <instancedMesh 
        ref={highlightArrowMeshRef} 
        args={[null, null, MAX_INSTANCES]} 
        frustumCulled={true}
      >
        <coneGeometry args={[1, ARROW_SIZE, 3]} />
        <meshBasicMaterial 
          transparent 
          opacity={(opacityLevels.Relations || 0.5) > 1.0 ? Math.min(1.0, (opacityLevels.Relations - 1.0) * 2.0) : 0} 
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color="#ffffff"
        />
      </instancedMesh>

      {/* Tooltip HTML pour la relation survolée */}
      {hoveredEdge && (
        <Html 
          position={[_hoveredMidpoint.x, _hoveredMidpoint.y + 1, _hoveredMidpoint.z]} 
          center 
          style={{ pointerEvents: 'none', zIndex: 1000 }}
        >
          <div style={{
            background: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.2)',
            pointerEvents: 'none'
          }}>
            {hoveredEdge.label || hoveredEdge.type || 'Relation'}
          </div>
        </Html>
      )}
    </group>
  );
};

export default InstancedEdges;
