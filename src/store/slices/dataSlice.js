/**
 * dataSlice — Raw data loading, available REECs & relations, tags
 */
export const createDataSlice = (set, get) => ({
  availableReecs: [],
  availableRelations: [],
  allTags: [],

  loadData: (jsonData) => {
    // Dédupliquer les REECs par ID
    const uniqueReecsMap = new Map();
    (jsonData.reecs || []).forEach(reec => {
      if (reec.reec_id && !uniqueReecsMap.has(reec.reec_id)) {
        uniqueReecsMap.set(reec.reec_id, reec);
      }
    });
    const uniqueReecs = Array.from(uniqueReecsMap.values());

    // Calculer le nombre de connexions pour chaque REEC
    const connectionCounts = {};
    (jsonData.relations || []).forEach(rel => {
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
    
    // Pinner le REEC central par défaut avec profondeur 1
    const initialPinnedNodes = new Set();
    const initialPinnedSettings = {};
    if (mostConnectedReecId) {
      initialPinnedNodes.add(mostConnectedReecId);
      initialPinnedSettings[mostConnectedReecId] = { depth: 1 };
    }
    
    // Extraire tous les tags uniques et la plage de dates
    const allTags = new Set();
    let minDate = null;
    let maxDate = null;

    uniqueReecs.forEach(reec => {
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

    set((state) => ({
      availableReecs: uniqueReecs,
      availableRelations: jsonData.relations,
      allTags: Array.from(allTags).sort(),
      filters: {
        ...state.filters,
        dateRange: [minDate, maxDate]
      },
      pinnedNodes: initialPinnedNodes,
      pinnedSettings: initialPinnedSettings,
      centralNodeId: mostConnectedReecId,
      positions: {}
    }));
    
    get().updateGraphData();

    if (mostConnectedReecId) {
      get().selectNode(mostConnectedReecId);
    }
    
    setTimeout(() => get().saveToHistory(), 100);
  },
});
