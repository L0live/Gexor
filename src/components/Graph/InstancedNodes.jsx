import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';

const colorMap = {
  'Entity': '#3b82f6',
  'Event': '#10b981',
  'Context': '#8b5cf6',
  'Default': '#64748b'
};

const InstancedNodes = () => {
  const nodes = useGraphStore(state => state.nodes);
  const filters = useGraphStore(state => state.filters);
  const layout = useGraphStore(state => state.layoutInstance);
  const positions = useGraphStore(state => state.positions);
  const selectedNode = useGraphStore(state => state.selectedNode);
  const opacityLevels = useGraphStore(state => state.opacityLevels);
  const selectNode = useGraphStore(state => state.selectNode);
  const hoveredNodeId = useGraphStore(state => state.hoveredNodeId);
  const setHoveredNodeId = useGraphStore(state => state.setHoveredNodeId);

  const meshRef = useRef();

  // Objets temporaires pour éviter les allocations
  const _obj = useMemo(() => new THREE.Object3D(), []);
  const _color = useMemo(() => new THREE.Color(), []);
  const _v3 = useMemo(() => new THREE.Vector3(), []);

  // Filtrer les nodes visibles (seulement ceux dont le type est actif)
  const visibleNodes = useMemo(() => {
    return nodes.filter(node => filters[node.type]);
  }, [nodes, filters]);

  // Récupérer les données du node survolé
  const hoveredNode = useMemo(() => {
    return hoveredNodeId ? nodes.find(n => n.id === hoveredNodeId) : null;
  }, [hoveredNodeId, nodes]);

  // Seuil de LoD (doit être le même que dans Node.jsx)
  const lodThreshold = useMemo(() => {
    const total = nodes.length;
    const factor = Math.max(0.2, 1 - (total / 2000));
    return 400 * factor;
  }, [nodes.length]);

  // Initialiser les couleurs au montage ou quand le nombre de nodes change
  useEffect(() => {
    if (!meshRef.current) return;
    
    // On alloue de l'espace pour 5000 instances max
    const colors = new Float32Array(5000 * 3);
    const attr = new THREE.InstancedBufferAttribute(colors, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    meshRef.current.instanceColor = attr;
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;

    const count = visibleNodes.length;
    const safeCount = Math.min(count, 5000);
    const camPos = state.camera.position;

    for (let i = 0; i < safeCount; i++) {
      const node = visibleNodes[i];
      let pos;
      
      if (layout) {
        const body = layout.getBody(node.id);
        pos = body ? body.pos : positions[node.id];
      } else {
        pos = positions[node.id];
      }

      if (!pos) {
        _obj.matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _obj.matrix);
        continue;
      }

      _v3.set(pos.x, pos.y, pos.z);
      const dist = camPos.distanceTo(_v3);
      const isSelected = selectedNode?.id === node.id;

      // Niveau Instancié (Loin) : 
      // On affiche l'instance si on est plus loin que 90% du seuil.
      // Ça permet un overlap léger avec le fondu du Node.jsx pour une transition fluide.
      if (dist < lodThreshold * 0.9 || isSelected) {
        _obj.matrix.makeScale(0, 0, 0);
        meshRef.current.setMatrixAt(i, _obj.matrix);
        continue;
      }

      _obj.position.copy(_v3);
      // Taille pour les points lointains
      // On utilise node.size (normalement 8) multiplié par 2 car circleGeometry(0.5) a un diamètre de 1
      const size = (node.size || 8) * 1.5; 
      _obj.scale.set(size, size, 1); 
      _obj.quaternion.copy(state.camera.quaternion); // Toujours face caméra (Billboarding)
      _obj.updateMatrix();
      meshRef.current.setMatrixAt(i, _obj.matrix);

      // Mettre à jour la couleur
      const c = colorMap[node.type] || colorMap['Default'];
      _color.set(c);
      meshRef.current.setColorAt(i, _color);
    }

    meshRef.current.count = safeCount;
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  });

  const handlePointerMove = (e) => {
    e.stopPropagation();
    const index = e.instanceId;
    const node = visibleNodes[index];
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
    const index = e.instanceId;
    const node = visibleNodes[index];
    if (node) {
      selectNode(node.id);
    }
  };

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[null, null, 5000]} 
      frustumCulled={true}
      onClick={handleClick}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    >
      <circleGeometry args={[0.5, 16]} />
      <meshBasicMaterial 
        transparent 
        opacity={0.9}
        depthWrite={false} 
        toneMapped={false}
      />
    </instancedMesh>
  );
};

export default InstancedNodes;
