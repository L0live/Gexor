import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { TrackballControls } from '@react-three/drei';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';

const DynamicTrackballControls = ({ isDragging }) => {
  const controlsRef = useRef();
  const { positions, centerOnNodeId, setCameraControlsRef, clearCenterOnNode, centralNodeId, simulationStable } = useGraphStore();
  const userInteracted = useRef(false);
  const targetPosition = useRef(new THREE.Vector3());
  const isAnimating = useRef(false);
  
  // Exposer la ref aux contrôles pour le drag
  useEffect(() => {
    setCameraControlsRef(controlsRef);
  }, [setCameraControlsRef]);
  
  // Détecter quand l'utilisateur interagit avec les contrôles
  useEffect(() => {
    if (!controlsRef.current) return;
    
    const handleStart = () => {
      userInteracted.current = true;
    };
    
    const controls = controlsRef.current;
    controls.addEventListener('start', handleStart);
    
    return () => {
      controls.removeEventListener('start', handleStart);
    };
  }, []);
  
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
  
  // Animer la transition du target ET suivre le node central tant que la simulation n'est pas stable
  useFrame(() => {
    if (!controlsRef.current) return;
    
    // Tant que la simulation n'est pas stable et que l'utilisateur n'a pas interagi,
    // suivre directement le node central
    if (!simulationStable && !userInteracted.current && centralNodeId && positions[centralNodeId]) {
      const centralPos = positions[centralNodeId];
      controlsRef.current.target.set(centralPos.x, centralPos.y, centralPos.z);
      targetPosition.current.set(centralPos.x, centralPos.y, centralPos.z);
      return;
    }
    
    // Animation du centre orbital (quand on clique sur un node)
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
    <TrackballControls
      ref={controlsRef}
      noPan={isDragging}
      noZoom={isDragging}
      noRotate={isDragging}
      minDistance={50}
      maxDistance={800}
      rotateSpeed={4.0}
      panSpeed={0.2}
      zoomSpeed={2.0}
      dynamicDampingFactor={0.15}
    />
  );
};

export default DynamicTrackballControls;
