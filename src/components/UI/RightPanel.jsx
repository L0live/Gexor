import React, { Suspense, useMemo, useEffect } from 'react';
import {
  X, Focus, Pin, Trash2, Layers, Plus, ChevronRight, Loader,
  Info, Users, Globe, Calendar, MapPin, Network, Star
} from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { getPlugin, getTabsForMode } from '../../plugins/pluginRegistry';
import {
  getCategoryColorAlpha,
  AGGREGATE_NODE_COLOR,
} from '../../constants/graphConstants';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';

const ICON_MAP = {
  Info, Users, Globe, Calendar, MapPin, Layers, Network, Star,
};

// ── RightPanel Header ────────────────────────────────────────────────────
const RightPanelHeader = ({ mode, selectedNode, selectedEdge }) => {
  const closeRightPanel = useGraphStore(s => s.closeRightPanel);
  const toggleNodePin = useGraphStore(s => s.toggleNodePin);
  const isPinned = useGraphStore(s => s.isPinned);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);
  const selectNode = useGraphStore(s => s.selectNode);

  const handleFocus = (id) => {
    const { triggerCenterOnNode } = useGraphStore.getState();
    triggerCenterOnNode(id);
  };

  const handleRemove = (id) => {
    const { removeNodeFromGraph } = useGraphStore.getState();
    removeNodeFromGraph(id);
  };

  const handleTypeClick = () => {
    if (!selectedNode) return;
    const typeQid = selectedNode.types?.[0];
    if (typeQid) {
      selectNode(typeQid.startsWith('http') ? typeQid : `http://www.wikidata.org/entity/${typeQid}`);
    }
  };

  const handleTypeRightClick = (e) => {
    e.preventDefault();
    if (!selectedNode) return;
    const typeQid = selectedNode.types?.[0];
    const qid = typeQid?.startsWith('http') ? typeQid.split('/').pop() : typeQid;
    if (qid) {
      const { addFilter } = useGraphStore.getState();
      addFilter(createFilter(FILTER_TYPES.TYPE, qid, selectedNode.typeLabels?.[0]));
    }
  };

  const handleLabelClick = () => {
    if (!selectedNode) return;
    const { openSearchModal } = useGraphStore.getState();
    openSearchModal([createFilter(FILTER_TYPES.ENTITY, selectedNode.id, selectedNode.label)]);
  };

  const bgStyle = useMemo(() => {
    if (mode === 'aggregate') {
      return { background: `linear-gradient(to bottom right, ${AGGREGATE_NODE_COLOR}44, ${AGGREGATE_NODE_COLOR}11)` };
    }
    if (mode === 'node' && selectedNode) {
      return { background: `linear-gradient(to bottom right, ${getCategoryColorAlpha(selectedNode.type, 0.5)}, ${getCategoryColorAlpha(selectedNode.type, 0.1)})` };
    }
    return { background: 'linear-gradient(to bottom right, rgba(51,65,85,0.3), rgba(51,65,85,0.1))' };
  }, [mode, selectedNode]);

  return (
    <div className="flex-shrink-0 flex flex-col" style={{ ...bgStyle }}>
      <div className="flex items-start justify-between p-4">
        {/* Mode badge */}
        <div>
          {mode === 'node' && selectedNode && (
            <button
              onClick={handleTypeClick}
              onContextMenu={handleTypeRightClick}
              className="text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-200 transition-colors"
            >
              {selectedNode.type}
            </button>
          )}
          {mode === 'aggregate' && (
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              <span className="text-[11px] font-bold text-violet-400 uppercase tracking-widest">Agrégat</span>
            </div>
          )}
          {mode === 'edge' && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-800/80 rounded-full border border-slate-700/30">
              Relation
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {mode === 'node' && selectedNode && !selectedNode.isPreview && (
            <>
              <button onClick={() => handleFocus(selectedNode.id)} className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-blue-400" title="Centrer">
                <Focus className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleNodePin(selectedNode.id)}
                className={`p-1.5 rounded-xl transition-colors ${isPinned(selectedNode.id) ? 'bg-yellow-600/20 text-yellow-400' : 'hover:bg-white/10 text-slate-400'}`}
                title={isPinned(selectedNode.id) ? 'Dépingler' : 'Épingler'}
              >
                <Pin className="w-4 h-4" />
              </button>
              <button onClick={() => handleRemove(selectedNode.id)} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-500" title="Retirer">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          {mode === 'node' && selectedNode?.isPreview && (
            <button
              onClick={() => addNodeToGraph(selectedNode.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-xl border border-green-500/30 text-sm font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter
            </button>
          )}
          {mode === 'aggregate' && selectedNode && (
            <button onClick={() => handleFocus(selectedNode.id)} className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-violet-400" title="Centrer">
              <Focus className="w-4 h-4" />
            </button>
          )}
          <div className="w-px h-5 bg-slate-700/50" />
          <button
            onClick={closeRightPanel}
            className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Label */}
      <div className="px-4 pb-3 flex-1 flex flex-col justify-end overflow-hidden">
        {mode === 'node' && selectedNode && (
          <>
            <h2
              onClick={handleLabelClick}
              className="text-2xl font-black text-white leading-tight cursor-pointer hover:text-blue-300 transition-colors line-clamp-2"
            >
              {selectedNode.label}
            </h2>
            {selectedNode.description && (
              <p className="text-slate-400 text-xs italic mt-1 line-clamp-2">{selectedNode.description}</p>
            )}
          </>
        )}
        {mode === 'aggregate' && selectedNode && (
          <>
            <h2 className="text-2xl font-black text-white leading-tight line-clamp-2">
              {selectedNode.aggregateCount} × {selectedNode.predicateLabel || selectedNode.label}
            </h2>
            {selectedNode.targetClassLabels?.length > 0 && selectedNode.targetClassLabels[0] !== 'unknown' && (
              <p className="text-sm text-violet-300 mt-1">
                {selectedNode.targetClassLabels.slice(0, 3).join(', ')}
              </p>
            )}
          </>
        )}
        {mode === 'edge' && selectedEdge && (
          <h2 className="text-2xl font-black text-white leading-tight line-clamp-2">
            {selectedEdge.label || selectedEdge.type || 'Connexion'}
          </h2>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Main RightPanel component
// ══════════════════════════════════════════════════════════════════════════
const RightPanel = () => {
  const rightPanelOpen = useGraphStore(s => s.rightPanelOpen);
  const rightPanelActiveTab = useGraphStore(s => s.rightPanelActiveTab);
  const setRightPanelTab = useGraphStore(s => s.setRightPanelTab);
  const selectedNode = useGraphStore(s => s.selectedNode);
  const selectedEdge = useGraphStore(s => s.selectedEdge);

  const mode = selectedNode?.isAggregate
    ? 'aggregate'
    : selectedNode
      ? 'node'
      : selectedEdge
        ? 'edge'
        : null;

  const availableTabs = mode ? getTabsForMode(mode) : [];

  // Resolve active tab — fall back to first available if current tab doesn't exist in this mode
  const resolvedTab = availableTabs.find(t => t.id === rightPanelActiveTab)
    ? rightPanelActiveTab
    : availableTabs[0]?.id ?? null;

  // Persist fallback to store so re-renders and mode switches stay coherent
  useEffect(() => {
    if (resolvedTab && resolvedTab !== rightPanelActiveTab) {
      setRightPanelTab(resolvedTab);
    }
  }, [resolvedTab, rightPanelActiveTab, setRightPanelTab]);

  if (!rightPanelOpen || !mode) return null;

  const activePlugin = resolvedTab ? getPlugin(resolvedTab) : null;
  const LazyTabComponent = activePlugin?.tab?.component
    ? React.lazy(activePlugin.tab.component)
    : null;

  return (
    <div className="fixed right-0 top-0 h-screen w-[500px] z-40 bg-slate-900/95 backdrop-blur-sm flex flex-col shadow-2xl">

      {/* Header */}
      <RightPanelHeader mode={mode} selectedNode={selectedNode} selectedEdge={selectedEdge} />

      {/* Basics/Plugins */}
      <div className="flex flex-col min-h-0 overflow-hidden">
        {/* Tab bar */}
        {availableTabs.length > 0 && (
          <div className="flex border-b border-slate-700/30 shrink-0 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {availableTabs.map(tab => {
              const Icon = tab.icon ? (ICON_MAP[tab.icon] || null) : null;
              const isActive = resolvedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightPanelTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-bold whitespace-nowrap border-b-2 transition-all shrink-0 ${
                    isActive
                      ? 'border-blue-500 text-blue-300 bg-blue-500/5'
                      : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                  }`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {LazyTabComponent ? (
            <Suspense fallback={
              <div className="flex items-center gap-2 p-6 text-slate-500 text-sm">
                <Loader className="w-4 h-4 animate-spin text-blue-400" />
                <span>Chargement…</span>
              </div>
            }>
              <LazyTabComponent />
            </Suspense>
          ) : (
            <div className="p-6 text-slate-600 text-sm text-center">Aucun contenu disponible.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RightPanel;
