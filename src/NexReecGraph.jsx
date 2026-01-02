import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Billboard, Line } from '@react-three/drei';
import { Network, X, Info, Loader, Search, Plus, Trash2, ChevronDown, ChevronUp, Play, Pause, Pin, Orbit, Focus, ChevronLeft, ChevronRight, Settings, Eye, EyeOff, ListChevronsDownUp } from 'lucide-react';
import * as THREE from 'three';
import createGraph from 'ngraph.graph';
import forceLayout3d from 'ngraph.forcelayout3d';
import { create } from 'zustand';

// ============================================================================
// COUCHE 1 : DATA LAYER (Zustand State Management)
// ============================================================================

const useGraphStore = create((set, get) => ({
  // Available data (all REECs from JSON)
  availableReecs: [],
  availableRelations: [],
  
  // Visible REECs (displayed in graph)
  visibleReecIds: new Set(),
  
  // Raw data
  rawReecs: [],
  rawRelations: [],
  
  // Processed graph data
  nodes: [],
  edges: [],
  
  // UI state
  filters: {
    Entity: true,
    Event: true,
    Context: true,
    Relations: true
  },
  filterModes: {
    Entity: 'opacity',    // 'hide' ou 'opacity'
    Event: 'opacity',
    Context: 'opacity',
    Relations: 'opacity'
  },
  opacityLevels: {
    Entity: 1.0,
    Event: 1.0,
    Context: 1.0,
    Relations: 0.5
  },
  // Individual node/edge opacity overrides
  individualNodeOpacity: {},  // { nodeId: 0.0-1.0 }
  individualEdgeOpacity: {},  // { edgeId: 0.0-0.5 }
  showRelations: true,
  selectedNode: null,
  selectedEdge: null,
  
  // Layout state
  positions: {},
  layoutRunning: false,
  layoutProgress: 0,
  layoutReady: false,
  
  // Drag & Pin state
  draggedNodeId: null,
  pinnedNodes: new Set(),
  unpinnedDuringDrag: new Set(),
  dragLayout: null,
  cameraControlsRef: null,
  centerOnNodeId: null,
  nodeLayersMap: {},
  maxLayers: 0,
  simulationActive: false,
  simulationPaused: false,
  
  // History state
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,
  
  // Actions
  loadData: (jsonData) => {
    // Calculer le nombre de connexions pour chaque REEC
    const connectionCounts = {};
    jsonData.relations.forEach(rel => {
      connectionCounts[rel.source_reec_id] = (connectionCounts[rel.source_reec_id] || 0) + 1;
      connectionCounts[rel.target_reec_id] = (connectionCounts[rel.target_reec_id] || 0) + 1;
    });
    
    // Trouver le REEC avec le plus de connexions
    let mostConnectedReecId = null;
    let maxConnections = 0;
    Object.entries(connectionCounts).forEach(([reecId, count]) => {
      if (count > maxConnections) {
        maxConnections = count;
        mostConnectedReecId = reecId;
      }
    });
    
    // Créer le set initial avec le REEC le plus connecté et ses voisins
    const initialVisibleIds = new Set();
    if (mostConnectedReecId) {
      initialVisibleIds.add(mostConnectedReecId);
      
      // Ajouter tous les voisins directs
      jsonData.relations.forEach(rel => {
        if (rel.source_reec_id === mostConnectedReecId) {
          initialVisibleIds.add(rel.target_reec_id);
        }
        if (rel.target_reec_id === mostConnectedReecId) {
          initialVisibleIds.add(rel.source_reec_id);
        }
      });
    }
    
    // Traiter les REECs visibles en nodes
    const nodes = jsonData.reecs
      .filter(reec => initialVisibleIds.has(reec.reec_id))
      .map(reec => ({
        id: reec.reec_id,
        label: reec.label,
        type: reec.type,
        subtype: reec.subtype,
        category: reec.category,
        summary: reec.summary_short,
        summaryDetailed: reec.summary_detailed,
        temporal: {
          start: reec.temporal_start_date || reec.temporal_date,
          end: reec.temporal_end_date,
          precision: reec.temporal_precision
        },
        locations: reec.spatial_locations || [],
        confidence: reec.metadata_confidence,
        tags: reec.metadata_tags || []
      }));
    
    // Traiter les edges (uniquement entre REECs visibles)
    const edges = jsonData.relations
      .filter(rel => initialVisibleIds.has(rel.source_reec_id) && initialVisibleIds.has(rel.target_reec_id))
      .map(rel => ({
        id: `${rel.source_reec_id}-${rel.target_reec_id}`,
        source: rel.source_reec_id,
        target: rel.target_reec_id,
        type: rel.relation_type,
        description: rel.description,
        confidence: rel.confidence
      }));
    
    // Pinner le REEC central par défaut
    const initialPinnedNodes = new Set();
    if (mostConnectedReecId) {
      initialPinnedNodes.add(mostConnectedReecId);
    }
    
    set({
      availableReecs: jsonData.reecs,
      availableRelations: jsonData.relations,
      rawReecs: jsonData.reecs.filter(reec => initialVisibleIds.has(reec.reec_id)),
      rawRelations: jsonData.relations.filter(rel => 
        initialVisibleIds.has(rel.source_reec_id) && initialVisibleIds.has(rel.target_reec_id)
      ),
      nodes,
      edges,
      visibleReecIds: initialVisibleIds,
      pinnedNodes: initialPinnedNodes
    });
    
    // Sélectionner le nœud central par défaut
    if (mostConnectedReecId) {
      get().selectNode(mostConnectedReecId);
    }
    
    // Sauvegarder l'état initial dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  addReecToGraph: (reecId) => {
    const state = get();
    const newVisibleIds = new Set(state.visibleReecIds);
    newVisibleIds.add(reecId);
    
    // Process visible REECs into nodes
    const nodes = state.availableReecs
      .filter(reec => newVisibleIds.has(reec.reec_id))
      .map(reec => ({
        id: reec.reec_id,
        label: reec.label,
        type: reec.type,
        subtype: reec.subtype,
        category: reec.category,
        summary: reec.summary_short,
        summaryDetailed: reec.summary_detailed,
        temporal: {
          start: reec.temporal_start_date || reec.temporal_date,
          end: reec.temporal_end_date,
          precision: reec.temporal_precision
        },
        locations: reec.spatial_locations || [],
        confidence: reec.metadata_confidence,
        tags: reec.metadata_tags || []
      }));
    
    // Process edges (only between visible REECs)
    const edges = state.availableRelations
      .filter(rel => newVisibleIds.has(rel.source_reec_id) && newVisibleIds.has(rel.target_reec_id))
      .map(rel => ({
        id: `${rel.source_reec_id}-${rel.target_reec_id}`,
        source: rel.source_reec_id,
        target: rel.target_reec_id,
        type: rel.relation_type,
        description: rel.description,
        confidence: rel.confidence
      }));
    
    set({
      visibleReecIds: newVisibleIds,
      rawReecs: state.availableReecs.filter(reec => newVisibleIds.has(reec.reec_id)),
      rawRelations: state.availableRelations.filter(rel => 
        newVisibleIds.has(rel.source_reec_id) && newVisibleIds.has(rel.target_reec_id)
      ),
      nodes,
      edges
    });
    
    // Sauvegarder dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  removeReecFromGraph: (reecId) => {
    const state = get();
    const newVisibleIds = new Set(state.visibleReecIds);
    newVisibleIds.delete(reecId);
    
    // Process visible REECs into nodes
    const nodes = state.availableReecs
      .filter(reec => newVisibleIds.has(reec.reec_id))
      .map(reec => ({
        id: reec.reec_id,
        label: reec.label,
        type: reec.type,
        subtype: reec.subtype,
        category: reec.category,
        summary: reec.summary_short,
        summaryDetailed: reec.summary_detailed,
        temporal: {
          start: reec.temporal_start_date || reec.temporal_date,
          end: reec.temporal_end_date,
          precision: reec.temporal_precision
        },
        locations: reec.spatial_locations || [],
        confidence: reec.metadata_confidence,
        tags: reec.metadata_tags || []
      }));
    
    // Process edges (only between visible REECs)
    const edges = state.availableRelations
      .filter(rel => newVisibleIds.has(rel.source_reec_id) && newVisibleIds.has(rel.target_reec_id))
      .map(rel => ({
        id: `${rel.source_reec_id}-${rel.target_reec_id}`,
        source: rel.source_reec_id,
        target: rel.target_reec_id,
        type: rel.relation_type,
        description: rel.description,
        confidence: rel.confidence
      }));
    
    set({
      visibleReecIds: newVisibleIds,
      rawReecs: state.availableReecs.filter(reec => newVisibleIds.has(reec.reec_id)),
      rawRelations: state.availableRelations.filter(rel => 
        newVisibleIds.has(rel.source_reec_id) && newVisibleIds.has(rel.target_reec_id)
      ),
      nodes,
      edges,
      selectedNode: state.selectedNode?.id === reecId ? null : state.selectedNode
    });
    
    // Sauvegarder dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  toggleFilter: (type) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [type]: !state.filters[type]
      }
    }));
  },
  
  setFilterMode: (type, mode) => {
    set((state) => ({
      filterModes: {
        ...state.filterModes,
        [type]: mode
      }
    }));
  },
  
  setOpacityLevel: (type, level) => {
    set((state) => ({
      opacityLevels: {
        ...state.opacityLevels,
        [type]: level
      }
    }));
  },
  
  setIndividualNodeOpacity: (nodeId, level) => {
    set((state) => ({
      individualNodeOpacity: {
        ...state.individualNodeOpacity,
        [nodeId]: level
      }
    }));
  },
  
  setIndividualEdgeOpacity: (edgeId, level) => {
    set((state) => ({
      individualEdgeOpacity: {
        ...state.individualEdgeOpacity,
        [edgeId]: level
      }
    }));
  },
  
  toggleRelations: () => {
    set((state) => ({ showRelations: !state.showRelations }));
  },
  
  selectNode: (nodeId) => {
    const node = get().nodes.find(n => n.id === nodeId);
    set({ selectedNode: node, selectedEdge: null });
  },
  
  selectEdge: (edgeId) => {
    const edge = get().edges.find(e => e.id === edgeId);
    set({ selectedEdge: edge, selectedNode: null });
  },
  
  clearSelection: () => {
    set({ selectedNode: null, selectedEdge: null });
  },
  
  setPositions: (positions) => {
    set({ positions });
  },
  
  setLayoutRunning: (running) => {
    set({ layoutRunning: running });
  },
  
  setLayoutProgress: (progress) => {
    set({ layoutProgress: progress });
  },
  
  setLayoutReady: (ready) => {
    set({ layoutReady: ready });
  },
  
  setDraggedNode: (nodeId) => {
    set({ draggedNodeId: nodeId });
  },
  
  pinAllNodes: (layout) => {
    if (!layout) return;
    const pinnedSet = new Set();
    layout.forEachBody((body, nodeId) => {
      body.pinned = true;
      pinnedSet.add(nodeId);
    });
    set({ pinnedNodes: pinnedSet, dragLayout: layout });
  },
  
  unpinNode: (nodeId, layout) => {
    if (!layout) return;
    const { positions } = get();
    const unpinnedSet = new Set();
    
    // IMPORTANT : Synchroniser TOUTES les positions de ngraph avec le state
    // Pas seulement celles qu'on unpin, sinon les pinnés ont des positions obsolètes
    layout.forEachBody((body, nId) => {
      if (positions[nId]) {
        body.pos.x = positions[nId].x;
        body.pos.y = positions[nId].y;
        body.pos.z = positions[nId].z;
      }
    });
    
    // Unpin le node et réinitialiser sa vélocité
    const body = layout.getBody(nodeId);
    if (body) {
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.velocity.z = 0;
      body.pinned = false;
      unpinnedSet.add(nodeId);
    }
    
    set({ unpinnedDuringDrag: unpinnedSet });
  },
  
  repinNodes: (layout) => {
    if (!layout) return;
    const { unpinnedDuringDrag } = get();
    unpinnedDuringDrag.forEach(nodeId => {
      const body = layout.getBody(nodeId);
      if (body) {
        body.pinned = true;
      }
    });
    set({ draggedNodeId: null, unpinnedDuringDrag: new Set() });
  },
  
  pinDraggedNodeOnly: (layout, draggedNodeId) => {
    if (!layout || !draggedNodeId) return;
    const body = layout.getBody(draggedNodeId);
    if (body) {
      body.pinned = true;
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.velocity.z = 0;
    }
    set({ draggedNodeId: null, simulationActive: true });
  },
  
  toggleNodePin: (nodeId, layout) => {
    if (!layout) return;
    const { pinnedNodes } = get();
    const body = layout.getBody(nodeId);
    if (!body) return;
    
    const newPinnedNodes = new Set(pinnedNodes);
    if (pinnedNodes.has(nodeId)) {
      // Unpin
      body.pinned = false;
      newPinnedNodes.delete(nodeId);
    } else {
      // Pin
      body.pinned = true;
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.velocity.z = 0;
      newPinnedNodes.add(nodeId);
    }
    set({ pinnedNodes: newPinnedNodes });
    
    // Sauvegarder dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  isPinned: (nodeId) => {
    return get().pinnedNodes.has(nodeId);
  },
  
  unpinAllNodes: (layout) => {
    if (!layout) return;
    const { pinnedNodes } = get();
    pinnedNodes.forEach(nodeId => {
      const body = layout.getBody(nodeId);
      if (body) {
        body.pinned = false;
      }
    });
    set({ pinnedNodes: new Set() });
    
    // Sauvegarder dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  pinAllVisibleNodes: (layout, visibleNodeIds) => {
    if (!layout) return;
    const newPinnedNodes = new Set();
    visibleNodeIds.forEach(nodeId => {
      const body = layout.getBody(nodeId);
      if (body) {
        body.pinned = true;
        body.velocity.x = 0;
        body.velocity.y = 0;
        body.velocity.z = 0;
        newPinnedNodes.add(nodeId);
      }
    });
    set({ pinnedNodes: newPinnedNodes });
    
    // Sauvegarder dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  setSimulationActive: (active) => {
    set({ simulationActive: active });
  },
  
  setSimulationPaused: (paused) => {
    set({ simulationPaused: paused });
  },
  
  setCameraControlsRef: (ref) => {
    set({ cameraControlsRef: ref });
  },
  
  triggerCenterOnNode: (nodeId) => {
    set({ centerOnNodeId: nodeId });
  },
  
  clearCenterOnNode: () => {
    set({ centerOnNodeId: null });
  },
  
  computeNodeLayers: (startNodeId, graphEdges, totalNodes) => {
    const MAX_BFS_NODES = 500; // Limiter le BFS pour la perf, bfs ?: 
    const layers = { [startNodeId]: 0 };
    const queue = [startNodeId];
    const visited = new Set([startNodeId]);
    
    // Construire un graphe d'adjacence
    const adjacency = {};
    graphEdges.forEach(edge => {
      if (!adjacency[edge.source]) adjacency[edge.source] = [];
      if (!adjacency[edge.target]) adjacency[edge.target] = [];
      adjacency[edge.source].push(edge.target);
      adjacency[edge.target].push(edge.source);
    });
    
    // BFS avec limite
    while (queue.length > 0 && visited.size < MAX_BFS_NODES) {
      const current = queue.shift();
      const currentLayer = layers[current];
      
      const neighbors = adjacency[current] || [];
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor) && visited.size < MAX_BFS_NODES) {
          visited.add(neighbor);
          layers[neighbor] = currentLayer + 1;
          queue.push(neighbor);
        }
      });
    }
    
    // Calculer le nombre max de couches basé sur le nombre de nodes
    const maxLayers = Math.max(3, Math.ceil(Math.sqrt(Math.min(totalNodes, MAX_BFS_NODES)) / 2));
    // const maxLayers = 1;
    
    set({ nodeLayersMap: layers, maxLayers });
  },
  
  // Sauvegarder l'état actuel dans l'historique
  saveToHistory: () => {
    const state = get();
    const snapshot = {
      visibleReecIds: new Set(state.visibleReecIds),
      pinnedNodes: new Set(state.pinnedNodes),
      positions: { ...state.positions }
    };
    
    // Supprimer les états futurs si on n'est pas à la fin de l'historique
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);
    
    // Limiter la taille de l'historique
    if (newHistory.length > state.maxHistorySize) {
      newHistory.shift();
      // Ajuster l'index après le shift
      set({
        history: newHistory,
        historyIndex: newHistory.length - 1
      });
    } else {
      set({
        history: newHistory,
        historyIndex: newHistory.length - 1
      });
    }
  },
  
  // Revenir à l'état précédent
  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return;
    
    const newIndex = state.historyIndex - 1;
    const snapshot = state.history[newIndex];
    if (!snapshot) return;
    
    // Reconstruire les nodes et edges depuis le snapshot
    const nodes = state.availableReecs
      .filter(reec => snapshot.visibleReecIds.has(reec.reec_id))
      .map(reec => ({
        id: reec.reec_id,
        label: reec.label,
        type: reec.type,
        subtype: reec.subtype,
        category: reec.category,
        summary: reec.summary_short,
        summaryDetailed: reec.summary_detailed,
        temporal: {
          start: reec.temporal_start_date || reec.temporal_date,
          end: reec.temporal_end_date,
          precision: reec.temporal_precision
        },
        locations: reec.spatial_locations || [],
        confidence: reec.metadata_confidence,
        tags: reec.metadata_tags || []
      }));
    
    const edges = state.availableRelations
      .filter(rel => snapshot.visibleReecIds.has(rel.source_reec_id) && snapshot.visibleReecIds.has(rel.target_reec_id))
      .map(rel => ({
        id: `${rel.source_reec_id}-${rel.target_reec_id}`,
        source: rel.source_reec_id,
        target: rel.target_reec_id,
        type: rel.relation_type,
        description: rel.description,
        confidence: rel.confidence
      }));
    
    // Mettre à jour l'état AVANT de toucher au layout
    set({
      visibleReecIds: new Set(snapshot.visibleReecIds),
      pinnedNodes: new Set(snapshot.pinnedNodes),
      positions: { ...snapshot.positions },
      nodes,
      edges,
      rawReecs: state.availableReecs.filter(reec => snapshot.visibleReecIds.has(reec.reec_id)),
      rawRelations: state.availableRelations.filter(rel => 
        snapshot.visibleReecIds.has(rel.source_reec_id) && snapshot.visibleReecIds.has(rel.target_reec_id)
      ),
      historyIndex: newIndex
    });
    
    // Mettre à jour les positions et pinnedNodes dans le layout après un petit délai
    setTimeout(() => {
      const layout = get().dragLayout;
      if (layout) {
        layout.forEachBody((body, nodeId) => {
          if (snapshot.positions[nodeId]) {
            body.pos.x = snapshot.positions[nodeId].x;
            body.pos.y = snapshot.positions[nodeId].y;
            body.pos.z = snapshot.positions[nodeId].z;
          }
          body.pinned = snapshot.pinnedNodes.has(nodeId);
          body.velocity.x = 0;
          body.velocity.y = 0;
          body.velocity.z = 0;
        });
      }
    }, 50);
  },
  
  // Avancer à l'état suivant
  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    
    const newIndex = state.historyIndex + 1;
    const snapshot = state.history[newIndex];
    if (!snapshot) return;
    
    // Reconstruire les nodes et edges depuis le snapshot
    const nodes = state.availableReecs
      .filter(reec => snapshot.visibleReecIds.has(reec.reec_id))
      .map(reec => ({
        id: reec.reec_id,
        label: reec.label,
        type: reec.type,
        subtype: reec.subtype,
        category: reec.category,
        summary: reec.summary_short,
        summaryDetailed: reec.summary_detailed,
        temporal: {
          start: reec.temporal_start_date || reec.temporal_date,
          end: reec.temporal_end_date,
          precision: reec.temporal_precision
        },
        locations: reec.spatial_locations || [],
        confidence: reec.metadata_confidence,
        tags: reec.metadata_tags || []
      }));
    
    const edges = state.availableRelations
      .filter(rel => snapshot.visibleReecIds.has(rel.source_reec_id) && snapshot.visibleReecIds.has(rel.target_reec_id))
      .map(rel => ({
        id: `${rel.source_reec_id}-${rel.target_reec_id}`,
        source: rel.source_reec_id,
        target: rel.target_reec_id,
        type: rel.relation_type,
        description: rel.description,
        confidence: rel.confidence
      }));
    
    // Mettre à jour l'état AVANT de toucher au layout
    set({
      visibleReecIds: new Set(snapshot.visibleReecIds),
      pinnedNodes: new Set(snapshot.pinnedNodes),
      positions: { ...snapshot.positions },
      nodes,
      edges,
      rawReecs: state.availableReecs.filter(reec => snapshot.visibleReecIds.has(reec.reec_id)),
      rawRelations: state.availableRelations.filter(rel => 
        snapshot.visibleReecIds.has(rel.source_reec_id) && snapshot.visibleReecIds.has(rel.target_reec_id)
      ),
      historyIndex: newIndex
    });
    
    // Mettre à jour les positions et pinnedNodes dans le layout après un petit délai
    setTimeout(() => {
      const layout = get().dragLayout;
      if (layout) {
        layout.forEachBody((body, nodeId) => {
          if (snapshot.positions[nodeId]) {
            body.pos.x = snapshot.positions[nodeId].x;
            body.pos.y = snapshot.positions[nodeId].y;
            body.pos.z = snapshot.positions[nodeId].z;
          }
          body.pinned = snapshot.pinnedNodes.has(nodeId);
          body.velocity.x = 0;
          body.velocity.y = 0;
          body.velocity.z = 0;
        });
      }
    }, 50);
  },
  
  canUndo: () => {
    const state = get();
    return state.historyIndex > 0 && state.history.length > 1;
  },
  
  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1 && state.history.length > 0;
  }
}));

