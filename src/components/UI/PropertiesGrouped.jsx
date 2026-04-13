/**
 * PropertiesGrouped — composants partagés pour l'affichage des propriétés Wikidata.
 * Extraits de NodeDetailPanel pour être réutilisés dans RightPanel/PropertiesTab.
 */
import React, { useMemo, useState } from 'react';
import { ChevronDown, Info, Pencil, RefreshCcw, Eye, Network, X, Plus } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { isNoisePid, getRedundancyGroupForPid, getFilteredDatatypes } from '../../services/propertyClassification';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';
import ClickableProperty from './ClickableProperty';

// ── Clickable entity value ────────────────────────────────────────────────
export const EntityLink = ({ uri, label, selectNode, visibleNodeIds, addNodeToGraph, pid }) => {
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
export const PropertyValue = ({ prop, maxValues = 0, selectNode, visibleNodeIds, addNodeToGraph }) => {
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

// ── A-group redundancy mini-section ──────────────────────────────────────
export const RedundancyMiniSection = ({ groupKey, groupLabel, hierarchy, props, selectNode, visibleNodeIds, addNodeToGraph }) => {
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
export const CollapsibleSection = ({ title, icon: Icon, iconColor, count, defaultOpen = false, children, rightAction }) => {
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

// ── Grouped properties component ──────────────────────────────────────────
const PropertiesGrouped = ({ nodeUri, properties, totalPropertyCount, selectNode, visibleNodeIds, addNodeToGraph }) => {
  const [editMode, setEditMode] = useState(false);
  const filteredDatatypes = useMemo(() => getFilteredDatatypes(), []);
  const registerEdgesFromProperty = useGraphStore(s => s.registerEdgesFromProperty);
  const removePropertyFromCache = useGraphStore(s => s.removePropertyFromCache);
  const refreshNode = useGraphStore(s => s.refreshNode);
  const fetchOutgoingForDisplay = useGraphStore(s => s.fetchOutgoingForDisplay);
  const openSearchModal = useGraphStore(s => s.openSearchModal);
  const loadedRelations = useGraphStore(s => s.loadedRelations);

  const activePids = useMemo(() => {
    const result = new Set();
    const WDT = 'http://www.wikidata.org/prop/direct/';
    for (const edge of Object.values(loadedRelations)) {
      if (edge.source === nodeUri || edge.target === nodeUri) {
        const pred = typeof edge.predicate === 'string' ? edge.predicate : null;
        const pid = pred?.startsWith(WDT) ? pred.slice(WDT.length) : null;
        if (pid) result.add(pid);
      }
    }
    return result;
  }, [loadedRelations, nodeUri]);

  const { relationProps, redundancySections, hiddenCount } = useMemo(() => {
    if (!properties || Object.keys(properties).length === 0) {
      return { relationProps: [], redundancySections: {}, hiddenCount: 0 };
    }

    const relations = [];
    const aGroupBuckets = {};
    let hidden = 0;

    for (const [pid, prop] of Object.entries(properties)) {
      const dt = prop.datatype || 'string';
      if (filteredDatatypes.has(dt)) { hidden++; continue; }
      if (isNoisePid(pid)) { hidden++; continue; }

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

    return { relationProps: relations, redundancySections: aGroupBuckets, hiddenCount: hidden };
  }, [properties, filteredDatatypes]);

  const aGroupKeys = Object.keys(redundancySections).sort();
  const hasContent = relationProps.length > 0 || aGroupKeys.length > 0;

  if (!hasContent && totalPropertyCount === 0) return null;

  return (
    <CollapsibleSection
      title="Propriétés"
      icon={Info}
      iconColor="text-blue-400"
      count={totalPropertyCount}
      defaultOpen={true}
      rightAction={
        <div className="flex items-center gap-1">
          {editMode && (
            <button
              onClick={(e) => { e.stopPropagation(); if (nodeUri) refreshNode(nodeUri); }}
              className="p-1 rounded transition-colors text-slate-600 hover:text-blue-400"
              title="Recharger toutes les propriétés"
            >
              <RefreshCcw className="w-3 h-3" />
            </button>
          )}
          {!editMode && (
            <button
              onClick={(e) => { e.stopPropagation(); if (nodeUri) fetchOutgoingForDisplay(nodeUri); }}
              className="p-1 rounded transition-colors text-slate-600 hover:text-blue-400"
              title="Charger les propriétés sortantes"
            >
              <Eye className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditMode(!editMode); }}
            className={`p-1 rounded transition-colors ${editMode ? 'bg-blue-500/20 text-blue-400' : 'text-slate-600 hover:text-slate-400'}`}
            title={editMode ? "Terminer l'édition" : 'Éditer'}
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* A-group redundancy */}
        {aGroupKeys.length > 0 && (
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
        {relationProps.length > 0 && (
          <div className={editMode ? 'space-y-1.5' : 'columns-2 space-y-1.5'}>
            {relationProps.map(prop => {
              const isActive = activePids.has(prop.pid);
              return (
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
                      <button
                        onClick={() => { if (nodeUri) registerEdgesFromProperty(nodeUri, prop.pid, prop.label, prop.values); }}
                        title="Ajouter les relations de cette propriété au graphe"
                        className={`mt-0.5 w-3.5 h-3.5 shrink-0 rounded-sm border transition-colors ${
                          isActive ? 'bg-blue-500 border-blue-400' : 'bg-transparent border-slate-600 hover:border-slate-400'
                        }`}
                      >
                        {isActive && (
                          <svg viewBox="0 0 10 10" className="w-full h-full text-white" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="1.5,5 4,7.5 8.5,2.5" />
                          </svg>
                        )}
                      </button>
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

export default PropertiesGrouped;
