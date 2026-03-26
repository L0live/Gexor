import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { X, Focus, Pin, ChevronRight, ChevronLeft, ChevronDown, Link2, Eye, Layers, Maximize2, Minimize2, Loader, Settings, Pencil, Plus, Minus, Target, Circle, Magnet, ArrowRightCircle, ArrowLeftCircle, ArrowLeftRight, Info, Trash2, RefreshCcw, Network } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { getCategoryColor, getCategoryColorAlpha, AGGREGATE_NODE_COLOR, EXPLORATION_DIRECTIONS } from '../../constants/graphConstants';
import { isNoisePid, getRedundancyGroupForPid, getFilteredDatatypes } from '../../services/propertyClassification';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';
import ClickableProperty from './ClickableProperty';


// ── Clickable entity value ────────────────────────────────────────────────
// pid prop for HAS_VALUE right-click
// Ctrl+Click → ouvre SearchModal en mode exploration pour cette entité
const EntityLink = ({ uri, label, selectNode, visibleNodeIds, addNodeToGraph, pid }) => {
  const isInGraph = visibleNodeIds?.has(uri);
  const addFilterStore = useGraphStore(s => s.addFilter);
  const openSearchModal = useGraphStore(s => s.openSearchModal);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const qid = uri.startsWith('http') ? uri.split('/').pop() : uri;
    if (pid) {
      addFilterStore(createFilter(FILTER_TYPES.HAS_VALUE, `${pid}=${qid}`, `${pid} = ${label}`, 'and', { pid, qid }));
    } else {
      addFilterStore(createFilter(FILTER_TYPES.ENTITY, uri, label));
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      openSearchModal([], null, uri);
    } else {
      selectNode(uri);
    }
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`text-[11px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
          isInGraph
            ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20'
            : 'bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700/70 hover:text-slate-200'
        }`}
        title={isInGraph ? `${label} (Ctrl+Click pour explorer)` : `${label} (cliquer pour voir, Ctrl+Click pour explorer)`}
      >
        {label}
      </button>
      {!isInGraph && addNodeToGraph && (
        <button
          onClick={(e) => { e.stopPropagation(); addNodeToGraph(uri); }}
          className="text-[9px] p-0.5 rounded text-slate-600 hover:text-green-400 hover:bg-green-500/10 transition-colors"
          title="Ajouter au graphe"
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};

// ── Value rendering helper ────────────────────────────────────────────────
const PropertyValue = ({ prop, maxValues = 0, selectNode, visibleNodeIds, addNodeToGraph }) => {
  const [expanded, setExpanded] = useState(false);
  const WD_PREFIX = 'http://www.wikidata.org/entity/';

  return (
    <>
      {prop.values.slice(0, (expanded || addNodeToGraph) ? prop.values.length : maxValues).map((v, i) => {
        if (v.isEntity) {
          const entityUri = v.value.startsWith('http') ? v.value : `${WD_PREFIX}${v.value}`;
          return (
            <EntityLink
              key={i}
              uri={entityUri}
              label={v.label}
              selectNode={selectNode}
              visibleNodeIds={visibleNodeIds}
              addNodeToGraph={addNodeToGraph}
              pid={prop.pid}
            />
          );
        }
        return (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-300 border border-slate-600/30">
            {v.label}
          </span>
        );
      })}
      {prop.values.length > maxValues && !addNodeToGraph && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-slate-500 hover:text-slate-300 px-1 transition-colors"
        >
          {expanded ? '−' : `+${prop.values.length - maxValues}`}
        </button>
      )}
    </>
  );
};