// ============================================================================
// COUCHE 2 : LAYOUT ENGINE (ngraph.forcelayout3d)
// ============================================================================

const useNgraphLayout = () => {
  const store = useGraphStore();
  const { nodes, edges, filters, setPositions, setLayoutRunning, setLayoutProgress, setLayoutReady } = store;
  const [layout, setLayout] = useState(null);
  const animationRef = useRef(null);
  const graphRef = useRef(null);
  const previousNodesRef = useRef([]);
  
  // Initialize or update ngraph
  useEffect(() => {
    if (nodes.length === 0) {
      graphRef.current = null;
      setLayout(null);
      return;
    }
    
    const { positions: currentPositions } = useGraphStore.getState();
    
    // Si pas de graphe, en créer un nouveau
    if (!graphRef.current) {
      graphRef.current = createGraph();
    }
    
    const graph = graphRef.current;
    
    // Calculer le nombre de relations directes pour chaque node
    const connectionCounts = {};
    edges.forEach(edge => {
      connectionCounts[edge.source] = (connectionCounts[edge.source] || 0) + 1;
      connectionCounts[edge.target] = (connectionCounts[edge.target] || 0) + 1;
    });
    
    // Obtenir les IDs actuels et précédents
    // Un node doit rester dans la simulation si le filtre global est activé
    const shouldIncludeNode = (node) => {
      return filters[node.type];
    };
    
    const currentNodeIds = new Set(nodes.filter(shouldIncludeNode).map(n => n.id));
    const previousNodeIds = new Set(previousNodesRef.current.map(n => n.id));
    
    // Ajouter les nouveaux nodes
    nodes.forEach(node => {
      if (shouldIncludeNode(node) && !previousNodeIds.has(node.id)) {
        const connections = connectionCounts[node.id] || 1;
        const mass = 1 + Math.log(connections) * 0.5;
        graph.addNode(node.id, { ...node, mass });
      }
    });
    
    // Supprimer les nodes qui n'existent plus
    previousNodesRef.current.forEach(oldNode => {
      if (!currentNodeIds.has(oldNode.id) && graph.hasNode(oldNode.id)) {
        graph.removeNode(oldNode.id);
      }
    });
    
    // Nettoyer les anciennes edges
    graph.forEachLink(link => {
      const sourceExists = currentNodeIds.has(link.fromId);
      const targetExists = currentNodeIds.has(link.toId);
      if (!sourceExists || !targetExists) {
        graph.removeLink(link);
      }
    });
    
    // Ajouter les nouvelles edges
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      
      if (sourceNode && targetNode && shouldIncludeNode(sourceNode) && shouldIncludeNode(targetNode)) {
        if (!graph.hasLink(edge.source, edge.target)) {
          graph.addLink(edge.source, edge.target);
        }
      }
    });
    
    // Mettre à jour la référence des nodes précédents
    previousNodesRef.current = nodes.filter(shouldIncludeNode);
    
    // Créer ou mettre à jour le layout 3D
    if (!layout || nodes.length !== previousNodesRef.current.length) {
      const layoutInstance = forceLayout3d(graph, {
        springLength: 30,
        springCoeff: 0.001,
        gravity: -2,
        theta: 0.5,
        dragCoeff: 0.01,
        timeStep: 10,
        nodeMass: (nodeId) => {
          const node = graph.getNode(nodeId);
          return node?.data?.mass || 1;
        }
      });
      
      // Restaurer les positions existantes
      if (Object.keys(currentPositions).length > 0) {
        const { pinnedNodes } = useGraphStore.getState();
        layoutInstance.forEachBody((body, nodeId) => {
          if (currentPositions[nodeId]) {
            body.pos.x = currentPositions[nodeId].x;
            body.pos.y = currentPositions[nodeId].y;
            body.pos.z = currentPositions[nodeId].z;
            // Restaurer l'état de pin manuel, sinon pinner par défaut
            body.pinned = pinnedNodes.has(nodeId) || true;
          }
        });
      }
      
      setLayout(layoutInstance);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, edges, filters, layout]);
  
  // Simuler le layout
  const runSimulation = (iterations = 400) => {
    if (!layout) {
      console.warn('Layout not ready, skipping simulation');
      // Si le layout n'est pas prêt, marquer quand même comme prêt pour éviter de bloquer l'UI
      setLayoutReady(true);
      return;
    }
    
    setLayoutRunning(true);
    setLayoutProgress(0);
    let step = 0;
    const animationStartThreshold = Math.min(iterations / 10, 50);
    
    // Phase initiale : quelques itérations pour stabiliser
    const simulate = () => {
      if (step < iterations) {
        layout.step();
        step++;
        setLayoutProgress((step / iterations) * 100);
        
        // Afficher dès le seuil atteint
        if (step >= animationStartThreshold) {
          const newPositions = {};
          layout.forEachBody((body, nodeId) => {
            newPositions[nodeId] = {
              x: body.pos.x,
              y: body.pos.y,
              z: body.pos.z
            };
          });
          setPositions(newPositions);
          
          // Marquer comme prêt (une seule fois)
          if (step === Math.ceil(animationStartThreshold)) {
            setLayoutReady(true);
          }
        }
        
        animationRef.current = requestAnimationFrame(simulate);
      } else {
        // Fin de la phase initiale - passer en mode simulation continue
        const newPositions = {};
        layout.forEachBody((body, nodeId) => {
          newPositions[nodeId] = {
            x: body.pos.x,
            y: body.pos.y,
            z: body.pos.z
          };
        });
        setPositions(newPositions);
        setLayoutRunning(false);
        setLayoutProgress(100);
        setLayoutReady(true); // S'assurer que c'est à true
        // La simulation continue maintenant via useFrame
      }
    };
    
    simulate();
  };
  
  const stopSimulation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setLayoutRunning(false);
  };
  
  return { runSimulation, stopSimulation, layout };
};

