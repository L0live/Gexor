/**
 * graphSlice — Processed nodes/edges, visibility, filtering, opacity
 */
import { mapReecToNode, mapRelationToEdge } from '../utils';
import { DEFAULT_FILTERS, DEFAULT_FILTER_MODES, DEFAULT_OPACITY_LEVELS } from '../../constants/graphConstants';

export const createGraphSlice = (set, get) => ({
  visibleReecIds: new Set(),
  rawReecs: [],
  rawRelations: [],
  nodes: [],
  edges: [],
  nodeGroupMemberships: {},
  nodeGroupDepths: {},

  filters: {
    Entity: true,
    Event: true,
    Context: true,
    Relations: true,
    minConfiance: 0,
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
  groupFilters: {},
  groupOpacityLevels: {},
  showRelations: true,
  showBackground: false,

  updateGraphData: () => {
    const state = get();
    const { availableReecs, availableRelations, pinnedNodes, pinnedSettings, filters } = state;
    
    if (pinnedNodes.size === 0) {
      set({ nodes: [], edges: [], visibleReecIds: new Set(), rawReecs: [], rawRelations: [] });
      return;
    }

    // 1. BFS multi-sources avec profondeurs variables
    const reachableIds = new Set();
    const nodeGroupMemberships = {};
    const nodeGroupDepths = {};
    const adjacency = {};
    availableRelations.forEach(rel => {
      if (!adjacency[rel.source_reec_id]) adjacency[rel.source_reec_id] = [];
      if (!adjacency[rel.target_reec_id]) adjacency[rel.target_reec_id] = [];
      adjacency[rel.source_reec_id].push(rel.target_reec_id);
      adjacency[rel.target_reec_id].push(rel.source_reec_id);
    });

    pinnedNodes.forEach(startNodeId => {
      const maxDepth = pinnedSettings[startNodeId]?.depth || 0;
      reachableIds.add(startNodeId);
      
      if (!nodeGroupMemberships[startNodeId]) nodeGroupMemberships[startNodeId] = new Set();
      nodeGroupMemberships[startNodeId].add(startNodeId);
      // Depth 0 for the center node itself
      if (!nodeGroupDepths[startNodeId]) nodeGroupDepths[startNodeId] = {};
      nodeGroupDepths[startNodeId][startNodeId] = 0;
      
      if (maxDepth > 0) {
        let currentLevel = [startNodeId];
        const visitedForThisSource = new Set([startNodeId]);
        
        for (let d = 1; d <= maxDepth; d++) {
          const nextLevel = [];
          currentLevel.forEach(nodeId => {
            (adjacency[nodeId] || []).forEach(neighbor => {
              if (!visitedForThisSource.has(neighbor)) {
                visitedForThisSource.add(neighbor);
                reachableIds.add(neighbor);
                nextLevel.push(neighbor);
                
                if (!nodeGroupMemberships[neighbor]) nodeGroupMemberships[neighbor] = new Set();
                nodeGroupMemberships[neighbor].add(startNodeId);
                // Store BFS depth for this node in this group
                if (!nodeGroupDepths[neighbor]) nodeGroupDepths[neighbor] = {};
                nodeGroupDepths[neighbor][startNodeId] = d;
              }
            });
          });
          currentLevel = nextLevel;
          if (currentLevel.length === 0) break;
        }
      }
    });

    // 2. Appliquer les filtres
    const nodes = availableReecs
      .filter(reec => {
        if (!reachableIds.has(reec.reec_id)) return false;
        if (reec.metadata_confiance < filters.minConfiance) return false;

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
        
        if (filters.selectedTags.size > 0) {
          if (!reec.metadata_tags || !reec.metadata_tags.some(tag => filters.selectedTags.has(tag))) {
            return false;
          }
        }

        if (filters.advancedSearch) {
          const search = filters.advancedSearch.toLowerCase();
          const inLabel = reec.label.toLowerCase().includes(search);
          const inSummary = (reec.summary_short || "").toLowerCase().includes(search);
          const inDetailed = (reec.summary_detailed || "").toLowerCase().includes(search);
          if (!inLabel && !inSummary && !inDetailed) return false;
        }
        
        return true;
      })
      .map(mapReecToNode);

    const visibleNodeIds = new Set(nodes.map(n => n.id));

    const edges = availableRelations
      .filter(rel => {
        if (!visibleNodeIds.has(rel.source_reec_id) || !visibleNodeIds.has(rel.target_reec_id)) return false;
        if (rel.confiance < filters.minConfiance) return false;
        return true;
      })
      .map(mapRelationToEdge);

    const serializedMemberships = {};
    Object.entries(nodeGroupMemberships).forEach(([nodeId, pinnedSet]) => {
      serializedMemberships[nodeId] = Array.from(pinnedSet);
    });

    set({ 
      nodes, 
      edges, 
      visibleReecIds: reachableIds,
      nodeGroupMemberships: serializedMemberships,
      nodeGroupDepths,
      rawReecs: availableReecs.filter(r => visibleNodeIds.has(r.reec_id)),
      rawRelations: availableRelations.filter(rel => visibleNodeIds.has(rel.source_reec_id) && visibleNodeIds.has(rel.target_reec_id))
    });
    get().wakeSimulation();
  },
  
  toggleFilter: (type, groupId = null) => {
    if (groupId) {
      set((state) => ({
        groupFilters: {
          ...state.groupFilters,
          [groupId]: {
            ...(state.groupFilters[groupId] || state.filters),
            [type]: !(state.groupFilters[groupId]?.[type] ?? state.filters[type])
          }
        }
      }));
    } else {
      set((state) => ({
        filters: {
          ...state.filters,
          [type]: !state.filters[type]
        }
      }));
    }
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
  
  setOpacityLevel: (type, level, groupId = null) => {
    if (groupId) {
      set((state) => ({
        groupOpacityLevels: {
          ...state.groupOpacityLevels,
          [groupId]: {
            ...(state.groupOpacityLevels[groupId] || state.opacityLevels),
            [type]: level
          }
        }
      }));
    } else {
      set((state) => ({
        opacityLevels: {
          ...state.opacityLevels,
          [type]: level
        }
      }));
    }
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
  
  toggleBackground: () => {
    set((state) => ({ showBackground: !state.showBackground }));
  },

  setAdvancedFilter: (key, value, groupId = null) => {
    if (groupId) {
      set((state) => ({
        groupFilters: {
          ...state.groupFilters,
          [groupId]: {
            ...(state.groupFilters[groupId] || state.filters),
            [key]: value
          }
        }
      }));
    } else {
      set((state) => ({
        filters: {
          ...state.filters,
          [key]: value
        }
      }));
    }
    get().updateGraphData();
  },

  resetFilters: () => {
    set({
      filters: { ...DEFAULT_FILTERS, selectedTags: new Set() },
      filterModes: { ...DEFAULT_FILTER_MODES },
      opacityLevels: { ...DEFAULT_OPACITY_LEVELS },
      individualNodeOpacity: {},
      individualEdgeOpacity: {},
      groupFilters: {},
      groupOpacityLevels: {},
      showRelations: true,
      showBackground: true
    });
    get().updateGraphData();
  },
});
