import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TrackballControls } from '@react-three/drei';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';

const DynamicTrackballControls = ({ isDragging }) => {
  const controlsRef = useRef();
  const positions = useGraphStore(state => state.positions);
  const centerOnNodeId = useGraphStore(state => state.centerOnNodeId);
  const centerOnPosition = useGraphStore(state => state.centerOnPosition);
  const setCameraControlsRef = useGraphStore(state => state.setCameraControlsRef);
  const clearCenterOnNode = useGraphStore(state => state.clearCenterOnNode);
  const clearCenterOnPosition = useGraphStore(state => state.clearCenterOnPosition);
  const centralNodeId = useGraphStore(state => state.centralNodeId);
  const simulationStable = useGraphStore(state => state.simulationStable);
  const { invalidate } = useThree();
  const userInteracted = useRef(false);
  const targetPosition = useRef(new THREE.Vector3());
  const isAnimating = useRef(false);

  // Exposer la ref aux contrôles pour le drag
  useEffect(() => {
    setCameraControlsRef(controlsRef);
  }, [setCameraControlsRef]);

  // frameloop="demand" : invalider le canvas à chaque mouvement caméra
  // Note : drei v10 ne gère PAS invalidate() automatiquement pour TrackballControls.
  // - start → amorce la première frame + active l'écoute pointermove
  // - pointermove (DOM) pendant isActive → maintient le rendu pendant le drag
  // - end → désactive l'écoute pointermove
  // - change → maintient le rendu pendant la décélération (damping post-end)
  useEffect(() => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    const domElement = controls.domElement;

    let isActive = false;

    const handleChange = () => invalidate();
    const handleStart = () => {
      userInteracted.current = true;
      isActive = true;
      invalidate(); // amorce la première frame
    };
    const handleEnd = () => {
      isActive = false;
      // 'change' gère la décélération restante via damping
    };
    const handlePointerMove = () => {
      if (isActive) invalidate();
    };

    controls.addEventListener('change', handleChange);
    controls.addEventListener('start', handleStart);
    controls.addEventListener('end', handleEnd);
    domElement.addEventListener('pointermove', handlePointerMove);

    return () => {
      controls.removeEventListener('change', handleChange);
      controls.removeEventListener('start', handleStart);
      controls.removeEventListener('end', handleEnd);
      domElement.removeEventListener('pointermove', handlePointerMove);
    };
  }, [invalidate]);
  
  // Déclencher l'animation quand centerOnNodeId ou centerOnPosition change
  useEffect(() => {
    if (!controlsRef.current) return;
    
    if (centerOnNodeId) {
      const nodePos = positions[centerOnNodeId];
      if (nodePos) {
        targetPosition.current.set(nodePos.x, nodePos.y, nodePos.z);
        isAnimating.current = true;
      }
      clearCenterOnNode();
    } else if (centerOnPosition) {
      targetPosition.current.set(centerOnPosition.x, centerOnPosition.y, centerOnPosition.z);
      isAnimating.current = true;
      clearCenterOnPosition();
    }
  }, [centerOnNodeId, centerOnPosition, positions, clearCenterOnNode, clearCenterOnPosition]);
  
  // Animer la transition du target ET suivre le node central tant que la simulation n'est pas stable
  useFrame((state) => {
    if (!controlsRef.current) return;

    // Tant que la simulation n'est pas stable et que l'utilisateur n'a pas interagi,
    // suivre directement le node central
    if (!simulationStable && !userInteracted.current && centralNodeId && positions[centralNodeId]) {
      const centralPos = positions[centralNodeId];
      controlsRef.current.target.set(centralPos.x, centralPos.y, centralPos.z);
      targetPosition.current.set(centralPos.x, centralPos.y, centralPos.z);
      state.invalidate();
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

    // frameloop="demand" : maintenir le rendu pendant l'animation caméra
    state.invalidate();
  });
  
  return (
    <TrackballControls
      ref={controlsRef}
      noPan={isDragging}
      noZoom={isDragging}
      noRotate={isDragging}
      minDistance={50}
      maxDistance={3000}
      rotateSpeed={4.0}
      panSpeed={0.2}
      zoomSpeed={2.0}
      dynamicDampingFactor={0.15}
    />
  );
};

export default DynamicTrackballControls;
