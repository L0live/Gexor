import { create } from 'zustand';

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
    Relations: true,
    minConfidence: 0,
    dateRange: [null, null], // [minDate, maxDate]
    selectedTags: new Set(),
    advancedSearch: ""
  },
  layoutMode: 'force', // 'force', 'hierarchical', 'circular', 'cluster', 'temporal'
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
  hoveredNodeId: null,
  hoveredEdgeId: null,
  centralNodeId: null,
  allTags: [],
  
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
  simulationStable: false,
  layoutInstance: null,
  setLayoutInstance: (layout) => set({ layoutInstance: layout }),
  setHoveredNodeId: (id) => set({ hoveredNodeId: id }),
  setHoveredEdgeId: (id) => set({ hoveredEdgeId: id }),
  
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
    
    // Pinner le REEC central par défaut (et UNIQUEMENT celui-ci au début)
    const initialPinnedNodes = new Set();
    if (mostConnectedReecId) {
      initialPinnedNodes.add(mostConnectedReecId);
    }
    
    // Extraire tous les tags uniques et la plage de dates
    const allTags = new Set();
    let minDate = null;
    let maxDate = null;

    jsonData.reecs.forEach(reec => {
      if (reec.metadata_tags) {
        reec.metadata_tags.forEach(tag => allTags.add(tag));
      }
      const dateStr = reec.temporal_start_date || reec.temporal_date;
      if (dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          if (!minDate || date < minDate) minDate = date;
          if (!maxDate || date > maxDate) maxDate = date;
        }
      }
    });

    // S'assurer que les autres nodes ne sont pas pinnés
    set((state) => ({
      availableReecs: jsonData.reecs,
      availableRelations: jsonData.relations,
      allTags: Array.from(allTags).sort(),
      filters: {
        ...state.filters,
        dateRange: [minDate, maxDate]
      },
      rawReecs: jsonData.reecs.filter(reec => initialVisibleIds.has(reec.reec_id)),
      rawRelations: jsonData.relations.filter(rel => 
        initialVisibleIds.has(rel.source_reec_id) && initialVisibleIds.has(rel.target_reec_id)
      ),
      nodes,
      edges,
      visibleReecIds: initialVisibleIds,
      pinnedNodes: initialPinnedNodes,
      centralNodeId: mostConnectedReecId,
      layoutMode: 'force', // S'assurer qu'on commence en mode force
      positions: {} // On reset les positions pour forcer un nouveau layout propre
    }));
    
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
    
    set({
      visibleReecIds: newVisibleIds,
      rawReecs: state.availableReecs.filter(reec => newVisibleIds.has(reec.reec_id)),
      rawRelations: state.availableRelations.filter(rel => 
        newVisibleIds.has(rel.source_reec_id) && newVisibleIds.has(rel.target_reec_id)
      )
    });
    
    state.updateGraphData();
    
    // Sauvegarder dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  removeReecFromGraph: (reecId) => {
    const state = get();
    const newVisibleIds = new Set(state.visibleReecIds);
    newVisibleIds.delete(reecId);
    
    set({
      visibleReecIds: newVisibleIds,
      rawReecs: state.availableReecs.filter(reec => newVisibleIds.has(reec.reec_id)),
      rawRelations: state.availableRelations.filter(rel => 
        newVisibleIds.has(rel.source_reec_id) && newVisibleIds.has(rel.target_reec_id)
      ),
      selectedNode: state.selectedNode?.id === reecId ? null : state.selectedNode
    });
    
    state.updateGraphData();
    
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
    get().updateGraphData();
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
    // Si on a des positions, on s'assure que le contenu du Set/Object est bien nouveau pour forcer le refresh
    set({ positions: { ...positions } });
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

  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
    get().wakeSimulation();
  },

  setAdvancedFilter: (key, value) => {
    set((state) => ({
      filters: {
        ...state.filters,
        [key]: value
      }
    }));
    get().updateGraphData();
  },

  exportGraph: () => {
    const state = get();
    const exportData = {
      visibleReecIds: Array.from(state.visibleReecIds),
      positions: state.positions,
      pinnedNodes: Array.from(state.pinnedNodes),
      filters: state.filters,
      layoutMode: state.layoutMode
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexreec-graph-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importGraph: (jsonData) => {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      set({
        visibleReecIds: new Set(data.visibleReecIds || []),
        positions: data.positions || {},
        pinnedNodes: new Set(data.pinnedNodes || []),
        filters: { ...get().filters, ...(data.filters || {}) },
        layoutMode: data.layoutMode || 'force'
      });
      // Re-process nodes and edges based on new visible IDs
      get().updateGraphData();
    } catch (e) {
      console.error("Failed to import graph data", e);
    }
  },

  updateGraphData: () => {
    const state = get();
    const { visibleReecIds, availableReecs, availableRelations, filters } = state;
    
    const nodes = availableReecs
      .filter(reec => {
        if (!visibleReecIds.has(reec.reec_id)) return false;
        
        // Filtre de confiance
        if (reec.metadata_confidence < filters.minConfidence) return false;
        
        // Filtre de date
        if (filters.dateRange[0] || filters.dateRange[1]) {
          const dateStr = reec.temporal_start_date || reec.temporal_date;
          if (dateStr) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              if (filters.dateRange[0] && date < filters.dateRange[0]) return false;
              if (filters.dateRange[1] && date > filters.dateRange[1]) return false;
            }
          }
        }
        
        // Filtre de tags
        if (filters.selectedTags.size > 0) {
          if (!reec.metadata_tags || !reec.metadata_tags.some(tag => filters.selectedTags.has(tag))) {
            return false;
          }
        }

        // Recherche full-text
        if (filters.advancedSearch) {
          const search = filters.advancedSearch.toLowerCase();
          const inLabel = reec.label.toLowerCase().includes(search);
          const inSummary = (reec.summary_short || "").toLowerCase().includes(search);
          const inDetailed = (reec.summary_detailed || "").toLowerCase().includes(search);
          if (!inLabel && !inSummary && !inDetailed) return false;
        }
        
        return true;
      })
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

    const visibleNodeIds = new Set(nodes.map(n => n.id));

    const edges = availableRelations
      .filter(rel => {
        if (!visibleNodeIds.has(rel.source_reec_id) || !visibleNodeIds.has(rel.target_reec_id)) return false;
        if (rel.confidence < filters.minConfidence) return false;
        return true;
      })
      .map(rel => ({
        id: `${rel.source_reec_id}-${rel.target_reec_id}`,
        source: rel.source_reec_id,
        target: rel.target_reec_id,
        type: rel.relation_type,
        description: rel.description,
        confidence: rel.confidence
      }));

    set({ nodes, edges });
    get().wakeSimulation();
  },
  
  setDraggedNode: (nodeId) => {
    set({ draggedNodeId: nodeId });
    if (nodeId) {
      get().wakeSimulation();
    }
  },
  
  pinAllNodes: (layout) => {
    if (!layout) return;
    const pinnedSet = new Set();
    layout.forEachBody((body, nodeId) => {
      body.isPinned = true;
      pinnedSet.add(nodeId);
    });
    set({ pinnedNodes: pinnedSet, dragLayout: layout });
  },
  
  unpinNode: (nodeId, layout) => {
    if (!layout) return;
    const { pinnedNodes } = get();
    const unpinnedSet = new Set();
    
    // Unpin le node et réinitialiser sa vélocité
    const body = layout.getBody(nodeId);
    if (body) {
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.velocity.z = 0;
      
      // On garde trace de s'il était pinné pour le re-pinner plus tard si besoin
      if (body.isPinned || pinnedNodes.has(nodeId)) {
        unpinnedSet.add(nodeId);
      }
      
      body.isPinned = false;
    }

    set({ 
      unpinnedDuringDrag: unpinnedSet
    });
    get().wakeSimulation();
  },
  
  repinNodes: (layout) => {
    if (!layout) return;
    const { unpinnedDuringDrag } = get();
    
    unpinnedDuringDrag.forEach(nodeId => {
      const body = layout.getBody(nodeId);
      if (body) {
        body.isPinned = true;
      }
    });
    set({ 
      draggedNodeId: null, 
      unpinnedDuringDrag: new Set()
    });
  },
  
  pinDraggedNodeOnly: (layout, draggedNodeId) => {
    if (!layout || !draggedNodeId) return;
    const body = layout.getBody(draggedNodeId);
    if (body) {
      body.isPinned = true;
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.velocity.z = 0;
    }
    
    // Si c'est un node qui n'était pas pinné, on l'ajoute maintenant
    // (Mais pour la demande actuelle, on pourrait aussi décider de ne PAS le pinner
    // si l'utilisateur ne l'a pas demandé explicitement, mais gardons la logique de drag=pin pour l'instant
    // ou suivons la demande "pas de pin automatique apres un drag" de tout à l'heure)
    // En fait, l'utilisateur a dit plus tôt "je ne veux pas qu'un node soit automatiquement epingler apres un drag, uniquement si il etait deja epingler"
    
    set({ 
      draggedNodeId: null, 
      simulationActive: true
    });
  },
  
  toggleNodePin: (nodeId, layout) => {
    if (!layout) return;
    const { pinnedNodes } = get();
    const body = layout.getBody(nodeId);
    if (!body) return;
    
    const newPinnedNodes = new Set(pinnedNodes);
    if (pinnedNodes.has(nodeId)) {
      // Unpin
      body.isPinned = false;
      newPinnedNodes.delete(nodeId);
    } else {
      // Pin
      body.isPinned = true;
      body.velocity.x = 0;
      body.velocity.y = 0;
      body.velocity.z = 0;
      newPinnedNodes.add(nodeId);
    }
    set({ pinnedNodes: newPinnedNodes });
    get().wakeSimulation();
    
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
        body.isPinned = false;
      }
    });
    set({ pinnedNodes: new Set() });
    get().wakeSimulation();
    
    // Sauvegarder dans l'historique
    setTimeout(() => get().saveToHistory(), 100);
  },
  
  pinAllVisibleNodes: (layout, visibleNodeIds) => {
    if (!layout) return;
    const newPinnedNodes = new Set();
    visibleNodeIds.forEach(nodeId => {
      const body = layout.getBody(nodeId);
      if (body) {
        body.isPinned = true;
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
    if (!paused) {
      set({ simulationStable: false });
    }
  },
  
  setSimulationStable: (stable) => {
    set({ simulationStable: stable });
  },

  wakeSimulation: () => {
    const { layoutMode } = get();
    // Ne réveiller que si on est en mode force
    if (get().simulationStable && layoutMode === 'force') {
      set({ simulationStable: false });
    }
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
          body.isPinned = snapshot.pinnedNodes.has(nodeId);
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
          body.isPinned = snapshot.pinnedNodes.has(nodeId);
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
  },

  resetAllSettings: (layout) => {
    const { centralNodeId, nodes } = get();
    const centralNode = nodes.find(n => n.id === centralNodeId);

    // Mettre à jour le layout si fourni
    if (layout) {
      layout.forEachBody((body, nodeId) => {
        body.isPinned = (nodeId === centralNodeId);
      });
    }

    set({
      filters: {
        Entity: true,
        Event: true,
        Context: true,
        Relations: true,
        minConfidence: 0,
        dateRange: [null, null],
        selectedTags: new Set(),
        advancedSearch: ""
      },
      layoutMode: 'force',
      filterModes: {
        Entity: 'opacity',
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
      individualNodeOpacity: {},
      individualEdgeOpacity: {},
      showRelations: true,
      simulationPaused: false,
      selectedNode: centralNode || null,
      selectedEdge: null,
      pinnedNodes: centralNodeId ? new Set([centralNodeId]) : new Set(),
      centerOnNodeId: centralNodeId
    });
  },

  resetFilters: () => {
    set({
      filters: {
        Entity: true,
        Event: true,
        Context: true,
        Relations: true,
        minConfidence: 0,
        dateRange: [null, null],
        selectedTags: new Set(),
        advancedSearch: ""
      },
      filterModes: {
        Entity: 'opacity',
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
      individualNodeOpacity: {},
      individualEdgeOpacity: {},
      showRelations: true
    });
    get().updateGraphData();
  }
}));

export default useGraphStore;
