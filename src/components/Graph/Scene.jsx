import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import useNgraphLayout from '../../hooks/useNgraphLayout';
import Node from './Node';
import Edge from './Edge';
import InstancedEdges from './InstancedEdges';
import InstancedNodes from './InstancedNodes';
import DynamicTrackballControls from './DynamicTrackballControls';

const Scene = () => {
  const nodes = useGraphStore(state => state.nodes);
  const edges = useGraphStore(state => state.edges);
  const filters = useGraphStore(state => state.filters);
  const filterModes = useGraphStore(state => state.filterModes);
  const opacityLevels = useGraphStore(state => state.opacityLevels);
  const showRelations = useGraphStore(state => state.showRelations);
  const positions = useGraphStore(state => state.positions);
  const selectedNode = useGraphStore(state => state.selectedNode);
  const selectedEdge = useGraphStore(state => state.selectedEdge);
  const selectNode = useGraphStore(state => state.selectNode);
  const selectEdge = useGraphStore(state => state.selectEdge);
  const draggedNodeId = useGraphStore(state => state.draggedNodeId);
  const setDraggedNode = useGraphStore(state => state.setDraggedNode);
  const unpinNode = useGraphStore(state => state.unpinNode);
  const repinNodes = useGraphStore(state => state.repinNodes);
  const pinAllNodes = useGraphStore(state => state.pinAllNodes);
  const dragLayout = useGraphStore(state => state.dragLayout);
  const setPositions = useGraphStore(state => state.setPositions);
  const cameraControlsRef = useGraphStore(state => state.cameraControlsRef);
  const computeNodeLayers = useGraphStore(state => state.computeNodeLayers);
  const pinDraggedNodeOnly = useGraphStore(state => state.pinDraggedNodeOnly);
  const pinnedNodes = useGraphStore(state => state.pinnedNodes);
  const individualNodeOpacity = useGraphStore(state => state.individualNodeOpacity);
  const individualEdgeOpacity = useGraphStore(state => state.individualEdgeOpacity);
  
  const { camera } = useThree();
  const { layout } = useNgraphLayout();
  const mousePosRef = useRef({ x: 0, y: 0 });
  const dragStartInfoRef = useRef(null);
  const stabilityCounterRef = useRef(0);
  const lastModeRef = useRef(null);

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
    const { draggedNodeId: currentId } = useGraphStore.getState();
    if (!layout || !currentId) return;
    
    const { pinDraggedNodeOnly, setPositions, saveToHistory } = useGraphStore.getState();
    document.body.style.cursor = 'default';
    
    // 1. Forcer une dernière fois la position physique via la souris pour éviter tout saut
    const body = layout.getBody(currentId);
    const startInfo = dragStartInfoRef.current;
    if (body && startInfo) {
      const currentMouse = mousePosRef.current;
      const worldDelta = screenToWorldDelta(
        { x: currentMouse.x - startInfo.startX, y: currentMouse.y - startInfo.startY }, 
        { x: startInfo.nodeStartX, y: startInfo.nodeStartY, z: startInfo.nodeStartZ }
      );
      body.pos.x = startInfo.nodeStartX + worldDelta.x;
      body.pos.y = startInfo.nodeStartY + worldDelta.y;
      body.pos.z = startInfo.nodeStartZ + worldDelta.z;
      body.velocity.x = body.velocity.y = body.velocity.z = 0;
    }

    // 2. Synchronisation FINALE du layout vers le store
    // On capture la position exacte à l'instant T et on stoppe toute vélocité résiduelle
    const newPositions = {};
    layout.forEachBody((b, id) => {
      newPositions[id] = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
      // Stopper la vélocité pour éviter le "rebond" ou "snap-back" violent au lâcher
      b.velocity.x = 0;
      b.velocity.y = 0;
      b.velocity.z = 0;
    });
    setPositions(newPositions);
    
    // 3. Rétablir le statut isPinned si le node l'était déjà
    if (startInfo?.wasPinned) {
      pinDraggedNodeOnly(layout, currentId);
    } else {
      // S'assurer qu'il reste débloqué si il ne l'était pas
      body.isPinned = false;
    }
    
    // 4. Libérer le node dans le store UI
    setDraggedNode(null);
    dragStartInfoRef.current = null;
    
    // 5. Sauvegarder dans l'historique
    if (startInfo?.shouldSave) {
      setTimeout(() => saveToHistory(), 100);
    }
    
    // 6. Stabiliser les voisins (repin après 3s)
    const { setSimulationActive, setSimulationStable } = useGraphStore.getState();
    setSimulationActive(true);
    setSimulationStable(false);
    
    setTimeout(() => {
      const { repinNodes, setSimulationActive: stopSim } = useGraphStore.getState();
      repinNodes(layout);
      stopSim(false);
    }, 3000);
  }, [layout, setPositions, setDraggedNode, pinDraggedNodeOnly, screenToWorldDelta]);

  const handleDragStart = useCallback((nodeId, clientX, clientY) => {
    const { isPinned, saveToHistory, positions: currentPositions } = useGraphStore.getState();
    const wasPinned = isPinned(nodeId);
    let shouldSave = wasPinned || !isConnectedToPinnedNode(nodeId);
    
    if (shouldSave) saveToHistory();
    
    setDraggedNode(nodeId);
    unpinNode(nodeId, layout);
    computeNodeLayers(nodeId, edges, nodes.length);
    
    const nodePos = currentPositions[nodeId] || { x: 0, y: 0, z: 0 };
    
    dragStartInfoRef.current = {
      startX: clientX,
      startY: clientY,
      nodeStartX: nodePos.x,
      nodeStartY: nodePos.y,
      nodeStartZ: nodePos.z,
      wasPinned,
      shouldSave
    };
  }, [layout, isConnectedToPinnedNode, edges, nodes.length, setDraggedNode, unpinNode, computeNodeLayers]);

  // Tracker la souris
  useEffect(() => {
    const handleMouseMove = (e) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = (e) => {
      const { draggedNodeId: currentId } = useGraphStore.getState();
      if (currentId) {
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

  // Simuler la physique en continu
  useFrame(() => {
    const { 
      simulationActive, 
      layoutReady, 
      simulationPaused, 
      simulationStable,
      setSimulationStable,
      layoutMode,
      nodeLayersMap,
      maxLayers,
      positions: storePositions,
      draggedNodeId: currentDraggedId,
      pinnedNodes: currentPinnedNodes
    } = useGraphStore.getState();

    if (lastModeRef.current !== layoutMode) {
      stabilityCounterRef.current = 0;
      lastModeRef.current = layoutMode;
    }
    
    // Ne pas simuler si pause ou stable, sauf si on drag ou simulation forcée
    if (!currentDraggedId && !simulationActive && (simulationPaused || (simulationStable && layoutMode === 'force'))) {
      return;
    }
    
    if (layout && (layoutReady || currentDraggedId || simulationActive)) {
      const currentMousePos = mousePosRef.current;
      
      // 1. Appliquer la position du drag depuis la souris (Avant le step)
      if (currentDraggedId && dragStartInfoRef.current) {
        const body = layout.getBody(currentDraggedId);
        if (body) {
          const info = dragStartInfoRef.current;
          const worldDelta = screenToWorldDelta(
            { x: currentMousePos.x - info.startX, y: currentMousePos.y - info.startY }, 
            { x: info.nodeStartX, y: info.nodeStartY, z: info.nodeStartZ }
          );
          body.pos.x = info.nodeStartX + worldDelta.x;
          body.pos.y = info.nodeStartY + worldDelta.y;
          body.pos.z = info.nodeStartZ + worldDelta.z;
          body.velocity.x = body.velocity.y = body.velocity.z = 0;
          body.isPinned = false; // S'assurer qu'il n'est pas bloqué pendant qu'on le bouge
        }
      }
      
      // 2. S'assurer que les nodes pinnés sont bien bloqués dans le moteur physique
      currentPinnedNodes.forEach(nodeId => {
        if (nodeId === currentDraggedId) return;
        const body = layout.getBody(nodeId);
        if (body) {
          body.isPinned = true;
          // on ne force plus body.pos.x = storePositions[nodeId].x; 
          // car ngraph garde la position en mémoire et Step 7 synchronise le store.
        }
      });
      
      // 3. Appliquer les atténuations de force (layers)
      layout.forEachBody((body, nodeId) => {
        if (body.isPinned || nodeId === currentDraggedId) return;
        const layer = nodeLayersMap[nodeId];
        if (layer !== undefined && layer <= maxLayers) {
          const forceFactor = Math.max(0, (layer - 1) / maxLayers);
          body.velocity.x *= (0.1 + forceFactor * 0.9);
          body.velocity.y *= (0.1 + forceFactor * 0.9);
          body.velocity.z *= (0.1 + forceFactor * 0.9);
        }
      });
      
      // 4. Avancer la simulation
      layout.step();
      
      // 5. Re-forcer la position du drag APRÈS le step pour éviter le tremblement visuel
      if (currentDraggedId && dragStartInfoRef.current) {
        const body = layout.getBody(currentDraggedId);
        if (body) {
          const info = dragStartInfoRef.current;
          const currentMousePos = mousePosRef.current;
          const worldDelta = screenToWorldDelta(
            { x: currentMousePos.x - info.startX, y: currentMousePos.y - info.startY }, 
            { x: info.nodeStartX, y: info.nodeStartY, z: info.nodeStartZ }
          );
          body.pos.x = info.nodeStartX + worldDelta.x;
          body.pos.y = info.nodeStartY + worldDelta.y;
          body.pos.z = info.nodeStartZ + worldDelta.z;
        }
      }

      // 6. Détection de stabilité
      if (!currentDraggedId && layoutMode === 'force') {
        let maxMoveSq = 0;
        layout.forEachBody((body, nodeId) => {
          if (!body.isPinned && storePositions[nodeId]) {
            const dx = body.pos.x - storePositions[nodeId].x;
            const dy = body.pos.y - storePositions[nodeId].y;
            const dz = body.pos.z - storePositions[nodeId].z;
            const moveSq = dx*dx + dy*dy + dz*dz;
            if (moveSq > maxMoveSq) maxMoveSq = moveSq;
          }
        });
        if (maxMoveSq < 0.0001) {
          if (++stabilityCounterRef.current > 60) {
            setSimulationStable(true);
            stabilityCounterRef.current = 0;
          }
        } else {
          stabilityCounterRef.current = 0;
        }
      } else {
        stabilityCounterRef.current = 0;
      }

      // 7. Synchronisation finale vers le store (positions)
      const currentPosStore = useGraphStore.getState().positions;
      const newPositions = { ...currentPosStore }; 
      let hasSignificantMove = false;
      
      layout.forEachBody((body, nodeId) => {
        const oldPos = currentPosStore[nodeId];
        newPositions[nodeId] = { x: body.pos.x, y: body.pos.y, z: body.pos.z };
        if (!oldPos || Math.abs(body.pos.x - oldPos.x) > 0.001 || Math.abs(body.pos.y - oldPos.y) > 0.001) {
          hasSignificantMove = true;
        }
      });
      
      const { simulationStable: isStable, setPositions: setPos, simulationActive: isActive } = useGraphStore.getState();
      if (hasSignificantMove || isActive || !isStable || currentDraggedId) {
        setPos(newPositions);
      }
    }
  });
  
  return (
    <>
      {/* Lumière ambiante simple comme OldVersionGraph */}
      <ambientLight intensity={1.0} />
      
      {/* Contrôles trackball dynamiques */}
      <DynamicTrackballControls isDragging={!!draggedNodeId} />
      
      {/* Edges Instanciés */}
      <InstancedEdges />
      
      {/* Nodes Instanciés (Loin) */}
      <InstancedNodes />
      
      {/* Nodes (React - Proche) */}
      {nodes.map((node) => {
        // Affichage basé sur le filtre global
        const visible = filters[node.type];
        
        // Ne pas rendre du tout les nodes non visibles
        if (!visible) return null;
        
        // Opacité: minimum entre type et individuel
        const nodeOpacity = Math.min(
          opacityLevels[node.type],
          individualNodeOpacity[node.id] ?? 1
        );
        
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
          opacityLevel={nodeOpacity}
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
