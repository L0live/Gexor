import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';

const InstancedEdges = () => {
  const edges = useGraphStore(state => state.edges);
  const nodes = useGraphStore(state => state.nodes);
  const filters = useGraphStore(state => state.filters);
  const opacityLevels = useGraphStore(state => state.opacityLevels);
  const selectedEdge = useGraphStore(state => state.selectedEdge);
  const selectEdge = useGraphStore(state => state.selectEdge);
  const layout = useGraphStore(state => state.layoutInstance);
  const positions = useGraphStore(state => state.positions);
  const hoveredEdgeId = useGraphStore(state => state.hoveredEdgeId);
  const setHoveredEdgeId = useGraphStore(state => state.setHoveredEdgeId);

  const meshRef = useRef();
  const arrowMeshRef = useRef();

  const _obj = useMemo(() => new THREE.Object3D(), []);
  const _v1 = useMemo(() => new THREE.Vector3(), []);
  const _v2 = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _mid = useMemo(() => new THREE.Vector3(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _m = useMemo(() => new THREE.Matrix4(), []);
  const _color = useMemo(() => new THREE.Color(), []);
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const _frustum = useMemo(() => new THREE.Frustum(), []);
  const _projScreenMatrix = useMemo(() => new THREE.Matrix4(), []);
  const _sphere = useMemo(() => new THREE.Sphere(), []);
  const nodeRadius = 8;
  const arrowSize = 3;

  // Seuils LoD adaptatifs
  const lodThresholds = useMemo(() => {
    const total = edges.length;
    const factor = Math.max(0.15, 1 - (total / 5000));
    return {
      lod1: 500 * factor,  // Disparition flèche
      lod2: 1500 * factor  // Disparition ligne
    };
  }, [edges.length]);

  // Filter and process edges
  // We only re-calculate this when the structure of the graph or filters change
  const visibleEdges = useMemo(() => {
    return edges.filter(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      return filters['Relations'] && filters[sourceNode?.type] && filters[targetNode?.type];
    });
  }, [edges, nodes, filters]);

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
    const currentLayout = store.layoutInstance;
    const currentHoveredEdgeId = store.hoveredEdgeId;
    
    const count = visibleEdges.length;
    const safeCount = Math.min(count, 5000);

    for (let i = 0; i < safeCount; i++) {
      const edge = visibleEdges[i];
      
      let source, target;
      if (currentLayout) {
        const sourceBody = currentLayout.getBody(edge.source);
        const targetBody = currentLayout.getBody(edge.target);
        source = sourceBody ? sourceBody.pos : currentPositions[edge.source];
        target = targetBody ? targetBody.pos : currentPositions[edge.target];
      } else {
        source = currentPositions[edge.source];
        target = currentPositions[edge.target];
      }

      if (!source || !target) {
        _m.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _m);
        if (arrowMeshRef.current) arrowMeshRef.current.setMatrixAt(i, _m);
        continue;
      }

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
      if (isNaN(dist) || dist < (nodeRadius * 2 + arrowSize)) {
        _m.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _m);
        if (arrowMeshRef.current) arrowMeshRef.current.setMatrixAt(i, _m);
        continue;
      }

      _dir.normalize();
      
      // Points effectifs du trait
      const edgeVisibleLen = dist - (nodeRadius * 2 + arrowSize);
      
      // Positionner le cylindre : milieu de la partie visible
      // On réutilise _mid pour éviter d'allouer de la mémoire
      _mid.copy(_v1).addScaledVector(_dir, nodeRadius + edgeVisibleLen * 0.5);

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
        } else {
          _mid.copy(_v2).addScaledVector(_dir, -(nodeRadius + arrowSize / 2));
          _obj.position.copy(_mid);
          _obj.scale.set(1.0, 1.0, 1.0); 
          _obj.updateMatrix();
          arrowMeshRef.current.setMatrixAt(i, _obj.matrix);
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
    
    // Forcer la mise à jour de la sphère englobante globale pour éviter les disparitions au zoom
    meshRef.current.computeBoundingSphere();
    
    if (arrowMeshRef.current) {
      arrowMeshRef.current.count = safeCount;
      arrowMeshRef.current.instanceMatrix.needsUpdate = true;
      if (arrowMeshRef.current.instanceColor) arrowMeshRef.current.instanceColor.needsUpdate = true;
      arrowMeshRef.current.computeBoundingSphere();
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
      const colors = new Float32Array(5000 * 3);
      meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      meshRef.current.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    if (arrowMeshRef.current) {
      const colors = new Float32Array(5000 * 3);
      arrowMeshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      arrowMeshRef.current.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
  }, []);

  return (
    <group>
      {/* Cylinders for edges */}
      <instancedMesh 
        ref={meshRef} 
        args={[null, null, 5000]} 
        frustumCulled={true}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshBasicMaterial transparent opacity={opacityLevels.Relations || 0.5} depthWrite={false} />
      </instancedMesh>

      {/* Cones for arrows */}
      <instancedMesh 
        ref={arrowMeshRef} 
        args={[null, null, 5000]} 
        frustumCulled={true}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <coneGeometry args={[1, arrowSize, 3]} />
        <meshBasicMaterial transparent opacity={opacityLevels.Relations || 0.5} depthWrite={false} />
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