// ============================================================================
// COUCHE 3 : RENDERING ENGINE (React Three Fiber)
// ============================================================================

// Composant Node - Sprite 2D comme dans OldVersionGraph
const Node = ({ node, position, onClick, visible, isSelected, onDragStart, onDragMove, isDragging, isPinned, filterMode, opacityLevel }) => {
  const spriteRef = useRef();
  const dragStartInfo = useRef(null);
  
  // Créer le canvas texture une seule fois
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.4;

    // Couleurs plus sombres pour ne pas fatiguer les yeux
    const colorMap = {
      'Entity': '#3b82f6',
      'Event': '#8b5cf6',
      'Context': '#0f9c6dff'
    };

    // Draw circle with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 1;
    
    // Single colored circle
    ctx.fillStyle = colorMap[node.type] || '#64748b';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw label - white text on colored background
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Split label into words and draw on multiple lines if needed
    const words = node.label.split(' ');
    const maxWidth = radius * 1.5;
    let lines = [];
    let currentLine = '';
    
    words.forEach(word => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    lines.push(currentLine);

    // Draw lines centered
    const lineHeight = 28;
    const totalHeight = lines.length * lineHeight;
    let yStart = centerY - totalHeight / 2 + lineHeight / 2;
    
    if (lines.length > 2) {
      ctx.font = 'bold 28px Arial';
    }
    
    lines.forEach((line) => {
      ctx.fillText(line, centerX, yStart);
      yStart += lineHeight;
    });

    return new THREE.CanvasTexture(canvas);
  }, [node.label, node.type]);
  
  // Créer la texture de l'icône de pin
  const pinTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Dessiner une forme de pin blanche avec rotation de -45 degrés
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    
    const centerX = size / 2;
    const centerY = size / 2;
    
    // Appliquer la rotation au contexte
    ctx.translate(centerX, centerY);
    ctx.rotate(Math.PI / 4); // -45 degrés
    ctx.translate(-centerX, -centerY);
    
    // Tête du pin (cercle)
    ctx.beginPath();
    ctx.arc(centerX, centerY - 4, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Corps du pin (rectangle)
    ctx.fillRect(centerX - 3, centerY + 4, 8, 16);

    return new THREE.CanvasTexture(canvas);
  }, []);
  
  const getScale = () => {
    // Scale basé sur la confidence
    const baseScale = 15;
    const confidenceMultiplier = node.confidence || 0.8;
    return baseScale * confidenceMultiplier * (isSelected ? 1.2 : 1.0) * (isDragging ? 1.3 : 1.0) * 1.0;
  };
  
  const handlePointerDown = (e) => {
    e.stopPropagation();
    onDragStart(node.id, e.clientX, e.clientY);
  };
  
  // Pas besoin de onPointerMove ici - géré via useFrame dans Scene
  
  const handlePointerUp = (e) => {
    e.stopPropagation();
    dragStartInfo.current = null;
  };
  
  if (!position) return null;
  
  const scale = getScale();
  
  return (
    <Billboard
      position={[position.x, position.y, position.z]}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <sprite
        ref={spriteRef}
        scale={[scale, scale, 1]}
        onClick={onClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        renderOrder={1}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'default';
        }}
      >
        <spriteMaterial
          map={texture}
          transparent={true}
          depthTest={true}
          depthWrite={true}
          alphaTest={0.1}
          opacity={opacityLevel}
        />
      </sprite>
      
      {/* Overlay icône de pin si le node est pinné */}
      {isPinned && visible && (
        <sprite
          position={[scale * 0.31, scale * 0.31, 0]}
          scale={[scale * 0.25, scale * 0.25, 1]}
          renderOrder={2}
        >
          <spriteMaterial
            map={pinTexture}
            transparent={true}
            depthTest={true}
            depthWrite={false}
            opacity={opacityLevel}
          />
        </sprite>
      )}
    </Billboard>
  );
};

