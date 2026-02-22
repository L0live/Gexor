import React from 'react';
import { 
  Eye, EyeOff, RefreshCcw, Filter, Tag, 
  Layers, Search, X 
} from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import UnifiedFilterSection from './UnifiedFilterSection';
import FloatingListPanel from './FloatingListPanel';

const SettingsPanel = ({
  nodes,
  edges,
  filters,
  opacityLevels,
  stats,
  showBackground,
  toggleBackground,
  resetAllSettings,
  showFiltersSubSection,
  setShowFiltersSubSection,
  toggleFilter,
  setOpacityLevel,
  setAdvancedFilter,
  selectNode,
  selectEdge,
  selectedNode,
  pinnedNodes,
  pinnedNodesInfo,
  allTags,
  tagSearchQuery,
  setTagSearchQuery,
  showAllTags,
  setShowAllTags
}) => {
  const onToggleList = (key) => {
    setShowFiltersSubSection(prev => ({
      ...prev,
      entityNodes: key === 'entityNodes' ? !prev.entityNodes : false,
      eventNodes: key === 'eventNodes' ? !prev.eventNodes : false,
      contextNodes: key === 'contextNodes' ? !prev.contextNodes : false,
      relationsList: key === 'relationsList' ? !prev.relationsList : false,
    }));
  };

  const closeAllLists = () => {
    setShowFiltersSubSection(prev => ({
      ...prev,
      entityNodes: false,
      eventNodes: false,
      contextNodes: false,
      relationsList: false
    }));
  };

  const activeListKey = ['entityNodes', 'eventNodes', 'contextNodes', 'relationsList'].find(key => showFiltersSubSection[key]);

  return (
    <div className="flex gap-4 items-start pointer-events-none">
      <div className="w-102 bg-slate-900/80 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden max-h-[55vh] flex flex-col transition-all duration-200 pointer-events-auto">
        <div className="p-3 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
          {/* En-tête */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="ml-3 text-xl font-bold text-white">Settings</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleBackground()}
                  className={`p-1.5 rounded-2xl transition-all ${
                    showBackground 
                      ? 'bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 hover:text-white' 
                      : 'bg-slate-600/30 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200'
                  }`}
                  title={showBackground ? "Masquer le fond" : "Afficher le fond"}
                >
                  {showBackground ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => resetAllSettings()}
                  className="p-1.5 bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-2xl transition-colors"
                  title="Réinitialiser"
                >
                  <RefreshCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filtres avec statistiques intégrés dans UnifiedFilterSection */}
          <div className="pt-1">
            <UnifiedFilterSection
              nodes={nodes}
              edges={edges}
              filters={filters}
              opacityLevels={opacityLevels}
              stats={stats}
              showFiltersSubSection={showFiltersSubSection}
              onToggleList={onToggleList}
              toggleFilter={toggleFilter}
              setOpacityLevel={setOpacityLevel}
              selectNode={selectNode}
              selectEdge={selectEdge}
              setAdvancedFilter={setAdvancedFilter}
              title="Filtres"
              headerStats={[
                { label: "Total", value: stats.total, color: "text-slate-300" },
                { label: "Visibles", value: stats.visible, color: "text-white" }
              ]}
            />
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-3 h-3" /> Filtrer par Tags
            </label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                type="text"
                value={tagSearchQuery}
                onChange={(e) => setTagSearchQuery(e.target.value)}
                placeholder="Rechercher un tag..."
                className="w-full pl-7 pr-7 py-1.5 bg-slate-900/50 border border-slate-700 rounded text-[10px] text-slate-200 focus:outline-none focus:border-blue-500"
              />
              {tagSearchQuery && (
                <button 
                  onClick={() => setTagSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {(tagSearchQuery 
                ? (allTags || []).filter(t => t.toLowerCase().includes(tagSearchQuery.toLowerCase())) 
                : (showAllTags ? (allTags || []) : (allTags || []).slice(0, 11))
              ).map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    const newTags = new Set(filters.selectedTags);
                    if (newTags.has(tag)) newTags.delete(tag);
                    else newTags.add(tag);
                    setAdvancedFilter('selectedTags', newTags);
                  }}
                  className={`px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-colors ${
                    filters.selectedTags.has(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Groupes d'Exploration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-3 h-3 text-yellow-500" /> Groupes Actifs
              </label>
              <span className="text-[10px] font-mono text-slate-500">{pinnedNodes.size}</span>
            </div>
            
            {pinnedNodes.size > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {pinnedNodesInfo.map(group => (
                  <button
                    key={group.id}
                    onClick={() => {
                      selectNode(group.id);
                      const { triggerCenterOnNode } = useGraphStore.getState();
                      triggerCenterOnNode(group.id);
                    }}
                    className={`group relative flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border ${
                      selectedNode?.id === group.id
                        ? 'bg-yellow-500/20 border-yellow-500/30 hover:border-yellow-500 text-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.2)]'
                        : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate max-w-[120px]">{group.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-slate-600 italic py-2 px-3 bg-slate-800/20 rounded-lg border border-dashed border-slate-700/50">
                Aucun groupe actif. Épinglez un nœud.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating List Panel */}
      {activeListKey && (
        <FloatingListPanel
          nodes={nodes}
          edges={edges}
          activeKey={activeListKey}
          onClose={closeAllLists}
          selectNode={selectNode}
          selectEdge={selectEdge}
        />
      )}
    </div>
  );
};

export default SettingsPanel;