// ── A-group redundancy mini-section (single property + chevron) ────────────
const RedundancyMiniSection = ({ groupKey, groupLabel, hierarchy, props, selectNode, visibleNodeIds, addNodeToGraph }) => {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    return [...props].sort((a, b) => {
      const aInfo = getRedundancyGroupForPid(a.pid);
      const bInfo = getRedundancyGroupForPid(b.pid);
      if (aInfo?.isPreferred && !bInfo?.isPreferred) return -1;
      if (!aInfo?.isPreferred && bInfo?.isPreferred) return 1;
      return (aInfo?.priority ?? 99) - (bInfo?.priority ?? 99);
    });
  }, [props]);

  const bestProp = sorted[0];
  const redundantProps = sorted.slice(1);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {redundantProps.length > 0 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 p-0.5 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            title={hierarchy || groupLabel}
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : '-rotate-90'}`} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <ClickableProperty pid={bestProp.pid} label={bestProp.label}>
          <span className="text-[11px] font-bold text-orange-400/80 min-w-[100px] shrink-0 pt-0.5" title={groupLabel}>
            {bestProp.label}
          </span>
        </ClickableProperty>
        <PropertyValue prop={bestProp} selectNode={selectNode} visibleNodeIds={visibleNodeIds} addNodeToGraph={addNodeToGraph} />
      </div>

      {expanded && redundantProps.length > 0 && (
        <div className="ml-9 mt-1 space-y-1 border-l border-dashed border-slate-700/40 pl-2">
          {redundantProps.map(prop => (
            <div key={prop.pid} className="flex items-start gap-2 opacity-50">
              <span className="text-[11px] font-bold text-slate-500 min-w-[100px] shrink-0 pt-0.5">
                {prop.label}
              </span>
              <PropertyValue prop={prop} selectNode={selectNode} visibleNodeIds={visibleNodeIds} addNodeToGraph={addNodeToGraph} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Collapsible section wrapper ──────────────────────────────────────────
const CollapsibleSection = ({ title, icon: Icon, iconColor, count, defaultOpen = false, children, rightAction }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <div onClick={() => setOpen(!open)} className="flex items-center justify-between w-full group cursor-pointer select-none">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className={`w-3 h-3 ${iconColor || 'text-blue-400'}`} />}
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{title}</h3>
          {count !== undefined && <span className="text-[9px] text-slate-600 font-mono">{count}</span>}
        </div>
        <div className="flex items-center gap-1">
          {rightAction}
          <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${open ? '' : '-rotate-90'}`} />
        </div>
      </div>
      {open && children}
    </div>
  );
};

