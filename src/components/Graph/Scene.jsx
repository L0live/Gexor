import React, { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import Node from './Node';
import InstancedEdges from './InstancedEdges';
import InstancedNodes from './InstancedNodes';
import DynamicTrackballControls from './DynamicTrackballControls';
import RadialSpheres from './RadialSpheres';
import { setRadialActive } from '../../utils/radialLayout';
import { writePosition } from '../../utils/sharedPositions';

const Scene = () => {
  const nodes = useGraphStore(state => state.nodes);
  const edges = useGraphStore(state => state.edges);
  const positions = useGraphStore(state => state.positions);
  const selectedNode = useGraphStore(state => state.selectedNode);
  const selectedEdge = useGraphStore(state => state.selectedEdge);
  const selectNode = useGraphStore(state => state.selectNode);
  const selectEdge = useGraphStore(state => state.selectEdge);
  const draggedNodeId = useGraphStore(state => state.draggedNodeId);
  const setDraggedNode = useGraphStore(state => state.setDraggedNode);
  const unpinNode = useGraphStore(state => state.unpinNode);
  const setPositions = useGraphStore(state => state.setPositions);
  const cameraControlsRef = useGraphStore(state => state.cameraControlsRef);
  const pinDraggedNodeOnly = useGraphStore(state => state.pinDraggedNodeOnly);
  const pinnedNodes = useGraphStore(state => state.pinnedNodes);
  const autoDragNode = useGraphStore(state => state.autoDragNode);
  const setAutoDragNode = useGraphStore(state => state.setAutoDragNode);

  const { camera, size, gl, invalidate } = useThree();
  const layoutReady = useGraphStore(state => state.layoutReady);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const dragStartInfoRef = useRef(null);
  const radialFrameCounterRef = useRef(0);

  // frameloop="demand" : invalider le canvas uniquement pour les changements visuellement pertinents.
  // Les mutations non-visuelles (loadedNodes, sparqlRequestCount, loadingUris, etc.)
  // ne déclenchent pas de frame → zéro rendu superflu à l'idle.
  useEffect(() => {
    const visualKeys = [
      'positions', 'nodes', 'edges',
      'hoveredNodeId', 'hoveredEdgeId',
      'selectedNode', 'selectedEdge',
      'radialTargets', 'recentlyAddedNodes',
    ];
    let prev = useGraphStore.getState();
    return useGraphStore.subscribe((state) => {
      for (const key of visualKeys) {
        if (state[key] !== prev[key]) {
          prev = state;
          invalidate();
          return;
        }
      }
      prev = state;
    });
  }, [invalidate]);

  // Convertir des coordonnées écran en position 3D dans le monde
  const getWorldPosFromScreen = useCallback((clientX, clientY, depthReference = new THREE.Vector3(0, 0, 0)) => {
    if (!camera || !size) return new THREE.Vector3(0, 0, 0);
    
    // Calculer les coordonnées NDC (-1 à +1) par rapport au canvas Three.js
    // Note : On utilise window.innerWidth/Height si le canvas fait toute la page, 
    // ou size.width/height si le canvas est dans un conteneur. 
    // Ici size est plus fiable car fourni par @react-three/fiber.
    const rect = gl.domElement?.getBoundingClientRect();
    const x = rect ? ((clientX - rect.left) / rect.width) * 2 - 1 : (clientX / size.width) * 2 - 1;
    const y = rect ? -((clientY - rect.top) / rect.height) * 2 + 1 : -(clientY / size.height) * 2 + 1;
    
    const vector = new THREE.Vector3(x, y, 0.5);
    vector.unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    
    // Calculer la distance au plan perpendiculaire à la caméra passant par depthReference
    const planeNormal = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize();
    const dist = (depthReference.clone().sub(camera.position).dot(planeNormal)) / dir.dot(planeNormal);
    
    return new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(dist));
  }, [camera, size]);

  // Convertir le mouvement écran en déplacement 3D en tenant compte de la rotation caméra et du zoom
  const screenToWorldDelta = useCallback((clientDelta, draggedNodePos) => {
    if (!camera) {
      return { x: clientDelta.x * 0.1, y: -clientDelta.y * 0.1, z: 0 };
    }
    
    // Utiliser la distance caméra -> node draggé pour un calcul plus précis
    const nodePos = new THREE.Vector3(draggedNodePos.x, draggedNodePos.y, draggedNodePos.z);
    const cameraDistance = camera.position.distanceTo(nodePos);
    
    // Ajuster le facteur de déplacement selon le zoom
    const zoomFactor = cameraDistance / 100;
    
    // Vecteurs de base pour le repère de la caméra
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    
    // Appliquer la transformation avec le facteur de zoom
    const worldDelta = new THREE.Vector3();
    worldDelta.addScaledVector(right, clientDelta.x * 0.1 * zoomFactor);
    worldDelta.addScaledVector(up, -clientDelta.y * 0.1 * zoomFactor);
    
    return { x: worldDelta.x, y: worldDelta.y, z: worldDelta.z };
  }, [camera]);

  // Vérifier si un node est connecté (directement ou indirectement) à un node pinné
  const isConnectedToPinnedNode = useCallback((nodeId) => {
    const { isPinned } = useGraphStore.getState();
    const visited = new Set();
    const queue = [nodeId];
    
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      if (currentId !== nodeId && isPinned(currentId)) {
        return true;
      }
      
      edges.forEach(edge => {
        if (edge.source === currentId && !visited.has(edge.target)) {
          queue.push(edge.target);
        }
        if (edge.target === currentId && !visited.has(edge.source)) {
          queue.push(edge.source);
        }
      });
    }
    return false;
  }, [edges]);

  // Gestion du drag fin
  const handleDragEnd = useCallback((nodeId) => {
    const { draggedNodeId: currentId, layoutInstance: worker } = useGraphStore.getState();
    if (!currentId) return;
    
    const { pinDraggedNodeOnly, saveToHistory } = useGraphStore.getState();
    document.body.style.cursor = 'default';
    
    // 1. Compute final drag position from mouse
    const startInfo = dragStartInfoRef.current;
    if (startInfo && worker?.postMessage) {
      const currentMouse = mousePosRef.current;
      const worldDelta = screenToWorldDelta(
        { x: currentMouse.x - startInfo.startX, y: currentMouse.y - startInfo.startY }, 
        { x: startInfo.nodeStartX, y: startInfo.nodeStartY, z: startInfo.nodeStartZ }
      );
      const finalPos = {
        x: startInfo.nodeStartX + worldDelta.x,
        y: startInfo.nodeStartY + worldDelta.y,
        z: startInfo.nodeStartZ + worldDelta.z
      };
      // Send final position to worker
      worker.postMessage({ type: 'setBodyPosition', nodeId: currentId, ...finalPos });
    }

    // 2. Reset all velocities + clear drag state in worker
    if (worker?.postMessage) {
      worker.postMessage({ type: 'resetVelocity', nodeId: 'all' });
      worker.postMessage({ type: 'setDraggedNode', nodeId: null });
    }
    
    // 3. Rétablir le statut isPinned si le node l'était déjà
    if (startInfo?.wasPinned) {
      pinDraggedNodeOnly(currentId);
    } else if (worker?.postMessage) {
      worker.postMessage({ type: 'unpinNode', nodeId: currentId });
    }
    
    // 4. Libérer le node dans le store UI
    setDraggedNode(null);
    dragStartInfoRef.current = null;
    
    // 5. Sauvegarder dans l'historique
    if (startInfo?.shouldSave) {
      setTimeout(() => saveToHistory(), 100);
    }
    
    // 6. Wake simulation
    const { wakeSimulation, setSimulationActive } = useGraphStore.getState();
    setSimulationActive(true);
    wakeSimulation();
    
    setTimeout(() => {
      const { repinNodes, setSimulationActive: stopSim } = useGraphStore.getState();
      repinNodes();
      stopSim(false);
    }, 3000);
  }, [setDraggedNode, pinDraggedNodeOnly, screenToWorldDelta]);

  const handleDragStart = useCallback((nodeId, clientX, clientY) => {
    const { isPinned, saveToHistory, positions: currentPositions, layoutInstance: worker } = useGraphStore.getState();
    const wasPinned = isPinned(nodeId);
    let shouldSave = wasPinned || !isConnectedToPinnedNode(nodeId);
    
    if (shouldSave) saveToHistory();
    
    setDraggedNode(nodeId);
    unpinNode(nodeId);
    
    // Position from the store (worker keeps physics in sync)
    const nodePos = currentPositions[nodeId] || { x: 0, y: 0, z: 0 };
    
    // Tell worker about drag
    if (worker?.postMessage) {
      worker.postMessage({ type: 'setDraggedNode', nodeId, x: nodePos.x, y: nodePos.y, z: nodePos.z });
    }
    
    dragStartInfoRef.current = {
      startX: clientX,
      startY: clientY,
      nodeStartX: nodePos.x,
      nodeStartY: nodePos.y,
      nodeStartZ: nodePos.z,
      wasPinned,
      shouldSave,
      startTime: Date.now()
    };
  }, [isConnectedToPinnedNode, edges, nodes.length, setDraggedNode, unpinNode]);

  // Gérer le drag automatique (ajout depuis l'UI)
  useEffect(() => {
    if (autoDragNode) {
      const { nodeId, clientX, clientY } = autoDragNode;
      let attempts = 0;
      
      const checkAndStart = () => {
        const { positions: currentPositions, layoutInstance: worker } = useGraphStore.getState();
        // Wait until the worker has produced a position for this node
        if (currentPositions[nodeId]) {
          // Réveil forcé de la simulation
          const { setSimulationActive, wakeSimulation, selectedNode: selNode } = useGraphStore.getState();
          setSimulationActive(true);
          wakeSimulation();
          
          // Positionner le node au curseur avant de commencer le drag
          const depthRef = selNode && currentPositions[selNode.id] 
            ? new THREE.Vector3(currentPositions[selNode.id].x, currentPositions[selNode.id].y, currentPositions[selNode.id].z)
            : new THREE.Vector3(0, 0, 0);
          
          const worldPos = getWorldPosFromScreen(clientX, clientY, depthRef);
          
          // Tell worker to position the body
          if (worker?.postMessage) {
            worker.postMessage({ type: 'setBodyPosition', nodeId, x: worldPos.x, y: worldPos.y, z: worldPos.z });
          }
          
          handleDragStart(nodeId, clientX, clientY);
          setAutoDragNode(null);
          return true;
        }
        return false;
      };

      if (!checkAndStart()) {
        const interval = setInterval(() => {
          attempts++;
          if (checkAndStart() || attempts > 20) {
            clearInterval(interval);
            if (attempts > 20) setAutoDragNode(null);
          }
        }, 50);
        return () => clearInterval(interval);
      }
    }
  }, [autoDragNode, handleDragStart, setAutoDragNode]);

  // Tracker la souris
  useEffect(() => {
    const handleMouseMove = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = (e) => {
      const { draggedNodeId: currentId } = useGraphStore.getState();
      if (currentId) {
        // Ignorer le mouseup s'il survient trop vite après le début du drag (cas du double-clic)
        // Cela permet au node de rester "collé" à la souris pour un placement libre
        const duration = Date.now() - (dragStartInfoRef.current?.startTime || 0);
        if (duration < 200) {
          return;
        }
        
        e.stopPropagation();
        handleDragEnd(currentId);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleDragEnd]);

  // Gérer le clic molette pour le recentrage
  useEffect(() => {
    const glElement = gl.domElement;
    
    const handlePointerDown = (e) => {
      // Bouton 1 = clic molette (middle click)
      if (e.button === 1) {
        const state = useGraphStore.getState();
        const { 
          selectedNode, 
          selectedEdge, 
          nodes, 
          positions, 
          triggerCenterOnNode, 
          triggerCenterOnPosition 
        } = state;

        if (selectedNode) {
          triggerCenterOnNode(selectedNode.id);
        } else if (selectedEdge) {
          // Recentrer sur le milieu de l'arête sélectionnée
          const sourcePos = positions[selectedEdge.source];
          const targetPos = positions[selectedEdge.target];
          if (sourcePos && targetPos) {
            triggerCenterOnPosition({
              x: (sourcePos.x + targetPos.x) / 2,
              y: (sourcePos.y + targetPos.y) / 2,
              z: (sourcePos.z + targetPos.z) / 2
            });
          }
        } else {
          // Recentrer sur le centre de masse global
          let sumX = 0, sumY = 0, sumZ = 0, count = 0;
          
          nodes.forEach(node => {
            const pos = positions[node.id];
            if (pos) {
              sumX += pos.x;
              sumY += pos.y;
              sumZ += pos.z;
              count++;
            }
          });

          if (count > 0) {
            triggerCenterOnPosition({
              x: sumX / count,
              y: sumY / count,
              z: sumZ / count
            });
          }
        }
      }
    };

    glElement.addEventListener('pointerdown', handlePointerDown);
    return () => {
      glElement.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [gl, nodes, positions]);

  // Drag position override + radial update (physics is handled by the Web Worker)
  useFrame((state) => {
    const {
      draggedNodeId: currentDraggedId,
      pinnedNodes: currentPinnedNodes,
      layoutInstance: worker
    } = useGraphStore.getState();

    // ── Drag: compute expected position from mouse & push to store + worker ──
    if (currentDraggedId && dragStartInfoRef.current) {
      const currentMousePos = mousePosRef.current;
      const info = dragStartInfoRef.current;
      const worldDelta = screenToWorldDelta(
        { x: currentMousePos.x - info.startX, y: currentMousePos.y - info.startY },
        { x: info.nodeStartX, y: info.nodeStartY, z: info.nodeStartZ }
      );
      const dragPos = {
        x: info.nodeStartX + worldDelta.x,
        y: info.nodeStartY + worldDelta.y,
        z: info.nodeStartZ + worldDelta.z
      };

      // Optimistic update: write drag position to SAB (zero-copy) + store
      writePosition(currentDraggedId, dragPos.x, dragPos.y, dragPos.z);
      const currentPositions = useGraphStore.getState().positions;
      useGraphStore.getState().setPositions({
        ...currentPositions,
        [currentDraggedId]: dragPos
      });

      // Tell worker so physics reacts
      if (worker?.postMessage) {
        worker.postMessage({ type: 'setBodyPosition', nodeId: currentDraggedId, ...dragPos });
      }

      // frameloop="demand" : maintenir le rendu pendant le drag
      state.invalidate();
    }

    // ── Radial plugin — update target positions (purely visual) ──
    {
      const {
        nodeSettings: currentNodeSettings,
        updateRadialTargets,
      } = useGraphStore.getState();

      let hasRadialGroup = false;
      for (const settings of Object.values(currentNodeSettings)) {
        if (settings?.renderMode === 'radial') { hasRadialGroup = true; break; }
      }

      if (hasRadialGroup) {
        radialFrameCounterRef.current++;
        if (radialFrameCounterRef.current >= 10) {
          radialFrameCounterRef.current = 0;
          updateRadialTargets();
        }
        // frameloop="demand" : maintenir le rendu pendant le mode radial
        state.invalidate();
      } else {
        if (radialFrameCounterRef.current !== 0) {
          radialFrameCounterRef.current = 0;
          setRadialActive(false);
        }
      }
    }
  });
  
  return (
    <>
      {/* Lumière ambiante simple comme OldVersionGraph */}
      <ambientLight intensity={1.0} />
      
      {/* Contrôles trackball dynamiques */}
      <DynamicTrackballControls isDragging={!!draggedNodeId} />
      
      {/* Rendu des Edges & Nodes Instanciés */}
      <InstancedEdges />
      <InstancedNodes />

      {/* Sphères radiales (wireframe) pour les nœuds en mode radial */}
      <RadialSpheres />
      
      {/* Nodes (React - Proche) */}
      {nodes.map((node) => {
        return (
        <Node
          key={node.id}
          node={node}
          position={positions[node.id]}
          visible={true}
          isSelected={selectedNode?.id === node.id}
          isDragging={draggedNodeId === node.id}
          isPinned={pinnedNodes.has(node.id)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          totalNodes={nodes.length}
          onClick={(e) => {
            e.stopPropagation();
            selectNode(node.id);
          }}
        />
      );})}
    </>
  );
};

export default Scene;
