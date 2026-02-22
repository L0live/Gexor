import React, { useMemo, useState } from 'react';
import { Pin, Layers, X, ChevronRight, ChevronLeft, User, Calendar, Link as LinkIcon, Filter, Target, Circle, Magnet } from 'lucide-react';
import UnifiedFilterSection from './UnifiedFilterSection';
import FloatingListPanel from './FloatingListPanel';
import useGraphStore from '../../store/useGraphStore';
import { MAX_DEPTH } from '../../constants/graphConstants';

const GroupInfoPanel = ({
  selectedNode,
  selectedEdge,
  nodeGroupMemberships,
  pinnedNodes,
  pinnedSettings,
  availableReecs,
  nodes,
  edges,
  filters,
  opacityLevels,
  setGroupDepth,
  toggleNodePin,
  selectNode,
  selectEdge,
  toggleFilter,
  setOpacityLevel,
  setAdvancedFilter,
  clearSelection,
  selectedGroupId, // Use the one from store
  clearSelectedGroup, // New one
  setGroupRenderMode,
  setRadialStrength,
  setRadialSpacingMode,
  setRadialSpacing,
}) => {
  const [showFiltersSubSection, setShowFiltersSubSection] = useState({
    entityNodes: false,
    eventNodes: false,
    contextNodes: false,
    relationsList: false,
  });

  // Remove the internal selectedGroupId calculation
  const groupInfo = useMemo(() => {
    if (!selectedGroupId) return null;
    const reec = availableReecs.find(r => r.reec_id === selectedGroupId);
    const settings = pinnedSettings[selectedGroupId] || {};
    return {
      id: selectedGroupId,
      label: reec ? reec.label : selectedGroupId,
      type: reec ? reec.type : 'Entity',
      summary: reec ? (reec.summary_short || reec.summary) : '',
      depth: settings.depth || 0,
      renderMode: settings.renderMode || 'force',
      radialStrength: settings.radialStrength ?? 0,
      radialSpacingMode: settings.radialSpacingMode || 'proportional',
      radialSpacing: settings.radialSpacing ?? 50,
    };
  }, [selectedGroupId, availableReecs, pinnedSettings]);

  // Filter nodes and edges belonging to this group
  const groupNodes = useMemo(() => {
    if (!selectedGroupId) return [];
    return nodes.filter(n => (nodeGroupMemberships[n.id] || []).includes(selectedGroupId));
  }, [nodes, selectedGroupId, nodeGroupMemberships]);

  const groupEdges = useMemo(() => {
    if (!selectedGroupId) return [];
    return edges.filter(e => {
      const sourceGroups = nodeGroupMemberships[e.source] || [];
      const targetGroups = nodeGroupMemberships[e.target] || [];
      return sourceGroups.includes(selectedGroupId) && targetGroups.includes(selectedGroupId);
    });
  }, [edges, selectedGroupId, nodeGroupMemberships]);

  const stats = useMemo(() => {
    return {
      entities: groupNodes.filter(n => n.type === 'Entity').length,
      events: groupNodes.filter(n => n.type === 'Event').length,
      contexts: groupNodes.filter(n => n.type === 'Context').length,
      relations: groupEdges.length
    };
  }, [groupNodes, groupEdges]);

  // Fetch group-specific filters if we have a selectedGroupId
  const groupFilters = useGraphStore(state => selectedGroupId ? (state.groupFilters[selectedGroupId] || state.filters) : state.filters);
  const groupOpacityLevels = useGraphStore(state => selectedGroupId ? (state.groupOpacityLevels[selectedGroupId] || state.opacityLevels) : state.opacityLevels);

  if (!groupInfo) return null;

  const onToggleList = (key) => {
    setShowFiltersSubSection(prev => ({
      entityNodes: key === 'entityNodes' ? !prev.entityNodes : false,
      eventNodes: key === 'eventNodes' ? !prev.eventNodes : false,
      contextNodes: key === 'contextNodes' ? !prev.contextNodes : false,
      relationsList: key === 'relationsList' ? !prev.relationsList : false,
    }));
  };

  const closeAllLists = () => {
    setShowFiltersSubSection({
      entityNodes: false,
      eventNodes: false,
      contextNodes: false,
      relationsList: false
    });
  };

  const activeListKey = ['entityNodes', 'eventNodes', 'contextNodes', 'relationsList'].find(key => showFiltersSubSection[key]);

  return (
    <div className="absolute bottom-4 left-4 z-50 flex items-end gap-3 pointer-events-none">
      <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden flex flex-col w-102 pointer-events-auto animate-in slide-in-from-bottom-4 duration-300">
        {/* Header - Central Node Info Style */}
        <div className="p-3.5 bg-gradient-to-br from-yellow-400/80 to-yellow-500/10 border-b border-slate-700/30">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <h3 className="text-[14px] font-bold text-slate-200 tracking-widest px-1.5 py-1 w-fit">
                GROUPE
              </h3>
              <h2 className="text-2xl font-black text-white truncate max-w-[280px]" title={groupInfo.summary}>
                {groupInfo.label}
              </h2>
              <h3 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-2.5 pt-1.5 w-fit">
                {groupInfo.type}
              </h3>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button 
                onClick={() => clearSelectedGroup()}
                className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2.5 p-1">
                  <button 
                      onClick={() => setGroupDepth(groupInfo.id, Math.max(1, groupInfo.depth - 1))}
                      className="w-8 h-8 pt-1 flex items-start justify-center hover:bg-white/10 bg-transparent/30 rounded-lg text-slate-300 hover:text-white transition-all shadow-xl"
                  >
                      <span className="text-xl font-bold leading-none">-</span>
                  </button>
                  <div className="w-6 text-center">
                      <span className="font-mono text-base text-yellow-400 font-black">{groupInfo.depth}</span>
                  </div>
                  <button 
                      onClick={() => setGroupDepth(groupInfo.id, Math.min(MAX_DEPTH, groupInfo.depth + 1))}
                      className="w-8 h-8 pt-1 flex items-start justify-center hover:bg-white/10 bg-transparent/30 rounded-lg text-slate-300 hover:text-white transition-all shadow-xl"
                  >
                      <span className="text-xl font-bold leading-none">+</span>
                  </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Radial Layout Controls */}
          <div className="space-y-2">
            {/* Render Mode Toggle */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-[11px] text-slate-300 font-bold uppercase tracking-wider px-2">
                <Target className="w-4 h-4 text-purple-400" />
                <span>Mode Rendu</span>
              </div>
              <div className="flex items-center gap-1 p-1">
                <button
                  onClick={() => setGroupRenderMode(groupInfo.id, 'force')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${
                    groupInfo.renderMode === 'force'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                      : 'bg-slate-800/30 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-300'
                  }`}
                >
                  Force
                </button>
                <button
                  onClick={() => setGroupRenderMode(groupInfo.id, 'radial')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${
                    groupInfo.renderMode === 'radial'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                      : 'bg-slate-800/30 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-300'
                  }`}
                >
                  Radial
                </button>
              </div>
            </div>

            {/* Radial-specific controls (only shown when radial mode active) */}
            {groupInfo.renderMode === 'radial' && (
              <div className="pl-2 space-y-2 border-l-2 border-purple-500/30 ml-2">
                {/* Radial Strength Slider */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider min-w-[70px]">
                    <Magnet className="w-3 h-3 text-purple-400" />
                    <span>Force</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={groupInfo.radialStrength}
                    onChange={(e) => setRadialStrength(groupInfo.id, parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <span className="text-[10px] font-mono text-purple-400 w-8 text-right">{Math.round(groupInfo.radialStrength * 100)}%</span>
                </div>

                {/* Spacing Mode Toggle */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider min-w-[70px]">
                    <Circle className="w-3 h-3 text-purple-400" />
                    <span>Espace</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setRadialSpacingMode(groupInfo.id, 'proportional')}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all border ${
                        groupInfo.radialSpacingMode === 'proportional'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-slate-800/30 text-slate-500 border-slate-700/40 hover:text-slate-400'
                      }`}
                    >
                      Prop.
                    </button>
                    <button
                      onClick={() => setRadialSpacingMode(groupInfo.id, 'fixed')}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all border ${
                        groupInfo.radialSpacingMode === 'fixed'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-slate-800/30 text-slate-500 border-slate-700/40 hover:text-slate-400'
                      }`}
                    >
                      Fixe
                    </button>
                  </div>
                </div>

                {/* Spacing Value Slider */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider min-w-[70px]">
                    <Layers className="w-3 h-3 text-purple-400" />
                    <span>Rayon</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    step="1"
                    value={groupInfo.radialSpacing}
                    onChange={(e) => setRadialSpacing(groupInfo.id, parseFloat(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <span className="text-[10px] font-mono text-purple-400 w-8 text-right">{groupInfo.radialSpacing}</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <div className="flex-1 max-h-[350px] overflow-y-auto custom-scrollbar px-1">
              <UnifiedFilterSection
                nodes={groupNodes}
                edges={groupEdges}
                filters={groupFilters}
                opacityLevels={groupOpacityLevels}
                stats={stats}
                showFiltersSubSection={showFiltersSubSection}
                onToggleList={onToggleList}
                toggleFilter={(type) => toggleFilter(type, selectedGroupId)}
                setOpacityLevel={(type, level) => setOpacityLevel(type, level, selectedGroupId)}
                selectNode={selectNode}
                selectEdge={selectEdge}
                setAdvancedFilter={(key, val) => setAdvancedFilter(key, val, selectedGroupId)}
                title="Filtres du Groupe"
                headerStats={[
                  { label: "Nodes", value: groupNodes.length },
                  { label: "Rel", value: groupEdges.length }
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Floating List Panel for the Group */}
      {activeListKey && (
        <FloatingListPanel
          nodes={groupNodes}
          edges={groupEdges}
          activeKey={activeListKey}
          onClose={closeAllLists}
          selectNode={selectNode}
          selectEdge={selectEdge}
        />
      )}
    </div>
  );
};

export default GroupInfoPanel;