// ── Grouped properties sub-component ──────────────────────────────────────
const PropertiesGrouped = ({ nodeUri, properties, totalPropertyCount, selectNode, visibleNodeIds, addNodeToGraph }) => {
  const [editMode, setEditMode] = useState(false);
  const filteredDatatypes = useMemo(() => getFilteredDatatypes(), []);
  const registerEdgesFromProperty = useGraphStore(s => s.registerEdgesFromProperty);
  const removePropertyFromCache = useGraphStore(s => s.removePropertyFromCache);
  const refreshNode = useGraphStore(s => s.refreshNode);
  const fetchOutgoingForDisplay = useGraphStore(s => s.fetchOutgoingForDisplay);
  const openSearchModal = useGraphStore(s => s.openSearchModal);

  const { relationProps, redundancySections, hiddenCount } = useMemo(() => {
    if (!properties || Object.keys(properties).length === 0) {
      return { relationProps: [], redundancySections: {}, hiddenCount: 0 };
    }

    const relations = [];
    const aGroupBuckets = {};
    let hidden = 0;

    for (const [pid, prop] of Object.entries(properties)) {
      const dt = prop.datatype || 'string';

      if (filteredDatatypes.has(dt)) {
        hidden++;
        continue;
      }

      if (isNoisePid(pid)) {
        hidden++;
        continue;
      }

      const redundancyInfo = getRedundancyGroupForPid(pid);
      if (redundancyInfo) {
        const { groupKey, label, hierarchy } = redundancyInfo;
        if (!aGroupBuckets[groupKey]) {
          aGroupBuckets[groupKey] = { label, hierarchy, props: [] };
        }
        aGroupBuckets[groupKey].props.push({ pid, ...prop });
        continue;
      }

      relations.push({ pid, ...prop });
    }

    return {
      relationProps: relations,
      redundancySections: aGroupBuckets,
      hiddenCount: hidden,
    };
  }, [properties, filteredDatatypes]);

  const aGroupKeys = Object.keys(redundancySections).sort();
  const hasRedundancy = aGroupKeys.length > 0;
  const hasRelations = relationProps.length > 0;
  const hasContent = hasRelations || hasRedundancy;

  if (!hasContent && totalPropertyCount === 0) return null;

  return (
    <CollapsibleSection
      title="Propriétés"
      icon={Info}
      iconColor="text-blue-400"
      count={totalPropertyCount}
      rightAction={
        <div className="flex items-center gap-1">
          {editMode && (
            <button
              onClick={(e) => { e.stopPropagation(); if (nodeUri) { refreshNode(nodeUri); } }}
              className="p-1 rounded transition-colors text-slate-600 hover:text-blue-400"
              title="Recharger toutes les propriétés"
            >
              <RefreshCcw className="w-3 h-3" />
            </button>
          )}
          {!editMode && (
            <button
              onClick={(e) => { e.stopPropagation(); if (nodeUri) { fetchOutgoingForDisplay(nodeUri); } }}
              className="p-1 rounded transition-colors text-slate-600 hover:text-blue-400"
              title="Charger les propriétés sortantes"
            >
              <RefreshCcw className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditMode(!editMode); }}
            className={`p-1 rounded transition-colors ${editMode ? 'bg-blue-500/20 text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
            title={editMode ? 'Terminer l\'édition' : 'Éditer'}
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* A-group redundancy */}
        {hasRedundancy && (
          <div className="space-y-1.5">
            {aGroupKeys.map(gk => (
              <RedundancyMiniSection
                key={gk}
                groupKey={gk}
                groupLabel={redundancySections[gk].label}
                hierarchy={redundancySections[gk].hierarchy}
                props={redundancySections[gk].props}
                selectNode={selectNode}
                visibleNodeIds={visibleNodeIds}
                addNodeToGraph={editMode ? addNodeToGraph : undefined}
              />
            ))}
          </div>
        )}

        {/* Primary / unclassified / context-dependent relations */}
        {hasRelations && (
          <div className={editMode ? "space-y-1.5" : "columns-2 space-y-1.5"}>
            {relationProps.map(prop => {
              const isActive = true; return (
                <div key={prop.pid} className="flex items-start gap-2">
                  <div className="flex-1 flex flex-wrap gap-2 min-w-0">
                    <ClickableProperty pid={prop.pid} label={prop.label}>
                      <span className={`text-[11px] font-bold min-w-[110px] shrink-0 pt-0.5 transition-colors ${isActive ? 'text-slate-400' : 'text-slate-600'}`}>
                        {prop.label}
                      </span>
                    </ClickableProperty>
                    <PropertyValue prop={prop} selectNode={selectNode} visibleNodeIds={visibleNodeIds} addNodeToGraph={editMode ? addNodeToGraph : undefined} />
                  </div>
                  {editMode && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Checkbox to toggle in graph */}
                      <button
                        onClick={() => {
                          if (nodeUri) {
                            registerEdgesFromProperty(nodeUri, prop.pid, prop.label, prop.values);
                          }
                        }}
                        title="Ajouter les relations de cette propriété au graphe"
                        className={`mt-0.5 w-3.5 h-3.5 shrink-0 rounded-sm border transition-colors ${
                          isActive
                            ? 'bg-blue-500 border-blue-400'
                            : 'bg-transparent border-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {isActive && (
                          <svg viewBox="0 0 10 10" className="w-full h-full text-white" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="1.5,5 4,7.5 8.5,2.5" />
                          </svg>
                        )}
                      </button>
                      {/* X button: remove property from cache */}
                      <button
                        onClick={() => removePropertyFromCache(nodeUri, prop.pid)}
                        className="mt-0.5 shrink-0 text-slate-600 hover:text-red-400 transition-colors"
                        title="Retirer de la liste"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* "Explorer les relations" button */}
        {nodeUri && (
          <button
            onClick={() => openSearchModal([], null, nodeUri)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-violet-700/30 bg-violet-900/10 text-violet-400 hover:text-violet-200 hover:bg-violet-800/20 hover:border-violet-600/40 transition-all text-[12px] font-medium group"
          >
            <Network className="w-3.5 h-3.5 group-hover:text-violet-300 transition-colors" />
            <span>Explorer les relations</span>
            {totalPropertyCount > 0 && (
              <span className="text-[10px] font-mono text-violet-700 group-hover:text-violet-400">({totalPropertyCount})</span>
            )}
          </button>
        )}
      </div>
    </CollapsibleSection>
  );
};

// ── Per-node Settings section ──────────────────────────────────────────────
const NodeSettingsSection = ({ nodeUri }) => {
  const setNodeRenderMode = useGraphStore(s => s.setNodeRenderMode);
  const setNodeRadialStrength = useGraphStore(s => s.setNodeRadialStrength);
  const setNodeRadialSpacingMode = useGraphStore(s => s.setNodeRadialSpacingMode);
  const setNodeRadialSpacing = useGraphStore(s => s.setNodeRadialSpacing);
  const setNodeDirection = useGraphStore(s => s.setNodeDirection);
  const fetchAndExpandNode = useGraphStore(s => s.fetchAndExpandNode);
  const nodeSettings = useGraphStore(s => s.nodeSettings);
  const getOrCreateNodeSettings = useGraphStore(s => s.getOrCreateNodeSettings);
  const loadingUris = useGraphStore(s => s.loadingUris);

  const settings = nodeSettings[nodeUri] || getOrCreateNodeSettings(nodeUri);
  const renderMode = settings?.renderMode || 'force';
  const radialStrength = settings?.radialStrength ?? 0;
  const radialSpacingMode = settings?.radialSpacingMode || 'proportional';
  const radialSpacing = settings?.radialSpacing ?? 50;
  const direction = settings?.explorationDirection ?? 'incoming';
  const explored = settings?.explored || false;
  const loading = loadingUris.has(nodeUri);

  // Parse comma-separated direction flags (backward-compat: 'both' = incoming+outgoing)
  const dirParts = direction === 'both' ? new Set(['incoming', 'outgoing']) : new Set((direction || '').split(',').filter(Boolean));
  const incomingActive = dirParts.has('incoming');
  const outgoingActive = dirParts.has('outgoing');
  const sharedActive = dirParts.has('shared');

  const handleToggleDirection = (toggle) => {
    const next = new Set(dirParts);
    if (next.has(toggle)) next.delete(toggle); else next.add(toggle);
    const flags = ['incoming', 'outgoing', 'shared'].filter(d => next.has(d));
    setNodeDirection(nodeUri, flags.join(','));
  };

  const handleExplore = () => {
    fetchAndExpandNode(nodeUri, { force: true });
  };

  return (
    <CollapsibleSection title="Paramètres" icon={Settings} iconColor="text-purple-400" defaultOpen={false}>
      <div className="space-y-4">
        {/* Render Mode */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
            <Target className="w-3 h-3 text-purple-400" />
            <span>Mode Rendu</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setNodeRenderMode(nodeUri, 'force')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${
                renderMode === 'force'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                  : 'bg-slate-800/30 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-300'
              }`}
            >
              Force
            </button>
            <button
              onClick={() => setNodeRenderMode(nodeUri, 'radial')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${
                renderMode === 'radial'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                  : 'bg-slate-800/30 text-slate-400 border-slate-700/50 hover:bg-slate-700/50 hover:text-slate-300'
              }`}
            >
              Radial
            </button>
          </div>
        </div>

        {/* Direction d'exploration */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              <Network className="w-3 h-3 text-teal-400" />
              <span>Direction</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => handleToggleDirection('incoming')}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${
                incomingActive ? 'bg-teal-500/20 text-teal-300 border-teal-500/50' : 'bg-slate-800/30 text-slate-400 border-slate-700/50'
              }`}
            >Entrants</button>
            <button
              onClick={() => handleToggleDirection('outgoing')}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${
                outgoingActive ? 'bg-teal-500/20 text-teal-300 border-teal-500/50' : 'bg-slate-800/30 text-slate-400 border-slate-700/50'
              }`}
            >Sortants</button>
            <button
              onClick={() => handleToggleDirection('shared')}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase border transition-all ${
                sharedActive ? 'bg-teal-500/20 text-teal-300 border-teal-500/50' : 'bg-slate-800/30 text-slate-400 border-slate-700/50'
              }`}
            >Similaires</button>
          </div>
        </div>

        {/* Bouton Explorer */}
        <button
          onClick={handleExplore}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-xs transition-all bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 disabled:opacity-50"
        >
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          {explored ? "Réexplorer" : "Explorer"}
        </button>

        {/* Radial controls */}
        {renderMode === 'radial' && (
          <div className="pl-2 space-y-2 border-l-2 border-purple-500/30 ml-2 mt-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider min-w-[70px]">
                <Magnet className="w-3 h-3 text-purple-400" />
                <span>Force</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                value={radialStrength}
                onChange={(e) => setNodeRadialStrength(nodeUri, parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <span className="text-[10px] font-mono text-purple-400 w-8 text-right">{Math.round(radialStrength * 100)}%</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider min-w-[70px]">
                <Circle className="w-3 h-3 text-purple-400" />
                <span>Espace</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setNodeRadialSpacingMode(nodeUri, 'proportional')}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all border ${
                    radialSpacingMode === 'proportional'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-slate-800/30 text-slate-500 border-slate-700/40 hover:text-slate-400'
                  }`}
                >
                  Prop.
                </button>
                <button
                  onClick={() => setNodeRadialSpacingMode(nodeUri, 'fixed')}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all border ${
                    radialSpacingMode === 'fixed'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      : 'bg-slate-800/30 text-slate-500 border-slate-700/40 hover:text-slate-400'
                  }`}
                >
                  Fixe
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider min-w-[70px]">
                <Layers className="w-3 h-3 text-purple-400" />
                <span>Rayon</span>
              </div>
              <input
                type="range" min="50" max="150" step="1"
                value={radialSpacing}
                onChange={(e) => setNodeRadialSpacing(nodeUri, parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <span className="text-[10px] font-mono text-purple-400 w-8 text-right">{radialSpacing}</span>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
};

// ── Aggregate entity list ──────────────────────────────────────────────────
const AggregateEntityList = ({ aggregateId, selectNode, addNodeToGraph }) => {
  const loadedAggregates = useGraphStore(s => s.loadedAggregates);
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const aggNode = loadedAggregates[aggregateId];
  const children = aggNode?.children || [];
  const hasChildren = children.length > 0;

  const handleFetchList = useCallback(async () => {
    if (!aggNode) return;
    if (hasChildren) {
      setOpen(prev => !prev);
      return;
    }
    // Fetch children just for listing (not adding to graph)
    setLoading(true);
    try {
      const { fetchAggregateChildren } = await import('../../services/queries/wikidata');
      const maxChildren = aggNode.count > 30 ? 50 : aggNode.count + 5;
      const result = await fetchAggregateChildren(aggNode.sourceUri, aggNode.predicate, null, maxChildren);
      const newAggregates = { ...useGraphStore.getState().loadedAggregates };
      const newLoadedNodes = { ...useGraphStore.getState().loadedNodes };
      const childUris = [];
      for (const n of result.nodes) {
        if (!newLoadedNodes[n.uri]) newLoadedNodes[n.uri] = n;
        childUris.push(n.uri);
      }
      newAggregates[aggregateId] = { ...aggNode, children: childUris };
      useGraphStore.setState({ loadedAggregates: newAggregates, loadedNodes: newLoadedNodes });
      setOpen(true);
    } catch (err) {
      console.warn('[AggregateEntityList] Failed to fetch children:', err);
    }
    setLoading(false);
  }, [aggregateId, aggNode, hasChildren]);

  if (!aggNode) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={handleFetchList}
        className="flex items-center gap-2 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
      >
        {loading ? (
          <Loader className="w-3 h-3 animate-spin text-violet-400" />
        ) : (
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        )}
        <span className="font-bold">{aggNode.count} entités</span>
      </button>

      {open && children.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto space-y-1 pl-2 border-l-2 border-violet-500/20 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {children.map(childUri => {
            const child = loadedNodes[childUri];
            if (!child) return null;
            return (
              <div key={childUri} className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-slate-800/40 transition-colors group">
                <button
                  onClick={() => selectNode(childUri)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="text-[11px] font-bold text-slate-300 truncate group-hover:text-white transition-colors">
                    {child.label}
                  </div>
                  {child.description && (
                    <div className="text-[9px] text-slate-600 truncate">{child.description}</div>
                  )}
                </button>
                {addNodeToGraph && (
                  <button
                    onClick={(e) => { e.stopPropagation(); addNodeToGraph(childUri); }}
                    className="shrink-0 text-[9px] px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors opacity-0 group-hover:opacity-100"
                    title="Ajouter au graphe"
                  >
                    <Plus className="w-3 h-3" />
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

const NodeDetailPanel = ({
  selectedNode,
  selectedEdge,
  nodes,
  connectedNodes,
  isPinned,
  toggleNodePin,
  clearSelectedNode,
  selectNode,
  onShowConnectedNodes,
  loadingSelectedNodeProperties,
  expandAggregate,
  collapseAggregate,
  loadedAggregates,
  addNodeToGraph,
  visibleNodeIds,
}) => {
  if (!selectedNode && !selectedEdge) return null;

  return (
    <div className="absolute bottom-4 right-4 w-[500px] max-h-[800px] bg-slate-900/80 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col z-30 transition-all duration-300 pointer-events-auto">
      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {/* Vue Node */}
        {selectedNode ? (
          selectedNode.isAggregate ? (
            /* Vue Aggregate Node */
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-700/30"
                style={{ background: `linear-gradient(to bottom right, ${AGGREGATE_NODE_COLOR}44, ${AGGREGATE_NODE_COLOR}11)` }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    <div className="text-[12px] font-bold text-violet-400 uppercase tracking-widest px-2.5 py-1">
                      Agrégat
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const { triggerCenterOnNode } = useGraphStore.getState();
                        triggerCenterOnNode(selectedNode.id);
                      }}
                      className="p-2 hover:bg-white/10 rounded-xl transition-colors text-violet-400"
                      title="Centrer"
                    >
                      <Focus className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-slate-700/50 mx-1" />
                    <button
                      onClick={clearSelectedNode}
                      className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <h2 className="text-2xl font-black text-white leading-tight mb-1">
                  {selectedNode.aggregateCount} × {selectedNode.predicateLabel || selectedNode.label}
                </h2>
                {selectedNode.targetClassLabels && selectedNode.targetClassLabels.length > 0 && selectedNode.targetClassLabels[0] !== 'unknown' && (
                  <p className="text-sm text-slate-400">
                    Types : <span className="text-violet-300 font-medium">{selectedNode.targetClassLabels.slice(0, 3).join(', ')}{selectedNode.targetClassLabels.length > 3 ? '...' : ''}</span>
                  </p>
                )}
              </div>

              <div className="p-5 space-y-4">
                <p className="text-slate-400 text-sm leading-relaxed">
                  {selectedNode.aggregateCount} entités reliées par la propriété <span className="font-bold text-violet-300">{selectedNode.predicateLabel}</span>
                  {selectedNode.targetClassLabels && selectedNode.targetClassLabels.length > 0 && selectedNode.targetClassLabels[0] !== 'unknown' && (
                    <> parmi les types <span className="font-bold text-violet-300">{selectedNode.targetClassLabels.slice(0, 3).join(', ')}{selectedNode.targetClassLabels.length > 3 ? '...' : ''}</span></>
                  )}.
                </p>

                {/* Expand / Collapse button — Intentionally not saving to history */}
                {selectedNode.loadingChildren ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                    <Loader className="w-4 h-4 animate-spin text-violet-400" />
                    Chargement des entités…
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Intentionally not saving to history — aggregate expand is not undoable
                        if (expandAggregate) expandAggregate(selectedNode.aggregateId);
                        clearSelectedNode();
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/40 transition-all text-[13px] font-bold group"
                    >
                      <Maximize2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      Développer ({selectedNode.aggregateCount})
                    </button>
                  </div>
                )}

                {/* Collapsible entity list */}
                <AggregateEntityList
                  aggregateId={selectedNode.aggregateId}
                  selectNode={selectNode}
                />
              </div>
            </div>
          ) : (
          <div className="flex flex-col h-full">
            <div className={`p-4 border-b border-slate-700/30`}
              style={{ background: `linear-gradient(to bottom right, ${getCategoryColorAlpha(selectedNode.type, 0.45)}, ${getCategoryColorAlpha(selectedNode.type, 0.1)})` }}
            >
              <div className="flex items-start justify-between mb-2">
                <button
                  onClick={(e) => { e.stopPropagation(); const typeQid = selectedNode.types?.[0]; if (typeQid) selectNode(typeQid.startsWith('http') ? typeQid : `http://www.wikidata.org/entity/${typeQid}`); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const typeQid = selectedNode.types?.[0]; const qid = typeQid?.startsWith?.('http') ? typeQid.split('/').pop() : typeQid; if (qid) { const { addFilter } = useGraphStore.getState(); addFilter(createFilter(FILTER_TYPES.TYPE, qid, selectedNode.typeLabels?.[0])); } }}
                  className="text-[12px] font-bold text-slate-400 uppercase tracking-widest px-2.5 py-1 hover:text-red-400/80 transition-colors cursor-pointer"
                  title={`Gauche: naviguer · Droit: filtre type`}
                >
                  {selectedNode.type}
                </button>
                <div className="flex items-center gap-2">
                  {selectedNode.isPreview ? (
                    <button
                      onClick={() => addNodeToGraph(selectedNode.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-xl transition-colors text-sm font-bold border border-green-500/30"
                      title="Ajouter au graphe"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          const { triggerCenterOnNode } = useGraphStore.getState();
                          triggerCenterOnNode(selectedNode.id);
                        }}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-blue-400"
                        title="Centrer"
                      >
                        <Focus className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => toggleNodePin(selectedNode.id)}
                        className={`p-2 rounded-xl transition-colors ${
                          isPinned(selectedNode.id)
                            ? 'bg-yellow-600/20 text-yellow-400'
                            : 'hover:bg-white/10 text-slate-400'
                        }`}
                        title={isPinned(selectedNode.id) ? 'Dépingler' : 'Épingler'}
                      >
                        <Pin className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          const { removeNodeFromGraph } = useGraphStore.getState();
                          removeNodeFromGraph(selectedNode.id);
                        }}
                        className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-500"
                        title="Retirer du graphe"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  <div className="w-px h-6 bg-slate-700/50 mx-1" />
                  <button
                    onClick={clearSelectedNode}
                    className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <h2
                className="text-2xl font-black text-white leading-tight cursor-pointer hover:text-blue-300 transition-colors mb-2"
                onClick={() => {
                  const { openSearchModal } = useGraphStore.getState();
                  openSearchModal([createFilter(FILTER_TYPES.ENTITY, selectedNode.id, selectedNode.label)]);
                }}
                title="Rechercher les connexions de cette entité"
              >
                {selectedNode.label}
              </h2>
              
            </div>

            <div className="p-5 space-y-5">
              {/* Description */}
              {selectedNode.description && (
                <p className="text-slate-400 text-sm italic leading-relaxed">{selectedNode.description}</p>
              )}

              {/* Propriétés groupées (collapsible with edit mode) */}
              {loadingSelectedNodeProperties ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
                  <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
                  Chargement des propriétés…
                </div>
              ) : (
                <PropertiesGrouped
                  nodeUri={selectedNode.id}
                  properties={selectedNode.properties}
                  totalPropertyCount={selectedNode.properties ? Object.keys(selectedNode.properties).length : 0}
                  selectNode={selectNode}
                  visibleNodeIds={visibleNodeIds}
                  addNodeToGraph={addNodeToGraph}
                />
              )}

              {/* Per-node settings (collapsible) */}
              { !selectedNode.isPreview ? <NodeSettingsSection nodeUri={selectedNode.id} /> : null }

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={onShowConnectedNodes}
                  className="p-1.5 bg-slate-800/40 rounded-2xl border border-slate-700/30 text-left group hover:border-green-500/30 transition-colors"
                >
                  <div className="flex justify-around gap-2 items-center">
                    <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-green-400 transition-colors" />
                    <span className="text-md text-slate-400 font-bold">Connexions ({connectedNodes.length})</span>
                  </div>
                </button>
                <div className="flex items-center justify-center bg-slate-800/40 rounded-2xl border border-slate-700/30 group hover:border-blue-500/30 transition-colors">
                  <span className="text-md font-bold text-slate-400 capitalize">{selectedNode.type}</span>
                </div>
              </div>
            </div>
          </div>
          )
        ) : selectedEdge ? (
          /* Vue Relation */
          <div className="flex flex-col h-full">
            <div className="p-6 bg-gradient-to-br from-slate-700/30 to-slate-600/10 border-b border-slate-700/30">
              <div className="flex items-start justify-between mb-4">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2.5 py-1 bg-slate-800/80 rounded-full border border-slate-700/30">
                  Relation
                </div>
                <button
                  onClick={clearSelectedNode}
                  className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <h2 className="text-2xl font-black text-white mb-3">
                {selectedEdge.type || 'Connexion'}
              </h2>
              <div className="flex items-center gap-3 text-slate-400 text-sm">
                <button
                  onClick={() => selectNode(selectedEdge.source)}
                  className="font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded hover:bg-blue-400/20 transition-colors cursor-pointer"
                >
                  {nodes.find(n => n.id === selectedEdge.source)?.label}
                </button>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <button
                  onClick={() => selectNode(selectedEdge.target)}
                  className="font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded hover:bg-purple-400/20 transition-colors cursor-pointer"
                >
                  {nodes.find(n => n.id === selectedEdge.target)?.label}
                </button>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {selectedEdge.description && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Description</h3>
                  <p className="text-slate-300 text-sm leading-relaxed">{selectedEdge.description}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default NodeDetailPanel;