// Composant Edge
const Edge = ({ edge, sourcePos, targetPos, visible, isSelected, onClick, opacityLevel }) => {
  const [hovered, setHovered] = useState(false);
  
  if (!sourcePos || !targetPos) return null;
  
  // Calculer la direction et la distance entre les nodes
  const direction = new THREE.Vector3(
    targetPos.x - sourcePos.x,
    targetPos.y - sourcePos.y,
    targetPos.z - sourcePos.z
  );
  const distance = direction.length();
  direction.normalize();
  
  // Rayon approximatif d'un node (baseScale * confidence moyenne)
  // On prend 15 pour être sûr que la ligne s'arrête avant le bord du node
  const nodeRadius = 8;
  
  // Raccourcir la ligne aux deux extrémités
  const shortenedStart = new THREE.Vector3(
    sourcePos.x + direction.x * nodeRadius,
    sourcePos.y + direction.y * nodeRadius,
    sourcePos.z + direction.z * nodeRadius
  );
  
  const shortenedEnd = new THREE.Vector3(
    targetPos.x - direction.x * nodeRadius,
    targetPos.y - direction.y * nodeRadius,
    targetPos.z - direction.z * nodeRadius
  );
  
  // Si les nodes sont trop proches, ne pas afficher la ligne
  if (distance < nodeRadius * 2) return null;
  
  const points = [shortenedStart, shortenedEnd];
  
  return (
    <Line
      points={points}
      color={isSelected ? '#60a5fa' : (hovered ? '#64748b' : '#475569')}
      lineWidth={isSelected ? 3.5 : (hovered ? 3.5 : 2.5)}
      transparent
      opacity={isSelected ? 0.7 : (hovered ? 0.4 : opacityLevel)}
      depthTest={true}
      depthWrite={false}
      renderOrder={-1}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
    />
  );
};

// Composant pour gérer les contrôles avec centre de masse initial
const DynamicOrbitControls = ({ isDragging }) => {
  const controlsRef = useRef();
  const { nodes, positions, filters, centerOnNodeId, setCameraControlsRef, clearCenterOnNode, pinnedNodes } = useGraphStore();
  const targetInitialized = useRef(false);
  const targetPosition = useRef(new THREE.Vector3());
  const isAnimating = useRef(false);
  
  // Exposer la ref aux contrôles pour le drag
  useEffect(() => {
    setCameraControlsRef(controlsRef);
    
    // Permettre une rotation verticale infinie sans limites
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

// Scene 3D principale avec gestion du drag
const Scene = () => {
  const { 
    nodes, 
    edges, 
    filters, 
    filterModes,
    opacityLevels,
    showRelations,
    positions, 
    selectedNode, 
    selectedEdge, 
    selectNode, 
    selectEdge,
    draggedNodeId,
    setDraggedNode,
    unpinNode,
    repinNodes,
    pinAllNodes,
    dragLayout,
    setPositions,
    cameraControlsRef,
    computeNodeLayers,
    pinDraggedNodeOnly,
    pinnedNodes,
    individualNodeOpacity,
    individualEdgeOpacity
  } = useGraphStore();
  
  const { camera } = useThree();
  const { layout } = useNgraphLayout();
  const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });
  const dragStartInfoRef = useRef(null);
  
  // Simuler la physique en continu
  useFrame(() => {
    const { simulationActive, layoutReady, simulationPaused } = useGraphStore.getState();
    
    // Ne pas simuler si la simulation est en pause
    if (simulationPaused) return;
    
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
      
      // Mettre à jour les positions des nodes dans le store
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
    const currentPositions = useGraphStore.getState().positions;
    setPositions({
      ...currentPositions,
      [nodeId]: newPos
    });
  };
  
  const handleDragEnd = (nodeId) => {
    if (!layout || !draggedNodeId) return;
    
    const { positions, unpinnedDuringDrag, pinDraggedNodeOnly, saveToHistory } = useGraphStore.getState();
    
    // Reset le cursor
    document.body.style.cursor = 'default';
    
    // Vérifier si la position a vraiment changé
    const startInfo = dragStartInfoRef.current;
    let positionChanged = false;
    const shouldSave = startInfo?.shouldSave || false;
    
    if (startInfo && positions[nodeId]) {
      const dx = positions[nodeId].x - startInfo.nodeStartX;
      const dy = positions[nodeId].y - startInfo.nodeStartY;
      const dz = positions[nodeId].z - startInfo.nodeStartZ;
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
          onClick={(e) => {
            e.stopPropagation();
            selectNode(node.id);
          }}
        />
      );})}
    </>
  );
};

