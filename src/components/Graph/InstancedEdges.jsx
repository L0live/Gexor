import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import { NODE_RADIUS, ARROW_SIZE, MAX_INSTANCES, SHARED_EDGE_OPACITY } from '../../constants/graphConstants';
import { getRadialDisplayPos } from '../../utils/radialLayout';
import { readPosition } from '../../utils/sharedPositions';

const InstancedEdges = () => {
  const edges = useGraphStore(state => state.edges);
  const allNodes = useGraphStore(state => state.nodes);
  
  const selectEdge = useGraphStore(state => state.selectEdge);
  const selectedEdge = useGraphStore(state => state.selectedEdge);
  const positions = useGraphStore(state => state.positions);
  const hoveredEdgeId = useGraphStore(state => state.hoveredEdgeId);
  const setHoveredEdgeId = useGraphStore(state => state.setHoveredEdgeId);

  const meshRef = useRef();
  const arrowMeshRef = useRef();
  const highlightMeshRef = useRef();
  const highlightArrowMeshRef = useRef();
  const reverseArrowMeshRef = useRef();
  const highlightReverseArrowMeshRef = useRef();
  const boundsFrameRef = useRef(0);

  const _obj = useMemo(() => new THREE.Object3D(), []);
  const _v1 = useMemo(() => new THREE.Vector3(), []);
  const _v2 = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _dir_neg = useMemo(() => new THREE.Vector3(), []);
  const _mid = useMemo(() => new THREE.Vector3(), []);
  const _m = useMemo(() => new THREE.Matrix4(), []);
  const _color = useMemo(() => new THREE.Color(), []);
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  // Seuils LoD adaptatifs
  const lodThresholds = useMemo(() => {
    const total = edges.length;
    const factor = Math.max(0.15, 1 - (total / MAX_INSTANCES));
    return {
      lod1: 500 * factor,  // Disparition flèche
      lod2: 1500 * factor  // Disparition ligne
    };
  }, [edges.length]);

  // All edges are visible (no filters)
  const visibleEdges = edges;

  const hoveredEdge = useMemo(() => {
    return hoveredEdgeId ? edges.find(e => e.id === hoveredEdgeId) : null;
  }, [hoveredEdgeId, edges]);

  const hoveredMidpointRef = useRef(new THREE.Vector3());

  // UseFrame pour mettre à jour les matrices
  useFrame((state) => {
    if (!meshRef.current) return;

    // Récupérer le store DIRECTEMENT pour éviter tout lag de React
    const store = useGraphStore.getState();
    const currentPositions = store.positions;
    const currentHoveredEdgeId = store.hoveredEdgeId;
    const relOpacity = 0.5;

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
    if (reverseArrowMeshRef.current && reverseArrowMeshRef.current.material) {
      const finalOp = Math.min(0.6, relOpacity);
      reverseArrowMeshRef.current.material.opacity = finalOp;
      reverseArrowMeshRef.current.visible = finalOp > 0.001;
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
        if (reverseArrowMeshRef.current) reverseArrowMeshRef.current.setMatrixAt(i, _m);
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
        hoveredMidpointRef.current.copy(_mid);
      }

      _dir.subVectors(_v2, _v1);
      const dist = _dir.length();
      
      // On dessine seulement si la distance est valide (plus de 0)
      if (isNaN(dist) || dist < (NODE_RADIUS * 2 + ARROW_SIZE)) {
        _m.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _m);
        if (arrowMeshRef.current) arrowMeshRef.current.setMatrixAt(i, _m);
        if (reverseArrowMeshRef.current) reverseArrowMeshRef.current.setMatrixAt(i, _m);
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
        if (reverseArrowMeshRef.current) reverseArrowMeshRef.current.setMatrixAt(i, _m);
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
          if (reverseArrowMeshRef.current) reverseArrowMeshRef.current.setMatrixAt(i, _m);
          if (highlightReverseArrowMeshRef.current) highlightReverseArrowMeshRef.current.setMatrixAt(i, _m);
        } else {
          _mid.copy(_v2).addScaledVector(_dir, -(NODE_RADIUS + ARROW_SIZE / 2));
          _obj.position.copy(_mid);
          _obj.quaternion.setFromUnitVectors(_up, _dir);
          // Scale de la flèche standard (1.0 pour thickness 0.2)
          const arrowScale = isSelected ? 3.0 : 1.0;
          _obj.scale.set(arrowScale, 1.0, arrowScale); 
          _obj.updateMatrix();
          arrowMeshRef.current.setMatrixAt(i, _obj.matrix);
          
          if (highlightArrowMeshRef.current) {
            if (isSelected || currentHoveredEdgeId === edge.id) {
              _obj.scale.set(arrowScale * 1.2, 1.1, arrowScale * 1.2);
              _obj.updateMatrix();
              highlightArrowMeshRef.current.setMatrixAt(i, _obj.matrix);
            } else {
              _m.makeScale(0, 0, 0);
              highlightArrowMeshRef.current.setMatrixAt(i, _m);
            }
          }

          // Reverse arrow for bidirectional edges
          if (reverseArrowMeshRef.current) {
            if (edge.isBidirectional) {
              _dir_neg.copy(_dir).negate();
              _mid.copy(_v1).addScaledVector(_dir, NODE_RADIUS + ARROW_SIZE / 2);
              _obj.position.copy(_mid);
              _obj.quaternion.setFromUnitVectors(_up, _dir_neg);
              _obj.scale.set(arrowScale, 1.0, arrowScale);
              _obj.updateMatrix();
              reverseArrowMeshRef.current.setMatrixAt(i, _obj.matrix);

              if (highlightReverseArrowMeshRef.current) {
                if (isSelected || currentHoveredEdgeId === edge.id) {
                  _obj.scale.set(arrowScale * 1.2, 1.1, arrowScale * 1.2);
                  _obj.updateMatrix();
                  highlightReverseArrowMeshRef.current.setMatrixAt(i, _obj.matrix);
                } else {
                  _m.makeScale(0, 0, 0);
                  highlightReverseArrowMeshRef.current.setMatrixAt(i, _m);
                }
              }
            } else {
              _m.makeScale(0, 0, 0);
              reverseArrowMeshRef.current.setMatrixAt(i, _m);
              if (highlightReverseArrowMeshRef.current) highlightReverseArrowMeshRef.current.setMatrixAt(i, _m);
            }
          }
        }
      }

      // 3. Update Highlight Mesh (Contour)
      if (highlightMeshRef.current) {
        if (isSelected || currentHoveredEdgeId === edge.id) {
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

      // 3. Update Colors — arêtes synthétiques (mode SHARED) en gris-bleu très atténué
      // L'opacité par instance n'est pas possible avec meshBasicMaterial, on simule
      // l'atténuation en réduisant la luminosité de la couleur via SHARED_EDGE_OPACITY.
      const isSynthetic = edge.isSynthetic;
      if (isSelected) {
        _color.set('#60a5fa');
      } else if (isSynthetic) {
        // Gris-bleu atténué — facteur SHARED_EDGE_OPACITY appliqué à la luminosité
        _color.set('#6b7eab').multiplyScalar(SHARED_EDGE_OPACITY / 0.5);
      } else {
        _color.set('#475569');
      }
      meshRef.current.setColorAt(i, _color);
      if (arrowMeshRef.current) arrowMeshRef.current.setColorAt(i, _color);
      if (reverseArrowMeshRef.current) reverseArrowMeshRef.current.setColorAt(i, _color);
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

    if (reverseArrowMeshRef.current) {
      reverseArrowMeshRef.current.count = safeCount;
      reverseArrowMeshRef.current.instanceMatrix.needsUpdate = true;
      if (reverseArrowMeshRef.current.instanceColor) reverseArrowMeshRef.current.instanceColor.needsUpdate = true;
      if (shouldRecomputeBounds) reverseArrowMeshRef.current.computeBoundingSphere();
    }

    if (highlightMeshRef.current) {
      highlightMeshRef.current.count = safeCount;
      highlightMeshRef.current.instanceMatrix.needsUpdate = true;
      if (shouldRecomputeBounds) highlightMeshRef.current.computeBoundingSphere();
    }

    if (highlightArrowMeshRef.current) {
      highlightArrowMeshRef.current.count = safeCount;
      highlightArrowMeshRef.current.instanceMatrix.needsUpdate = true;
      if (shouldRecomputeBounds) highlightArrowMeshRef.current.computeBoundingSphere();
    }

    if (highlightReverseArrowMeshRef.current) {
      highlightReverseArrowMeshRef.current.count = safeCount;
      highlightReverseArrowMeshRef.current.instanceMatrix.needsUpdate = true;
      if (shouldRecomputeBounds) highlightReverseArrowMeshRef.current.computeBoundingSphere();
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
    if (reverseArrowMeshRef.current) {
      const colors = new Float32Array(MAX_INSTANCES * 3);
      reverseArrowMeshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      reverseArrowMeshRef.current.instanceColor.setUsage(THREE.DynamicDrawUsage);
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
        <meshBasicMaterial transparent opacity={0.5} depthWrite={false} />
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
        <meshBasicMaterial transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>

      <instancedMesh 
        ref={reverseArrowMeshRef} 
        args={[null, null, MAX_INSTANCES]} 
        frustumCulled={true}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        <coneGeometry args={[1, ARROW_SIZE, 3]} />
        <meshBasicMaterial transparent opacity={0.5} depthWrite={false} />
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
          opacity={0.45} 
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
          opacity={0.45} 
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color="#ffffff"
        />
      </instancedMesh>

      <instancedMesh 
        ref={highlightReverseArrowMeshRef} 
        args={[null, null, MAX_INSTANCES]} 
        frustumCulled={true}
      >
        <coneGeometry args={[1, ARROW_SIZE, 3]} />
        <meshBasicMaterial 
          transparent 
          opacity={0.45} 
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color="#ffffff"
        />
      </instancedMesh>

      {/* Tooltip HTML pour la relation survolée */}
      {hoveredEdge && (
        <Html
          position={[hoveredMidpointRef.current.x, hoveredMidpointRef.current.y + 1, hoveredMidpointRef.current.z]}
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
            {hoveredEdge.relations && hoveredEdge.relations.length > 0 ? (
              hoveredEdge.relations.map((rel, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
                  <span style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1 }}>
                    {rel.source === hoveredEdge.source ? "→" : "←"}
                  </span>
                  <span>{rel.description || rel.predicate || rel.type}</span>
                </div>
              ))
            ) : (
              hoveredEdge.label || hoveredEdge.type || 'Relation'
            )}
          </div>
        </Html>
      )}
    </group>
  );
};

export default InstancedEdges;
