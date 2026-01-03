import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';

const DynamicOrbitControls = ({ isDragging }) => {
  const controlsRef = useRef();
  const { nodes, positions, filters, centerOnNodeId, setCameraControlsRef, clearCenterOnNode, pinnedNodes } = useGraphStore();
  const targetInitialized = useRef(false);
  const targetPosition = useRef(new THREE.Vector3());
  const isAnimating = useRef(false);
  
  // Exposer la ref aux contrôles pour le drag
  useEffect(() => {
    setCameraControlsRef(controlsRef);
  }, [setCameraControlsRef]);
  
  // Initialiser le target au node central (le plus connecté) ou au centre de masse
  useEffect(() => {
    if (!controlsRef.current || targetInitialized.current) return;
    
    // Calculer le centre de masse des nodes visibles
    const visibleNodes = nodes.filter(n => filters[n.type] && positions[n.id]);
    if (visibleNodes.length === 0) return;
    
    // Trouver le node pinné (normalement c'est le node central initial)
    const pinnedNodeIds = Array.from(pinnedNodes);
    let centerX = 0, centerY = 0, centerZ = 0;
    
    if (pinnedNodeIds.length > 0 && positions[pinnedNodeIds[0]]) {
      // Centrer sur le premier node pinné (node central)
      const centralPos = positions[pinnedNodeIds[0]];
      centerX = centralPos.x;
      centerY = centralPos.y;
      centerZ = centralPos.z;
    } else {
      // Sinon, centrer sur le centre de masse
      visibleNodes.forEach(node => {
        const pos = positions[node.id];
        centerX += pos.x;
        centerY += pos.y;
        centerZ += pos.z;
      });
      centerX /= visibleNodes.length;
      centerY /= visibleNodes.length;
      centerZ /= visibleNodes.length;
    }
    
    // Définir le target initial
    controlsRef.current.target.set(centerX, centerY, centerZ);
    targetPosition.current.set(centerX, centerY, centerZ);
    targetInitialized.current = true;
  }, [nodes, positions, filters, pinnedNodes]);
  
  // Déclencher l'animation quand centerOnNodeId change
  useEffect(() => {
    if (!controlsRef.current || !centerOnNodeId) return;
    
    const nodePos = positions[centerOnNodeId];
    if (!nodePos) return;
    
    // Définir la nouvelle position cible et démarrer l'animation
    targetPosition.current.set(nodePos.x, nodePos.y, nodePos.z);
    isAnimating.current = true;
    
    // Nettoyer après avoir déclenché l'animation
    clearCenterOnNode();
  }, [centerOnNodeId, positions, clearCenterOnNode]);
  
  // Animer la transition du target
  useFrame(() => {
    if (!controlsRef.current) return;
    
    // Animation du centre orbital
    if (!isAnimating.current) return;
    
    const current = controlsRef.current.target;
    const target = targetPosition.current;
    
    // Interpolation douce (lerp avec facteur 0.05 pour une animation fluide)
    current.x += (target.x - current.x) * 0.05;
    current.y += (target.y - current.y) * 0.05;
    current.z += (target.z - current.z) * 0.05;
    
    // Arrêter l'animation quand on est assez proche
    const distance = current.distanceTo(target);
    if (distance < 0.1) {
      current.copy(target);
      isAnimating.current = false;
    }
  });
  
  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={!isDragging}
      enableZoom={!isDragging}
      enableRotate={!isDragging}
      minDistance={5}
      maxDistance={900}
      enableDamping={true}
      dampingFactor={0.05}
    />
  );
};

export default DynamicOrbitControls;
