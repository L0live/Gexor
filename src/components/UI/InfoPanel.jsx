import React, { useState } from 'react';
import {
  X, Focus, Pin, Trash2, Layers, Plus, Loader, ChevronRight,
  Maximize2, Minimize2, Bubbles
} from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import {
  getCategoryColorAlpha,
  AGGREGATE_NODE_COLOR,
} from '../../constants/graphConstants';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';
import ExplorationBar from './ExplorationBar';
import TagsFormat from './TagsFormat';
import BasicsPluginsBar from './BasicsPluginsBar';

// ── Aggregate entity list (preview) ──────────────────────────────────────
const AggregateEntityList = ({ aggregateId, selectNode, addNodeToGraph }) => {
  const loadedAggregates = useGraphStore(s => s.loadedAggregates);
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const expandAggregateForList = useGraphStore(s => s.expandAggregateForList);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const aggNode = loadedAggregates[aggregateId];
  if (!aggNode) return null;

  const children = aggNode.children || [];

  const handleFetch = async () => {
    if (children.length > 0) { setOpen(p => !p); return; }
    setLoading(true);
    try { await expandAggregateForList(aggregateId); setOpen(true); }
    catch (e) { console.warn('[AggregateEntityList]', e); }
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <button onClick={handleFetch} className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-slate-200 transition-colors">
        {loading
          ? <Loader className="w-3 h-3 animate-spin text-violet-400" />
          : <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        }
        <span className="font-bold">{aggNode.count} entités</span>
      </button>

      {open && children.length > 0 && (
        <div className="max-h-[160px] overflow-y-auto space-y-0.5 pl-2 border-l-2 border-violet-500/20 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {children.map(childUri => {
            const child = loadedNodes[childUri];
            if (!child) return null;
            return (
              <div key={childUri} className="flex items-center justify-between gap-1 py-1 px-1.5 rounded hover:bg-slate-800/40 group">
                <button onClick={() => selectNode(childUri)} className="flex-1 text-left text-[10px] font-bold text-slate-400 truncate group-hover:text-white">
                  {child.label}
                </button>
                {addNodeToGraph && (
                  <button
                    onClick={(e) => { e.stopPropagation(); addNodeToGraph(childUri); }}
                    className="shrink-0 p-0.5 text-slate-600 hover:text-violet-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── InfoPanel header for Node mode ────────────────────────────────────────
const NodeHeader = ({ selectedNode, clearSelectedNode, toggleRightPanel }) => {
  const toggleNodePin = useGraphStore(s => s.toggleNodePin);
  const isPinned = useGraphStore(s => s.isPinned);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);

  const handleFocus = () => {
    const { triggerCenterOnNode } = useGraphStore.getState();
    triggerCenterOnNode(selectedNode.id);
  };

  const handleRemove = () => {
    const { removeNodeFromGraph } = useGraphStore.getState();
    removeNodeFromGraph(selectedNode.id);
  };

  const handleTypeClick = (e) => {
    e.stopPropagation();
    const typeQid = selectedNode.types?.[0];
    if (typeQid) {
      const { selectNode } = useGraphStore.getState();
      selectNode(typeQid.startsWith('http') ? typeQid : `http://www.wikidata.org/entity/${typeQid}`);
    }
  };

  const handleTypeRightClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const typeQid = selectedNode.types?.[0];
    const qid = typeQid?.startsWith('http') ? typeQid.split('/').pop() : typeQid;
    if (qid) {
      const { addFilter } = useGraphStore.getState();
      addFilter(createFilter(FILTER_TYPES.TYPE, qid, selectedNode.typeLabels?.[0]));
    }
  };

  const handleLabelClick = () => {
    const { openSearchModal } = useGraphStore.getState();
    openSearchModal([createFilter(FILTER_TYPES.ENTITY, selectedNode.id, selectedNode.label)]);
  };

  return (
    <div
      className="p-4 border-b border-slate-700/30 flex-shrink-0"
      style={{ background: `linear-gradient(to bottom right, ${getCategoryColorAlpha(selectedNode.type, 0.45)}, ${getCategoryColorAlpha(selectedNode.type, 0.1)})` }}
    >
      {/* Row 1: type badge + actions */}
      <div className="flex items-start justify-between mb-2">
        <button
          onClick={handleTypeClick}
          onContextMenu={handleTypeRightClick}
          className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 hover:text-slate-200 hover:underline decoration-slate-500/40 transition-colors"
          title="Gauche: naviguer vers le type · Droit: filtre type"
        >
          {selectedNode.type}
        </button>
        <div className="flex items-center gap-1.5">
          {selectedNode.isPreview ? (
            <button
              onClick={() => addNodeToGraph(selectedNode.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-xl border border-green-500/30 text-sm font-bold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter
            </button>
          ) : (
            <>
              <button onClick={handleFocus} className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-blue-400" title="Centrer">
                <Focus className="w-4 h-4" />
              </button>
              <button
                onClick={() => toggleNodePin(selectedNode.id)}
                className={`p-1.5 rounded-xl transition-colors ${isPinned(selectedNode.id) ? 'bg-yellow-600/20 text-yellow-400' : 'hover:bg-white/10 text-slate-400'}`}
                title={isPinned(selectedNode.id) ? 'Dépingler' : 'Épingler'}
              >
                <Pin className="w-4 h-4" />
              </button>
              <button onClick={handleRemove} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-500" title="Retirer du graphe">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <div className="w-px h-5 bg-slate-700/50" />
          <button
            onClick={toggleRightPanel}
            className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400"
            title="Développer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={clearSelectedNode} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Row 2: label */}
      <h2
        onClick={handleLabelClick}
        className="text-xl font-black text-white leading-tight cursor-pointer hover:text-blue-300 transition-colors"
        title="Rechercher les connexions"
      >
        {selectedNode.label}
      </h2>
    </div>
  );
};

// ── InfoPanel header for Aggregate mode ──────────────────────────────────
const AggregateHeader = ({ selectedNode, clearSelectedNode, toggleRightPanel }) => {
  const handleFocus = () => {
    const { triggerCenterOnNode } = useGraphStore.getState();
    triggerCenterOnNode(selectedNode.id);
  };

  return (
    <div
      className="p-4 border-b border-slate-700/30 flex-shrink-0"
      style={{ background: `linear-gradient(to bottom right, ${AGGREGATE_NODE_COLOR}44, ${AGGREGATE_NODE_COLOR}11)` }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-violet-400" />
          <span className="text-[11px] font-bold text-violet-400 uppercase tracking-widest">Agrégat</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleFocus} className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-violet-400" title="Centrer">
            <Focus className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-slate-700/50" />
          <button onClick={toggleRightPanel} className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400" title="Développer">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={clearSelectedNode} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <h2 className="text-xl font-black text-white leading-tight">
        {selectedNode.aggregateCount} × {selectedNode.predicateLabel || selectedNode.label}
      </h2>
      {selectedNode.targetClassLabels?.length > 0 && selectedNode.targetClassLabels[0] !== 'unknown' && (
        <p className="text-sm text-slate-400 mt-1">
          Types : <span className="text-violet-300 font-medium">
            {selectedNode.targetClassLabels.slice(0, 3).join(', ')}{selectedNode.targetClassLabels.length > 3 ? '…' : ''}
          </span>
        </p>
      )}
    </div>
  );
};

// ── InfoPanel header for Edge mode ────────────────────────────────────────
const EdgeHeader = ({ selectedEdge, nodes, clearSelectedNode, toggleRightPanel }) => {
  const selectNode = useGraphStore(s => s.selectNode);

  const sourceNode = nodes.find(n => n.id === selectedEdge.source);
  const targetNode = nodes.find(n => n.id === selectedEdge.target);

  return (
    <div className="p-4 bg-gradient-to-br from-slate-700/30 to-slate-600/10 border-b border-slate-700/30 flex-shrink-0">
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 py-0.5 bg-slate-800/80 rounded-full border border-slate-700/30">
          Relation
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={toggleRightPanel} className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-slate-400" title="Développer">
            <Minimize2 className="w-4 h-4" />
          </button>
          <button onClick={clearSelectedNode} className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <h2 className="text-xl font-black text-white mb-2">
        {selectedEdge.label || selectedEdge.type || 'Connexion'}
      </h2>
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => selectNode(selectedEdge.source)}
          className="font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded hover:bg-blue-400/20 transition-colors"
        >
          {sourceNode?.label || selectedEdge.source}
        </button>
        <ChevronRight className="w-4 h-4 text-slate-600" />
        <button
          onClick={() => selectNode(selectedEdge.target)}
          className="font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded hover:bg-purple-400/20 transition-colors"
        >
          {targetNode?.label || selectedEdge.target}
        </button>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Main InfoPanel component
// ══════════════════════════════════════════════════════════════════════════
const InfoPanel = ({ nodes }) => {
  const selectedNode = useGraphStore(s => s.selectedNode);
  const selectedEdge = useGraphStore(s => s.selectedEdge);
  const clearSelectedNode = useGraphStore(s => s.clearSelectedNode);
  const rightPanelOpen = useGraphStore(s => s.rightPanelOpen);
  const toggleRightPanel = useGraphStore(s => s.toggleRightPanel);
  const expandAggregate = useGraphStore(s => s.expandAggregate);
  const collapseAggregate = useGraphStore(s => s.collapseAggregate);
  const loadedAggregates = useGraphStore(s => s.loadedAggregates);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);
  const selectNode = useGraphStore(s => s.selectNode);
  const loadingSelectedNodeProperties = useGraphStore(s => s.loadingSelectedNodeProperties);

  // Nothing selected — render nothing
  if (!selectedNode && !selectedEdge) return null;

  // RightPanel is open — show only the toggle button
  if (rightPanelOpen) {
    return (
      <div className="absolute bottom-4 right-4 z-30">
        <button
          onClick={toggleRightPanel}
          className="p-2 bg-slate-800/80 backdrop-blur-sm border border-slate-700/40 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 transition-all shadow-lg"
          title="Réduire le panneau"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Determine mode ────────────────────────────────────────────────────
  const isAggregate = selectedNode?.isAggregate;
  const isEdge = !selectedNode && !!selectedEdge;
  const mode = isAggregate ? 'aggregate' : isEdge ? 'edge' : 'node';

  return (
    <div className="absolute bottom-4 right-4 w-[500px] max-h-[800px] bg-slate-900/85 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col z-30 transition-all duration-200 pointer-events-auto">
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent flex flex-col">

        {/* ─── Mode Node ──────────────────────────────────────────────────── */}
        {mode === 'node' && selectedNode && (
          <>
            <NodeHeader
              selectedNode={selectedNode}
              clearSelectedNode={clearSelectedNode}
              toggleRightPanel={toggleRightPanel}
            />

            {/* Description */}
            {selectedNode.description && (
              <p className="px-5 pt-4 pb-0 text-slate-400 text-sm italic leading-relaxed">
                {selectedNode.description}
              </p>
            )}

            {loadingSelectedNodeProperties && (
              <div className="flex items-center gap-2 text-slate-500 text-sm px-5 py-3">
                <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
                Chargement des propriétés…
              </div>
            )}

            {/* ExplorationBar — uniquement si le nœud n'est pas en preview */}
            {!selectedNode.isPreview && (
              <ExplorationBar nodeUri={selectedNode.id} />
            )}

            {/* TagsFormat */}
            <TagsFormat
              nodeUri={selectedNode.id}
              mode="node"
            />

            <div className="flex-1" />

            {/* BasicsPluginsBar */}
            <BasicsPluginsBar mode="node" />
          </>
        )}

        {/* ─── Mode Aggregate ─────────────────────────────────────────────── */}
        {mode === 'aggregate' && selectedNode && (
          <>
            <AggregateHeader
              selectedNode={selectedNode}
              clearSelectedNode={clearSelectedNode}
              toggleRightPanel={toggleRightPanel}
            />

            <div className="p-5 space-y-4 flex-1">
              {/* Description phrase */}
              <p className="text-slate-400 text-sm leading-relaxed">
                {selectedNode.aggregateCount} entités reliées par la propriété{' '}
                <span className="font-bold text-violet-300">{selectedNode.predicateLabel}</span>
                {selectedNode.targetClassLabels?.length > 0 && selectedNode.targetClassLabels[0] !== 'unknown' && (
                  <> parmi les types{' '}
                    <span className="font-bold text-violet-300">
                      {selectedNode.targetClassLabels.slice(0, 3).join(', ')}{selectedNode.targetClassLabels.length > 3 ? '…' : ''}
                    </span>
                  </>
                )}.
              </p>

              {/* Split / Étendre buttons */}
              {selectedNode.isPreview ? null : selectedNode.loadingChildren ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Loader className="w-4 h-4 animate-spin text-violet-400" />
                  Chargement des entités…
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (expandAggregate) expandAggregate(selectedNode.aggregateId); clearSelectedNode(); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/40 transition-all text-[12px] font-bold group"
                  >
                    <Bubbles className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    Split ({selectedNode.aggregateCount})
                  </button>
                  <button
                    disabled
                    title="Prochainement"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-700/30 bg-slate-800/30 text-slate-600 text-[12px] font-bold cursor-not-allowed"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Étendre
                  </button>
                </div>
              )}

              {/* Entity list preview */}
              <AggregateEntityList
                aggregateId={selectedNode.aggregateId}
                selectNode={selectNode}
                addNodeToGraph={addNodeToGraph}
              />
            </div>

            {/* TagsFormat */}
            <TagsFormat aggregateId={selectedNode.aggregateId} mode="aggregate" />

            {/* BasicsPluginsBar */}
            <BasicsPluginsBar mode="aggregate" />
          </>
        )}

        {/* ─── Mode Edge (Relation) ────────────────────────────────────────── */}
        {mode === 'edge' && selectedEdge && (
          <>
            <EdgeHeader
              selectedEdge={selectedEdge}
              nodes={nodes || []}
              clearSelectedNode={clearSelectedNode}
              toggleRightPanel={toggleRightPanel}
            />

            <div className="p-5 space-y-4 flex-1">
              {selectedEdge.description && (
                <div>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Description</h3>
                  <p className="text-slate-300 text-sm leading-relaxed">{selectedEdge.description}</p>
                </div>
              )}
            </div>

            {/* TagsFormat */}
            <TagsFormat edgeData={selectedEdge} mode="edge" />

            {/* BasicsPluginsBar */}
            <BasicsPluginsBar mode="edge" />
          </>
        )}

      </div>
    </div>
  );
};

export default InfoPanel;
