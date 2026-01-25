import React, { useState, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGraphStore from '../../store/useGraphStore';
import useNgraphLayout from '../../hooks/useNgraphLayout';
import Node from './Node';
import Edge from './Edge';
import DynamicOrbitControls from './DynamicOrbitControls';

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
  const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });
  const dragStartInfoRef = useRef(null);
  const stabilityCounterRef = useRef(0);
  const lastModeRef = useRef(null);
  
  // Simuler la physique en continu
  useFrame(() => {
    const { 
      simulationActive, 
      layoutReady, 
      simulationPaused, 
      simulationStable,
      setSimulationStable,
      layoutMode
    } = useGraphStore.getState();

    // Reset le compteur si on change de mode
    if (lastModeRef.current !== layoutMode) {
      stabilityCounterRef.current = 0;
      lastModeRef.current = layoutMode;
    }
    
    // Ne pas simuler si la simulation est en pause ou déjà stable (auto-arrêtée)
    // IMPORTANT: On ne stabilise automatiquement QUE en mode 'force'
    if (simulationPaused || (simulationStable && layoutMode === 'force')) {
      return;
    }
    
    // Toujours simuler si le layout est prêt (sauf pendant la phase initiale de runSimulation)
    if (layout && (layoutReady || draggedNodeId || simulationActive)) {
      const { nodeLayersMap, maxLayers, positions: storePositions } = useGraphStore.getState();
      
      // IMPORTANT: Si drag actif, forcer la position du node draggé avant layout.step()
      if (draggedNodeId) {
        const draggedBody = layout.getBody(draggedNodeId);
        const draggedPos = storePositions[draggedNodeId];
        if (draggedBody && draggedPos) {
          draggedBody.pos.x = draggedPos.x;
          draggedBody.pos.y = draggedPos.y;
          draggedBody.pos.z = draggedPos.z;
          draggedBody.velocity.x = 0;
          draggedBody.velocity.y = 0;
          draggedBody.velocity.z = 0;
        }
      }
      
      // Appliquer un gradient de force selon la couche (SAUF pour les nodes pinnés)
      layout.forEachBody((body, nodeId) => {
        // Forcer la vélocité des nodes pinnés à 0 (incluant le node draggé après lâcher)
        if (body.pinned) {
          body.velocity.x = 0;
          body.velocity.y = 0;
          body.velocity.z = 0;
          return;
        }
        
        // Skip si c'est le node en drag actif
        if (nodeId === draggedNodeId) return;
        
        const layer = nodeLayersMap[nodeId];
        if (layer !== undefined && layer <= maxLayers) {
          // Gradient : couche 1 (voisins directs) = force faible, augmente jusqu'à maxLayers
          const forceFactor = Math.max(0, (layer - 1) / maxLayers);
          
          // Réduire la force en scalant la vélocité
          body.velocity.x *= (0.1 + forceFactor * 0.9);
          body.velocity.y *= (0.1 + forceFactor * 0.9);
          body.velocity.z *= (0.1 + forceFactor * 0.9);
        }
      });
      
      layout.step();
      
      // Forcer ENCORE la position du node draggé après layout.step() (si drag actif)
      if (draggedNodeId) {
        const draggedBody = layout.getBody(draggedNodeId);
        const draggedPos = storePositions[draggedNodeId];
        if (draggedBody && draggedPos) {
          draggedBody.pos.x = draggedPos.x;
          draggedBody.pos.y = draggedPos.y;
          draggedBody.pos.z = draggedPos.z;
        }
      }

      // Mettre à jour les positions des nodes pinnés dans le layout
      pinnedNodes.forEach(nodeId => {
        const body = layout.getBody(nodeId);
        const pos = storePositions[nodeId];
        if (body && pos) {
          body.pos.x = pos.x;
          body.pos.y = pos.y;
          body.pos.z = pos.z;
          body.velocity.x = 0;
          body.velocity.y = 0;
          body.velocity.z = 0;
        }
      });
      
      // Détection de stabilité par déplacement réel (beaucoup plus fiable que la vélocité)
      // On le fait AVANT de mettre à jour le store pour comparer avec l'état précédent
      if (!draggedNodeId && layoutMode === 'force') {
        let maxMoveSq = 0;
        layout.forEachBody((body, nodeId) => {
          if (!body.pinned && storePositions[nodeId]) {
            const dx = body.pos.x - storePositions[nodeId].x;
            const dy = body.pos.y - storePositions[nodeId].y;
            const dz = body.pos.z - storePositions[nodeId].z;
            const moveSq = dx*dx + dy*dy + dz*dz;
            if (moveSq > maxMoveSq) maxMoveSq = moveSq;
          }
        });

        // Si le déplacement maximum entre deux frames est extrêmement petit
        if (maxMoveSq < 0.0001) {
          stabilityCounterRef.current++;
          if (stabilityCounterRef.current > 60) {
            setSimulationStable(true);
            stabilityCounterRef.current = 0;
          }
        } else {
          stabilityCounterRef.current = 0;
        }
      } else {
        stabilityCounterRef.current = 0;
      }

      // Mettre à jour le store avec les nouvelles positions
      const newPositions = {};
      layout.forEachBody((body, nodeId) => {
        newPositions[nodeId] = {
          x: body.pos.x,
          y: body.pos.y,
          z: body.pos.z
        };
      });
      setPositions(newPositions);
    }
  });
  
  // Convertir le mouvement écran en déplacement 3D en tenant compte de la rotation caméra et du zoom
  const screenToWorldDelta = (clientDelta, draggedNodePos) => {
    if (!camera || !cameraControlsRef?.current) {
      return { x: clientDelta.x * 0.1, y: -clientDelta.y * 0.1, z: 0 };
    }
    
    // Utiliser la distance caméra -> node draggé pour un calcul plus précis
    const nodePos = new THREE.Vector3(draggedNodePos.x, draggedNodePos.y, draggedNodePos.z);
    const cameraDistance = camera.position.distanceTo(nodePos);
    
    // Ajuster le facteur de déplacement selon le zoom
    // Basé sur la perspective de la caméra
    const zoomFactor = cameraDistance / 100;
    
    // Direction de la caméra
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);
    
    // Vecteurs de base pour le repère de la caméra
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    
    // Right = up × cameraDir
    right.crossVectors(up, cameraDir).normalize();
    
    // Up = cameraDir × right (recalculé pour assurer orthogonalité)
    up.crossVectors(cameraDir, right).normalize();
    
    // Appliquer la transformation avec le facteur de zoom
    const worldDelta = new THREE.Vector3();
    worldDelta.copy(right).multiplyScalar(clientDelta.x * -0.1 * zoomFactor);
    worldDelta.addScaledVector(up, -clientDelta.y * 0.1 * zoomFactor);
    
    return { x: worldDelta.x, y: worldDelta.y, z: worldDelta.z };
  };
  
  // Tracker la position de la souris globalement (listeners persistants)
  useEffect(() => {
    const handleMouseMove = (e) => {
      setCurrentMousePos({ x: e.clientX, y: e.clientY });
      
      // Mettre à jour le drag pendant le mouvement (seulement si drag actif)
      if (draggedNodeId && dragStartInfoRef.current && layout) {
        handleDragMove(draggedNodeId, e.clientX, e.clientY, dragStartInfoRef.current);
      }
    };
    
    const handleMouseUp = (e) => {
      // Terminer le drag sur mouseup (seulement si drag actif)
      if (draggedNodeId) {
        e.stopPropagation();
        handleDragEnd(draggedNodeId);
      }
    };
    
    // Listeners toujours actifs, mais ne font rien si pas de drag
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedNodeId, layout]);
  
  // Vérifier si un node est connecté (directement ou indirectement) à un node pinné
  const isConnectedToPinnedNode = (nodeId) => {
    const { isPinned } = useGraphStore.getState();
    const visited = new Set();
    const queue = [nodeId];
    
    // BFS pour parcourir le graphe
    while (queue.length > 0) {
      const currentId = queue.shift();
      
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      // Si on trouve un node pinné, on est connecté
      if (currentId !== nodeId && isPinned(currentId)) {
        return true;
      }
      
      // Ajouter les voisins à la queue
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
  };
  
  // Gestion du drag
  const handleDragStart = (nodeId, clientX, clientY) => {
    // Vérifier si le node est pinné AVANT le drag
    const { isPinned, saveToHistory } = useGraphStore.getState();
    const wasPinned = isPinned(nodeId);
    
    // Déterminer si on doit sauvegarder l'état :
    // - Si le node est pinné → OUI, toujours sauvegarder
    // - Si le node n'est pas pinné ET pas connecté à un pinné (groupe isolé) → OUI, sauvegarder
    // - Si le node n'est pas pinné MAIS connecté à un pinné → NON, la simulation le replacera
    let shouldSave = wasPinned;
    
    if (!wasPinned) {
      // Node non-pinné : vérifier s'il est connecté à un node pinné
      const connectedToPinned = isConnectedToPinnedNode(nodeId);
      // On sauvegarde seulement si PAS connecté (groupe isolé)
      shouldSave = !connectedToPinned;
    }
    
    if (shouldSave) {
      saveToHistory();
    }
    
    setDraggedNode(nodeId);
    unpinNode(nodeId, layout);
    computeNodeLayers(nodeId, edges, nodes.length);
    dragStartInfoRef.current = {
      startX: clientX,
      startY: clientY,
      nodeStartX: positions[nodeId]?.x || 0,
      nodeStartY: positions[nodeId]?.y || 0,
      nodeStartZ: positions[nodeId]?.z || 0,
      wasPinned: wasPinned,
      shouldSave: shouldSave // Mémoriser si on doit sauvegarder à la fin
    };
  };
  
  const handleDragMove = (nodeId, clientX, clientY, dragStartInfo) => {
    if (!draggedNodeId || !layout) return;
    
    // Calculer la direction du drag en screen space
    const deltaX = clientX - dragStartInfo.startX;
    const deltaY = clientY - dragStartInfo.startY;
    
    // Position actuelle du node draggé pour le calcul du zoom
    const currentPos = {
      x: dragStartInfo.nodeStartX,
      y: dragStartInfo.nodeStartY,
      z: dragStartInfo.nodeStartZ
    };
    
    // Convertir en mouvement 3D en tenant compte de la rotation caméra et du zoom
    const worldDelta = screenToWorldDelta({ x: deltaX, y: deltaY }, currentPos);
    
    const newPos = {
      x: dragStartInfo.nodeStartX + worldDelta.x,
      y: dragStartInfo.nodeStartY + worldDelta.y,
      z: dragStartInfo.nodeStartZ + worldDelta.z
    };
    
    // Mettre à jour la position dans ngraph
    const body = layout.getBody(nodeId);
    if (body) {
      body.pos.x = newPos.x;
      body.pos.y = newPos.y;
      body.pos.z = newPos.z;
    }
    
    // Mettre à jour le state positions (ne pas écraser les autres positions)
    // On utilise une mise à jour silencieuse pour éviter de re-render tout le graphe
    // mais on a besoin que le composant Node draggé se mette à jour.
    // Comme Node a un useFrame qui check isDragging, il va se mettre à jour via la prop position.
    setPositions({
      ...useGraphStore.getState().positions,
      [nodeId]: newPos
    });
  };
  
  const handleDragEnd = (nodeId) => {
    if (!layout || !draggedNodeId) return;
    
    const { positions, unpinnedDuringDrag, pinDraggedNodeOnly, saveToHistory, setPositions } = useGraphStore.getState();
    
    // Reset le cursor
    document.body.style.cursor = 'default';
    
    // Vérifier si la position a vraiment changé
    const startInfo = dragStartInfoRef.current;
    let positionChanged = false;
    const shouldSave = startInfo?.shouldSave || false;
    
    // Mettre à jour les positions dans le store à la fin du drag
    const newPositions = {};
    layout.forEachBody((b, id) => {
      newPositions[id] = { x: b.pos.x, y: b.pos.y, z: b.pos.z };
    });
    setPositions(newPositions);
    
    if (startInfo && newPositions[nodeId]) {
      const dx = newPositions[nodeId].x - startInfo.nodeStartX;
      const dy = newPositions[nodeId].y - startInfo.nodeStartY;
      const dz = newPositions[nodeId].z - startInfo.nodeStartZ;
      const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      positionChanged = distance > 5; // Seuil de 5 unités pour éviter les sauvegardes pour petits mouvements
    }
    
    // Nettoyer la ref du drag
    dragStartInfoRef.current = null;
    
    // Pin immédiatement UNIQUEMENT le node draggé
    pinDraggedNodeOnly(layout, nodeId);
    
    // Sauvegarder dans l'historique SEULEMENT si on doit sauvegarder (déterminé au début) ET que la position a vraiment changé
    if (shouldSave && positionChanged) {
      setTimeout(() => saveToHistory(), 50);
    }
    
    // Les voisins restent unpinned et continuent la simulation
    // Ils seront re-pinnés après 3 secondes
    setTimeout(() => {
      const { unpinnedDuringDrag, setSimulationActive } = useGraphStore.getState();
      unpinnedDuringDrag.forEach(neighborId => {
        if (neighborId !== nodeId) { // Skip le node draggé (déjà pinné)
          const body = layout.getBody(neighborId);
          if (body) {
            body.pinned = true;
          }
        }
      });
      setSimulationActive(false);
    }, 3000);
    
    setDraggedNode(null);
  };
  
  return (
    <>
      {/* Lumière ambiante simple comme OldVersionGraph */}
      <ambientLight intensity={1.0} />
      
      {/* Contrôles orbite dynamiques */}
      <DynamicOrbitControls isDragging={!!draggedNodeId} />
      
      {/* Edges */}
      {edges.map((edge) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        // Affichage basé sur les filtres globaux
        const visible = filters['Relations'] && filters[sourceNode?.type] && filters[targetNode?.type];
        
        // Ne pas rendre du tout les edges non visibles
        if (!visible) return null;
        
        // L'opacité de la relation est limitée par l'opacité minimale des nodes connectés
        // On prend toujours le min entre l'opacité globale et l'individuelle (si définie)
        const sourceOpacity = sourceNode ? Math.min(opacityLevels[sourceNode.type], individualNodeOpacity[sourceNode.id] ?? 1) : 1;
        const targetOpacity = targetNode ? Math.min(opacityLevels[targetNode.type], individualNodeOpacity[targetNode.id] ?? 1) : 1;
        const relationsOpacity = individualEdgeOpacity[edge.id] ?? opacityLevels.Relations;
        const maxEdgeOpacity = Math.min(relationsOpacity, sourceOpacity, targetOpacity);
        
        return (
          <Edge
            key={edge.id}
            edge={edge}
            sourcePos={positions[edge.source]}
            targetPos={positions[edge.target]}
            visible={true}
            isSelected={selectedEdge?.id === edge.id}
            onClick={() => selectEdge(edge.id)}
            opacityLevel={maxEdgeOpacity}
            totalEdges={edges.length}
          />
        );
      })}
      
      {/* Nodes */}
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
          onDragMove={handleDragMove}
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