// ============================================================================
// COMPOSANTS GÉNÉRIQUES RÉUTILISABLES
// ============================================================================

// Composant pour afficher une section rétractable (filtres ou pin management)
const CollapsibleSection = ({ 
  id,
  title, 
  color, 
  icon: Icon,
  isOpen, 
  onToggle, 
  stats,
  children 
}) => {
  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden">
      {/* En-tête minimal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:bg-slate-700/50 p-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          {Icon ? (
            <Icon className="w-3 h-3 text-slate-400" />
          ) : (
            <div className={`w-3 h-3 ${color} rounded-full`}></div>
          )}
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">{stats.label}:</span>
              <span className="font-bold text-white">{stats.value}</span>
            </div>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      
      {/* Contenu de la section */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-3 border-t border-slate-600/30">
          {children}
        </div>
      )}
    </div>
  );
};

// Composant pour une section de filtre avec contrôles d'affichage et opacité
const FilterSection = ({ 
  type, 
  color, 
  description, 
  nodes, 
  filters, 
  filterModes,
  opacityLevels,
  stats,
  isOpen,
  isNodesListOpen,
  onToggle,
  onNodesListToggle,
  toggleFilter,
  setFilterMode,
  setOpacityLevel,
  selectNode
}) => {
  const typeColor = {
    Entity: { bg: 'bg-blue-500', text: 'text-blue-400', hover: 'hover:bg-blue-600/30', from: 'bg-blue-600/20' },
    Event: { bg: 'bg-purple-500', text: 'text-purple-400', hover: 'hover:bg-purple-600/30', from: 'bg-purple-600/20' },
    Context: { bg: 'bg-green-500', text: 'text-green-400', hover: 'hover:bg-green-600/30', from: 'bg-green-600/20' }
  }[type];

  const maxOpacity = type === 'Relations' ? 0.5 : 1;
  const filteredNodes = nodes.filter(n => n.type === type);
  const visibleCount = filteredNodes.filter(n => filters[type]).length;

  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden">
      {/* En-tête minimal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:bg-slate-700/50 p-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 ${color} rounded-full`}></div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            {type}
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-300">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Visibles:</span>
              <span className={`font-bold ${typeColor.text}`}>{visibleCount}</span>
            </div>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {/* Contenu de la section */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-3 border-t border-slate-600/30">
          {/* Description */}
          <div className="pt-2 text-xs text-slate-400">
            {description}
          </div>

          {/* Toggle Affichage */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Affichage</span>
            <button
              type="button"
              onClick={() => toggleFilter(type)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                filters[type] ? color.replace('bg-', 'bg-').replace('-500', '-600') : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  filters[type] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          
          {/* Slider d'opacité (appliqué quand affichage est activé) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Niveau d'opacité</span>
              <span className="text-xs font-mono text-slate-400">{Math.round(opacityLevels[type] * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <EyeOff 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel(type, 0)}
                title="Opacité minimale (0%)"
              />
              <input
                type="range"
                min="0"
                max={maxOpacity}
                step="0.05"
                value={opacityLevels[type]}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setOpacityLevel(type, value);
                }}
                className={`flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:${color} [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:${color} [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer`}
              />
              <Eye 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel(type, maxOpacity)}
                title={`Opacité maximale (${Math.round(maxOpacity * 100)}%)`}
              />
            </div>
          </div>
          
          {/* Liste des nodes - Section rétractable */}
          {filteredNodes.length > 0 && (
            <div className="border-t border-slate-600/30 pt-3">
              <button
                onClick={onNodesListToggle}
                className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
              >
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Nodes ({filteredNodes.length})
                </span>
                {isNodesListOpen ? (
                  <ChevronUp className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                )}
              </button>
              
              {isNodesListOpen && (
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                  {filteredNodes.map(node => (
                    <div key={node.id} className="flex items-start gap-2 p-2 bg-slate-700/50 rounded hover:bg-slate-700 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">{node.label}</div>
                        <div className="text-xs text-slate-500">{node.subtype}</div>
                      </div>
                      <button
                        onClick={() => selectNode(node.id)}
                        className={`p-1 ${typeColor.from} ${typeColor.hover} ${typeColor.text} rounded transition-colors flex-shrink-0`}
                        title="Sélectionner"
                      >
                        <Info className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Composant pour la section Relations
const RelationsSection = ({ 
  edges, 
  nodes,
  filters, 
  filterModes,
  opacityLevels,
  isOpen,
  isRelationsListOpen,
  onToggle,
  onRelationsListToggle,
  toggleFilter,
  setFilterMode,
  setOpacityLevel,
  selectEdge
}) => {
  const visibleCount = edges.filter(e => filters['Relations']).length;

  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden">
      {/* En-tête minimal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:bg-slate-700/50 p-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            Relations
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-300">{edges.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Visibles:</span>
              <span className="font-bold text-slate-400">{visibleCount}</span>
            </div>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {/* Contenu de la section */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-3 border-t border-slate-600/30">
          {/* Description */}
          <div className="pt-2 text-xs text-slate-400">
            Liens et relations entre les différents éléments du graphe.
          </div>

          {/* Toggle Affichage */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Affichage</span>
            <button
              type="button"
              onClick={() => toggleFilter('Relations')}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                filters['Relations'] ? 'bg-slate-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  filters['Relations'] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          
          {/* Slider d'opacité (appliqué quand affichage est activé) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Niveau d'opacité</span>
              <span className="text-xs font-mono text-slate-400">{Math.round(opacityLevels.Relations * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <EyeOff 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel('Relations', 0)}
                title="Opacité minimale (0%)"
              />
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={opacityLevels.Relations}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setOpacityLevel('Relations', value);
                }}
                className="flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-slate-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <Eye 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel('Relations', 0.5)}
                title="Opacité maximale (50%)"
              />
            </div>
          </div>
          
          {/* Liste des relations - Section rétractable */}
          {edges.length > 0 && (
            <div className="border-t border-slate-600/30 pt-3">
              <button
                onClick={onRelationsListToggle}
                className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
              >
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Relations ({edges.length})
                </span>
                {isRelationsListOpen ? (
                  <ChevronUp className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                )}
              </button>
              
              {isRelationsListOpen && (
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                  {edges.map(edge => {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    const targetNode = nodes.find(n => n.id === edge.target);
                    return (
                      <div key={edge.id} className="p-2 bg-slate-700/50 rounded hover:bg-slate-700 transition-colors">
                        <div className="text-xs text-slate-400 mb-1">{edge.label}</div>
                        <div className="text-xs text-slate-500">
                          {sourceNode?.label} → {targetNode?.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COUCHE 4 : INTERACTION LAYER (UI & Controls)
// ============================================================================

const NexReecGraph = ({ initialData }) => {
  const {
    nodes,
    edges,
    filters,
    filterModes,
    opacityLevels,
    showRelations,
    selectedNode,
    selectedEdge,
    layoutRunning,
    layoutProgress,
    layoutReady,
    availableReecs,
    availableRelations,
    visibleReecIds,
    positions,
    loadData,
    addReecToGraph,
    removeReecFromGraph,
    toggleFilter,
    setFilterMode,
    setOpacityLevel,
    toggleRelations,
    selectNode,
    selectEdge,
    clearSelection,
    setLayoutReady,
    setPositions,
    simulationPaused,
    setSimulationPaused,
    toggleNodePin,
    isPinned,
    unpinAllNodes,
    pinAllVisibleNodes,
    undo,
    redo,
    canUndo,
    canRedo,
    pinnedNodes,
    individualNodeOpacity,
    individualEdgeOpacity,
    setIndividualNodeOpacity,
    setIndividualEdgeOpacity
  } = useGraphStore();
  
  const [initialized, setInitialized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeTab, setActiveTab] = useState('settings'); // 'settings', 'node', 'edge'
  const [showDetailsSection, setShowDetailsSection] = useState(true);
  const [showFiltersSubSection, setShowFiltersSubSection] = useState({
    entity: false,
    event: false,
    context: false,
    relations: false,
    entityNodes: false,
    eventNodes: false,
    contextNodes: false,
    relationsList: false,
    pinnedNodesList: false
  });
  const [showPinnedNodesSection, setShowPinnedNodesSection] = useState(false);
  const [showConnectedReecsSection, setShowConnectedReecsSection] = useState(false);
  const initialSimulationStarted = useRef(false);
  const { runSimulation, stopSimulation, layout } = useNgraphLayout();
  
  // Charger les données initiales
  useEffect(() => {
    if (initialData && !initialized) {
      loadData(initialData);
      setInitialized(true);
    }
  }, [initialData, initialized, loadData]);
  
  // Lancer la simulation automatiquement uniquement au premier chargement (une seule fois)
  useEffect(() => {
    if (initialized && !initialSimulationStarted.current && nodes.length > 0) {
      // Attendre que le layout soit créé
      const checkLayout = setInterval(() => {
        const { layout } = useNgraphLayout.getState?.() || {};
        if (layout || typeof useNgraphLayout !== 'function') {
          clearInterval(checkLayout);
          initialSimulationStarted.current = true;
          runSimulation(nodes.length * 35 > 1000 ? 1000 : nodes.length * 35);
        }
      }, 100);
      
      // Timeout de sécurité
      setTimeout(() => {
        if (!initialSimulationStarted.current) {
          clearInterval(checkLayout);
          initialSimulationStarted.current = true;
          runSimulation(nodes.length * 35 > 1000 ? 1000 : nodes.length * 35);
        }
      }, 2000);
      
      return () => clearInterval(checkLayout);
    } else if (initialized && nodes.length === 0) {
      setLayoutReady(true);
    }
  }, [initialized, nodes.length, runSimulation, setLayoutReady]);
  
  // Calculer les REECs filtrés par recherche
  const filteredReecs = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return availableReecs
      .filter(reec => 
        !visibleReecIds.has(reec.reec_id) && (
          reec.label.toLowerCase().includes(query) ||
          reec.aliases?.some(alias => alias.toLowerCase().includes(query))
        )
      )
      .slice(0, 10); // Limiter à 10 résultats
  }, [searchQuery, availableReecs, visibleReecIds]);
  
  // Calculer les top REECs par nombre de connexions
  const topReecs = useMemo(() => {
    const connectionCounts = {};
    availableRelations.forEach(rel => {
      connectionCounts[rel.source_reec_id] = (connectionCounts[rel.source_reec_id] || 0) + 1;
      connectionCounts[rel.target_reec_id] = (connectionCounts[rel.target_reec_id] || 0) + 1;
    });
    
    return availableReecs
      .map(reec => ({
        ...reec,
        connectionCount: connectionCounts[reec.reec_id] || 0
      }))
      .filter(reec => !visibleReecIds.has(reec.reec_id))
      .sort((a, b) => b.connectionCount - a.connectionCount)
      .slice(0, 10);
  }, [availableReecs, availableRelations, visibleReecIds]);
  
  // Calculer les REECs connectés au nœud sélectionné
  const connectedReecs = useMemo(() => {
    if (!selectedNode) return [];
    
    const connectedIds = new Set();
    availableRelations.forEach(rel => {
      if (rel.source_reec_id === selectedNode.id) {
        connectedIds.add(rel.target_reec_id);
      }
      if (rel.target_reec_id === selectedNode.id) {
        connectedIds.add(rel.source_reec_id);
      }
    });
    
    return availableReecs
      .filter(reec => connectedIds.has(reec.reec_id))
      .map(reec => ({
        ...reec,
        isVisible: visibleReecIds.has(reec.reec_id)
      }));
  }, [selectedNode, availableReecs, availableRelations, visibleReecIds]);
  
  // Calculer les nodes pinnés avec leurs informations
  const pinnedNodesInfo = useMemo(() => {
    return nodes
      .filter(node => pinnedNodes.has(node.id))
      .map(node => ({
        id: node.id,
        label: node.label,
        type: node.type
      }));
  }, [nodes, pinnedNodes]);
  
  const handleAddReec = (reecId) => {
    addReecToGraph(reecId);
    // La simulation continue s'occupe automatiquement du nouveau nœud
  };
  
  const handleRemoveReec = (reecId) => {
    removeReecFromGraph(reecId);
    // La simulation continue s'occupe automatiquement de la suppression
  };
  
  // Gérer le changement automatique d'onglet lors de la sélection
  useEffect(() => {
    if (selectedNode) {
      setActiveTab('node');
    } else if (selectedEdge) {
      setActiveTab('edge');
    } else {
      setActiveTab('settings');
    }
  }, [selectedNode, selectedEdge]);
  
  // Raccourcis clavier
  useEffect(() => {
    const handleKeyPress = (e) => {
      // P pour pinner/unpinner le node sélectionné
      if (e.key === 'p' || e.key === 'P') {
        if (selectedNode && layout) {
          e.preventDefault();
          toggleNodePin(selectedNode.id, layout);
        }
      }
      
      // Ctrl+Z pour undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
      }
      
      // Ctrl+Y ou Ctrl+Shift+Z pour redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedNode, layout, toggleNodePin, undo, redo, canUndo, canRedo]);
  
  const stats = {
    total: nodes.length,
    entities: nodes.filter(n => n.type === 'Entity').length,
    events: nodes.filter(n => n.type === 'Event').length,
    contexts: nodes.filter(n => n.type === 'Context').length,
    visible: nodes.filter(n => filters[n.type]).length
  };
  
  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      {/* Layout principal : Canvas + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas 3D */}
        <div className="flex-1 relative">
          {(nodes.length === 0 || !layoutReady) ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="text-center">
                <Loader className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
                <p className="text-slate-300 font-medium">
                  {nodes.length === 0 ? 'Chargement des données...' : 'Calcul du layout...'}
                </p>
                {layoutProgress > 0 && (
                  <p className="text-slate-400 text-sm mt-2">{Math.round(layoutProgress)}%</p>
                )}
              </div>
            </div>
          ) : (
            <Canvas
              camera={{ position: [0, 50, 100], fov: 50 }}
              style={{ background: '#0f172a' }}
              gl={{ antialias: true, alpha: true }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  clearSelection();
                }
              }}
            >
              <Scene />
            </Canvas>
          )}

          {/* Barre de recherche flottante */}
          {layoutReady && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] z-10">
              <div className="bg-slate-800/95 backdrop-blur-sm rounded-b-xl shadow-2xl border border-slate-700 p-1">
                {/* Barre de recherche */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    placeholder="Rechercher un REEC par nom ou alias..."
                    className="w-full pl-10 pr-10 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-600 rounded"
                    >
                      <X className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
                
                {/* Résultats de recherche */}
                {searchQuery && filteredReecs.length > 0 && (
                  <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                    {filteredReecs.map(reec => (
                      <div key={reec.reec_id} className="flex items-start gap-2 p-2 bg-slate-700/70 rounded hover:bg-slate-700 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                          <div className="text-xs text-slate-400">{reec.type} • {reec.subtype}</div>
                        </div>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddReec(reec.reec_id);
                          }}
                          className="p-1 bg-blue-600 hover:bg-blue-700 rounded transition-colors flex-shrink-0"
                          title="Ajouter au graphe"
                        >
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {searchQuery && filteredReecs.length === 0 && (
                  <div className="text-sm text-slate-400 text-center py-3 mt-3">
                    Aucun résultat
                  </div>
                )}
                
                {/* Top REECs (affichés automatiquement au focus) */}
                {searchFocused && !searchQuery && (
                  <div className="mt-3 max-h-72 overflow-y-auto space-y-2">
                    {topReecs.slice(0, 3).map(reec => (
                      <div key={reec.reec_id} className="flex items-start gap-2 p-2 bg-slate-700/70 rounded hover:bg-slate-700 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                          <div className="text-xs text-slate-400">
                            {reec.type} • {reec.connectionCount} relation{reec.connectionCount > 1 ? 's' : ''}
                          </div>
                        </div>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddReec(reec.reec_id);
                          }}
                          className="p-1 bg-blue-600 hover:bg-blue-700 rounded transition-colors flex-shrink-0"
                          title="Ajouter au graphe"
                        >
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Panel d'information avec onglets */}
        <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col">
          {/* Barre d'onglets */}
          <div className="flex border-b border-slate-700 bg-slate-800">
            {selectedNode && (
              <button
                onClick={() => setActiveTab('node')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'node'
                    ? 'bg-slate-700 text-white border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>Node</span>
                </div>
              </button>
            )}
            {selectedEdge && (
              <button
                onClick={() => setActiveTab('edge')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'edge'
                    ? 'bg-slate-700 text-white border-b-2 border-purple-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Network className="w-4 h-4" />
                  <span>Relation</span>
                </div>
              </button>
            )}
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-14 px-4 py-3 text-sm font-medium transition-colors border-l border-slate-700 ml-auto ${
                activeTab === 'settings'
                  ? 'bg-slate-700 text-white border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
              title="Paramètres"
            >
              <div className="flex items-center justify-center">
                <Settings className="w-5 h-5" />
              </div>
            </button>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Onglet Node */}
            {activeTab === 'node' && selectedNode && (
            <div className="flex flex-col">
              <div className={`sticky top-0 z-10 p-6 bg-slate-800 ${
                selectedNode.type === 'Entity' ? 'bg-gradient-to-br from-blue-600/20 to-blue-500/10 border-l-4 border-blue-500' :
                selectedNode.type === 'Event' ? 'bg-gradient-to-br from-purple-600/20 to-purple-500/10 border-l-4 border-purple-500' :
                'bg-gradient-to-br from-green-600/20 to-green-500/10 border-l-4 border-green-500'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {selectedNode.type}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleNodePin(selectedNode.id, layout)}
                      className={`p-1 rounded transition-colors ${
                        isPinned(selectedNode.id)
                          ? 'bg-yellow-600/20 text-yellow-400 hover:text-yellow-300'
                          : 'hover:bg-slate-600/20 text-slate-400 hover:text-slate-300'
                      }`}
                      title={isPinned(selectedNode.id) ? 'Dépingler' : 'Épingler'}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const { triggerCenterOnNode } = useGraphStore.getState();
                        triggerCenterOnNode(selectedNode.id);
                      }}
                      className="p-1 rounded transition-colors hover:bg-blue-600/20 text-blue-400 hover:text-blue-300"
                      title="Centrer la vue sur ce node"
                    >
                      <Focus className="w-4 h-4" />
                    </button>
                    {connectedReecs.length > 0 && (
                      <>
                        <button
                          onClick={() => {
                            // Obtenir la position du node sélectionné
                            const selectedNodePos = positions[selectedNode.id];
                            if (!selectedNodePos) return;
                            
                            // Récupérer les REECs à ajouter
                            const reecsToAdd = connectedReecs.filter(r => !r.isVisible);
                            
                            // Initialiser les positions des nouveaux nodes sur le node sélectionné
                            const newPositions = { ...positions };
                            reecsToAdd.forEach(reec => {
                              newPositions[reec.reec_id] = {
                                x: selectedNodePos.x,
                                y: selectedNodePos.y,
                                z: selectedNodePos.z
                              };
                            });
                            
                            // Mettre à jour les positions avant d'ajouter les nodes
                            setPositions(newPositions);
                            
                            // Ajouter les nodes
                            reecsToAdd.forEach(reec => handleAddReec(reec.reec_id));
                          }}
                          disabled={connectedReecs.filter(r => !r.isVisible).length === 0}
                          className="p-1 rounded transition-colors bg-green-600/20 text-green-400 hover:text-green-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Ajouter tous les REECs connectés"
                        >
                          <Orbit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            connectedReecs.filter(r => r.isVisible && !isPinned(r.reec_id)).forEach(reec => handleRemoveReec(reec.reec_id));
                          }}
                          disabled={connectedReecs.filter(r => r.isVisible && !isPinned(r.reec_id)).length === 0}
                          className="p-1 rounded transition-colors bg-red-600/20 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Retirer tous les REECs connectés (sauf pinnés)"
                        >
                          <Orbit className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleRemoveReec(selectedNode.id)}
                      className="p-1 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded transition-colors"
                      title="Supprimer du graphe"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={clearSelection}
                      className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  {selectedNode.label}
                </h2>
                <div className="text-slate-400 text-sm">
                  {selectedNode.subtype}
                  {selectedNode.category && ` • ${selectedNode.category}`}
                </div>
              </div>

              <div className="p-6 space-y-4">

                {selectedNode.summary && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Résumé
                      </h3>
                    </div>
                    <p className="text-slate-400 leading-relaxed text-sm">
                      {selectedNode.summary}
                    </p>
                  </div>
                )}

                {/* Confidence */}
                <div className="flex justify-between text-sm py-1 border-slate-700">
                  <span className="text-slate-400">Confidence</span>
                  <span className="font-medium text-slate-200">
                    {Math.round((selectedNode.confidence || 0) * 100)}%
                  </span>
                </div>

                {/* Slider Opacité */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">Opacité</span>
                    <span className="text-xs font-mono text-slate-400">
                      {Math.round((individualNodeOpacity[selectedNode.id] ?? opacityLevels[selectedNode.type]) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <EyeOff 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualNodeOpacity(selectedNode.id, 0)}
                      title="Opacité minimale (0%)"
                    />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={individualNodeOpacity[selectedNode.id] ?? opacityLevels[selectedNode.type]}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setIndividualNodeOpacity(selectedNode.id, value);
                      }}
                      className={`flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer ${
                        selectedNode.type === 'Entity' ? '[&::-webkit-slider-thumb]:bg-blue-500 [&::-moz-range-thumb]:bg-blue-500' :
                        selectedNode.type === 'Event' ? '[&::-webkit-slider-thumb]:bg-purple-500 [&::-moz-range-thumb]:bg-purple-500' :
                        '[&::-webkit-slider-thumb]:bg-green-500 [&::-moz-range-thumb]:bg-green-500'
                      }`}
                    />
                    <Eye 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualNodeOpacity(selectedNode.id, 1)}
                      title="Opacité maximale (100%)"
                    />
                  </div>
                </div>

                {/* Section Détails - Rétractable */}
                <div className="border-t border-slate-700 pt-4">
                  <button
                    onClick={() => {
                      if (!showDetailsSection && showConnectedReecsSection)
                        setShowConnectedReecsSection(!showConnectedReecsSection);
                      setShowDetailsSection(!showDetailsSection);}}
                    className="w-full flex items-center justify-between mb-3 hover:bg-slate-700/30 p-2 rounded transition-colors"
                  >
                    <Info className="w-4 h-4 text-slate-400" />
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                      Détails
                    </h3>
                    {showDetailsSection ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                  
                  {showDetailsSection && (
                    <div className="space-y-4">
                      {selectedNode.summaryDetailed && selectedNode.summaryDetailed !== selectedNode.summary && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Description
                          </h4>
                          <p className="text-slate-400 leading-relaxed text-sm">
                            {selectedNode.summaryDetailed}
                          </p>
                        </div>
                      )}

                      {selectedNode.temporal?.start && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Période temporelle
                          </h4>
                          <div className="text-slate-400 text-sm">
                            {selectedNode.temporal.start}
                            {selectedNode.temporal.end && ` → ${selectedNode.temporal.end}`}
                          </div>
                        </div>
                      )}

                      {selectedNode.locations?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Localisations
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedNode.locations.map((loc, i) => (
                              <span key={i} className="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs">
                                {loc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedNode.tags?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wide">
                            Tags
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedNode.tags.map((tag, i) => (
                              <span key={i} className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs border border-blue-500/30">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section REECs connectés - Rétractable */}
                {connectedReecs.length > 0 && (
                    <div className="mt-4 border-t border-slate-700 pt-4">
                      <button
                        onClick={() => {
                          if (!showConnectedReecsSection && showDetailsSection)
                            setShowDetailsSection(!showDetailsSection);
                          setShowConnectedReecsSection(!showConnectedReecsSection);}}
                        className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
                      >
                        <Network className="w-4 h-4 text-slate-400" />
                        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                          REECs connectés ({connectedReecs.length})
                        </h4>
                        {showConnectedReecsSection ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      
                      {showConnectedReecsSection && (
                        <>
                          <div className="overflow-y-auto space-y-2 mt-3">
                            {connectedReecs.map(reec => (
                              <div key={reec.reec_id} className="flex items-start gap-2 p-2 bg-slate-700/50 rounded">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                                  <div className="text-xs text-slate-400">{reec.type}</div>
                                </div>
                                {reec.isVisible ? (
                                  <button
                                    onClick={() => handleRemoveReec(reec.reec_id)}
                                    className="p-1 bg-red-600 hover:bg-red-700 rounded transition-colors flex-shrink-0"
                                    title="Retirer du graphe"
                                  >
                                    <X className="w-4 h-4 text-white" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleAddReec(reec.reec_id)}
                                    className="p-1 bg-green-600 hover:bg-green-700 rounded transition-colors flex-shrink-0"
                                    title="Ajouter au graphe"
                                  >
                                    <Plus className="w-4 h-4 text-white" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Onglet Edge */}
            {activeTab === 'edge' && selectedEdge && (
            <div>
              <div className="p-6 bg-gradient-to-br from-slate-600/20 to-slate-700/10 border-l-4 border-slate-500">
                <div className="flex items-start justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Relation
                  </div>
                  <button
                    onClick={clearSelection}
                    className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">
                  {selectedEdge.type || 'Connexion'}
                </h2>
                <div className="text-slate-400 text-sm">
                  {nodes.find(n => n.id === selectedEdge.source)?.label} → {nodes.find(n => n.id === selectedEdge.target)?.label}
                </div>
              </div>

              <div className="p-6 space-y-4">

                {selectedEdge.description && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-slate-400" />
                      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Description
                      </h3>
                    </div>
                    <p className="text-slate-400 leading-relaxed text-sm">
                      {selectedEdge.description}
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wide">
                    Connexion
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm p-2 bg-slate-700/30 rounded">
                      <span className="text-slate-400">Source</span>
                      <span className="font-medium text-slate-200">
                        {nodes.find(n => n.id === selectedEdge.source)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm p-2 bg-slate-700/30 rounded">
                      <span className="text-slate-400">Cible</span>
                      <span className="font-medium text-slate-200">
                        {nodes.find(n => n.id === selectedEdge.target)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm p-2 bg-slate-700/30 rounded">
                      <span className="text-slate-400">Type</span>
                      <span className="font-medium text-slate-200">
                        {selectedEdge.type}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedEdge.confidence && (
                  <div className="pt-4 border-t border-slate-700">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Confidence</span>
                      <span className="font-medium text-slate-200">
                        {Math.round((selectedEdge.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
                  
                {/* Slider Opacité */}
                <div className="border-tspace-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-300">Opacité</span>
                    <span className="text-xs font-mono text-slate-400">
                      {Math.round((individualEdgeOpacity[selectedEdge.id] ?? opacityLevels.Relations) * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <EyeOff 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualEdgeOpacity(selectedEdge.id, 0)}
                      title="Opacité minimale (0%)"
                    />
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.05"
                      value={individualEdgeOpacity[selectedEdge.id] ?? opacityLevels.Relations}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        setIndividualEdgeOpacity(selectedEdge.id, value);
                      }}
                      className="flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-slate-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                    />
                    <Eye 
                      className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                      onClick={() => setIndividualEdgeOpacity(selectedEdge.id, 0.5)}
                      title="Opacité maximale (50%)"
                    />
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Onglet Settings (Paramètres) */}
            {activeTab === 'settings' && (
              <div className="p-4">
                {/* En-tête avec statistiques */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-slate-300" />
                      <h2 className="text-lg font-bold text-white">Paramètres du graphe</h2>
                    </div>
                    <button
                      onClick={() => {
                        setShowFiltersSubSection({
                          entity: false,
                          event: false,
                          context: false,
                          relations: false,
                          entityNodes: false,
                          eventNodes: false,
                          contextNodes: false,
                          relationsList: false,
                          pinnedNodesList: false
                        });
                        setShowPinnedNodesSection(false);
                      }}
                      className="bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                      title="Rétracter toutes les sections"
                    >
                      <ListChevronsDownUp className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Total:</span>
                      <span className="font-bold text-white">{stats.total}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Visible:</span>
                      <span className="font-bold text-white">{stats.visible}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Section Entity */}
                  <FilterSection
                    type="Entity"
                    color="bg-blue-500"
                    description="Entités représentant des personnes, lieux, organisations ou objets dans le graphe."
                    nodes={nodes}
                    filters={filters}
                    filterModes={filterModes}
                    opacityLevels={opacityLevels}
                    stats={{ total: stats.entities }}
                    isOpen={showFiltersSubSection.entity}
                    isNodesListOpen={showFiltersSubSection.entityNodes}
                    onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, entity: !prev.entity }))}
                    onNodesListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, entityNodes: !prev.entityNodes }))}
                    toggleFilter={toggleFilter}
                    setFilterMode={setFilterMode}
                    setOpacityLevel={setOpacityLevel}
                    selectNode={selectNode}
                  />

                  {/* Section Event */}
                  <FilterSection
                    type="Event"
                    color="bg-purple-500"
                    description="Événements majeurs ayant marqué la période étudiée."
                    nodes={nodes}
                    filters={filters}
                    filterModes={filterModes}
                    opacityLevels={opacityLevels}
                    stats={{ total: stats.events }}
                    isOpen={showFiltersSubSection.event}
                    isNodesListOpen={showFiltersSubSection.eventNodes}
                    onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, event: !prev.event }))}
                    onNodesListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, eventNodes: !prev.eventNodes }))}
                    toggleFilter={toggleFilter}
                    setFilterMode={setFilterMode}
                    setOpacityLevel={setOpacityLevel}
                    selectNode={selectNode}
                  />

                  {/* Section Context */}
                  <FilterSection
                    type="Context"
                    color="bg-green-500"
                    description="Éléments contextuels définissant le cadre historique, social et culturel."
                    nodes={nodes}
                    filters={filters}
                    filterModes={filterModes}
                    opacityLevels={opacityLevels}
                    stats={{ total: stats.contexts }}
                    isOpen={showFiltersSubSection.context}
                    isNodesListOpen={showFiltersSubSection.contextNodes}
                    onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, context: !prev.context }))}
                    onNodesListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, contextNodes: !prev.contextNodes }))}
                    toggleFilter={toggleFilter}
                    setFilterMode={setFilterMode}
                    setOpacityLevel={setOpacityLevel}
                    selectNode={selectNode}
                  />

                  {/* Section Relations */}
                  <RelationsSection
                    edges={edges}
                    nodes={nodes}
                    filters={filters}
                    filterModes={filterModes}
                    opacityLevels={opacityLevels}
                    isOpen={showFiltersSubSection.relations}
                    isRelationsListOpen={showFiltersSubSection.relationsList}
                    onToggle={() => setShowFiltersSubSection(prev => ({ ...prev, relations: !prev.relations }))}
                    onRelationsListToggle={() => setShowFiltersSubSection(prev => ({ ...prev, relationsList: !prev.relationsList }))}
                    toggleFilter={toggleFilter}
                    setFilterMode={setFilterMode}
                    setOpacityLevel={setOpacityLevel}
                    selectEdge={selectEdge}
                  />
                </div>  {/* Fin de space-y-3 */}
              
              {/* Séparateur */}
              <div className="border-t border-slate-700 my-4"></div>
              
              {/* Sous-section Pin Management */}
              <CollapsibleSection
                id="pin-management"
                title="Pin Management"
                icon={Pin}
                isOpen={showPinnedNodesSection}
                onToggle={() => setShowPinnedNodesSection(!showPinnedNodesSection)}
                stats={{ label: "Pinnés", value: pinnedNodesInfo.length }}
              >
                {/* Description */}
                <div className="pt-2 text-xs text-slate-400">
                  Gérez les nodes épinglés pour les maintenir en place dans le graphe.
                </div>
                
                {/* Boutons d'actions globales */}
                <div className="flex gap-2">
                  <button
                    onClick={() => pinAllVisibleNodes(layout, nodes.filter(n => filters[n.type]).map(n => n.id))}
                    className="flex-1 px-3 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 hover:text-yellow-300 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
                    title="Épingler tous les nodes visibles"
                  >
                    <Pin className="w-3 h-3" />
                    Pin All
                  </button>
                  <button
                    onClick={() => unpinAllNodes(layout)}
                    disabled={pinnedNodesInfo.length === 0}
                    className="flex-1 px-3 py-2 bg-slate-600/20 hover:bg-slate-600/30 text-slate-400 hover:text-slate-300 rounded text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Dépingler tous les nodes"
                  >
                    Unpin All
                  </button>
                </div>
                
                {/* Liste des nodes pinnés - Section rétractable */}
                {pinnedNodesInfo.length > 0 && (
                  <div className="border-t border-slate-600/30 pt-3">
                    <button
                      onClick={() => setShowFiltersSubSection(prev => ({ ...prev, pinnedNodesList: !prev.pinnedNodesList }))}
                      className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
                    >
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                        Nodes Pinnés ({pinnedNodesInfo.length})
                      </span>
                      {showFiltersSubSection.pinnedNodesList ? (
                        <ChevronUp className="w-3 h-3 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                    
                    {showFiltersSubSection.pinnedNodesList && (
                      <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                        {pinnedNodesInfo.map(node => (
                          <div key={node.id} className="flex items-start gap-2 p-2 bg-slate-700/50 rounded hover:bg-slate-700 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-200 truncate">{node.label}</div>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <div className={`w-2 h-2 rounded-full ${
                                  node.type === 'Entity' ? 'bg-blue-500' :
                                  node.type === 'Event' ? 'bg-purple-500' :
                                  'bg-green-500'
                                }`}></div>
                                <span>{node.type}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => toggleNodePin(node.id, layout)}
                              className="p-1 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded transition-colors flex-shrink-0"
                              title="Dépingler"
                            >
                              <Pin className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {pinnedNodesInfo.length === 0 && (
                  <div className="text-xs text-slate-500 text-center py-3 bg-slate-800/30 rounded">
                    Aucun node épinglé
                  </div>
                )}
              </CollapsibleSection>
              </div>
            )}
        </div>

          {/* Boutons Historique et Play/Pause - toujours visibles en bas */}
          <div className="p-4 bg-slate-800">
            <div className="flex gap-2">
              {/* Bouton Undo */}
              <button
                onClick={() => undo()}
                disabled={!canUndo()}
                className="px-5 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
                title="Annuler (Ctrl+Z)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              {/* Bouton Redo */}
              <button
                onClick={() => redo()}
                disabled={!canRedo()}
                className="px-5 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
                title="Refaire (Ctrl+Y)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              
              {/* Bouton Play/Pause */}
              <button
                onClick={() => setSimulationPaused(!simulationPaused)}
                className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                  simulationPaused 
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {simulationPaused ? (
                  <>
                    <Play className="w-4 h-4" />
                    Reprendre
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NexReecGraph;
