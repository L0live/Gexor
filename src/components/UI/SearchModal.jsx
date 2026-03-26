import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Search, X, Loader, Plus, ChevronDown, ChevronRight, ExternalLink, Copy, Check, Clock, Database, Eye, Globe, MoreVertical, ArrowRight, Filter, Compass } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';
import FilterBadge from './FilterBadge';
import TypeHierarchyPanel from './TypeHierarchyPanel';
import { fetchIncomingAggregates, fetchAggregateChildren, fetchSimilarByProperties } from '../../services/queries/wikidata';

const QID_PATTERN = /^Q\d+$/i;

// ── Scope Selector ─────────────────────────────────────────────────────────
const SCOPES = [
  { key: 'graph', label: 'Graphe', icon: Database, desc: 'Nœuds chargés' },
  { key: 'wikidata', label: 'Wikidata', icon: Globe, desc: 'Recherche distante' },
  { key: 'visible', label: 'Visible', icon: Eye, desc: 'Nœuds visibles' },
];

const ScopeSelector = ({ scope, setScope, loadedCount, visibleCount }) => (
  <div className="flex items-center gap-1.5 mt-2.5">
    {SCOPES.map(({ key, label, icon: Icon }) => {
      const active = scope === key;
      const disabled = key === 'visible' && visibleCount === 0;
      return (
        <button
          key={key}
          onClick={() => !disabled && setScope(key)}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
            active
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              : disabled
              ? 'bg-slate-800/30 text-slate-700 border-slate-800/30 cursor-not-allowed'
              : 'bg-slate-800/50 text-slate-500 border-slate-700/40 hover:text-slate-300 hover:border-slate-600/50'
          }`}
          title={disabled ? 'Aucun nœud visible actuellement' : undefined}
        >
          <Icon className="w-3 h-3" />
          {label}
          {key === 'graph' && <span className="text-[9px] opacity-60">{loadedCount}</span>}
          {key === 'visible' && <span className="text-[9px] opacity-60">{visibleCount}</span>}
        </button>
      );
    })}
  </div>
);

// ── Preview Tooltip (§8.3) ─────────────────────────────────────────────────
const PreviewTooltip = ({ node, connectionCount }) => {
  if (!node) return null;
  const props = node.properties || {};
  const propEntries = Object.entries(props).slice(0, 3);

  return (
    <div className="absolute right-full top-0 mr-2 z-[70] w-72 bg-slate-800/98 border border-slate-700/60 rounded-xl shadow-2xl p-3 animate-popover pointer-events-none">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold text-slate-200 truncate">{node.label}</span>
        <span className="text-[9px] text-slate-600 font-mono shrink-0 ml-2">{node.uri?.split('/').pop()}</span>
      </div>
      {node.description && (
        <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">{node.description}</p>
      )}
      {propEntries.length > 0 && (
        <div className="border-t border-slate-700/40 pt-2 space-y-1">
          {propEntries.map(([pid, prop]) => {
            const valueStr = prop.values?.slice(0, 2).map(v => {
              if (typeof v.value === 'string' && v.value.startsWith('http')) return v.label || v.value.split('/').pop();
              return v.label || v.value;
            }).join(', ') || '—';
            return (
              <div key={pid} className="flex items-start gap-2 text-[10px]">
                <span className="text-slate-500 shrink-0">{prop.label || pid}</span>
                <span className="text-slate-300 truncate">{valueStr}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="border-t border-slate-700/40 pt-1.5 mt-2 text-[9px] text-slate-600">
        {connectionCount} connexion{connectionCount !== 1 ? 's' : ''} dans le graphe
      </div>
    </div>
  );
};

// ── Result Row with hover actions ──────────────────────────────────────────
const ResultRow = ({ result, selectNode, closeSearchModal, addNodeToGraph, isSelected, onToggleSelect, focused, loadedNodes, loadedRelations }) => {
  const openSearchModal = useGraphStore(s => s.openSearchModal);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimerRef = useRef(null);
  const qid = result.uri?.split('/').pop();
  const isInGraph = result.inGraph || !!loadedNodes[result.uri];

  const connectionCount = useMemo(() => {
    if (!isInGraph || !loadedRelations) return 0;
    let count = 0;
    for (const rel of Object.values(loadedRelations)) {
      if (rel.source === result.uri || rel.target === result.uri) count++;
    }
    return count;
  }, [isInGraph, loadedRelations, result.uri]);

  const handleMouseEnter = useCallback(() => {
    if (!isInGraph) return;
    hoverTimerRef.current = setTimeout(() => setShowPreview(true), 300);
  }, [isInGraph]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
    setShowPreview(false);
  }, []);

  useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

  const handleCopyQid = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(qid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  }, [qid]);

  const handleAdd = useCallback((e) => {
    e.stopPropagation();
    if (!isInGraph) addNodeToGraph(result.uri);
  }, [isInGraph, addNodeToGraph, result.uri]);

  const handleNavigate = useCallback(() => {
    selectNode(result.uri);
    closeSearchModal();
  }, [selectNode, closeSearchModal, result.uri]);

  const handleClick = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      openSearchModal([], null, result.uri);
    } else {
      handleNavigate();
    }
  }, [handleNavigate, openSearchModal, result.uri]);

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer group ${
        focused ? 'bg-slate-700/60 ring-1 ring-blue-500/50' : 'hover:bg-slate-800/50'
      }`}
    >
      {/* Preview tooltip for in-graph entities */}
      {showPreview && isInGraph && loadedNodes[result.uri] && (
        <PreviewTooltip node={loadedNodes[result.uri]} connectionCount={connectionCount} />
      )}
      {/* Pastille / Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(result.uri); }}
        className="w-4 h-4 flex items-center justify-center shrink-0"
      >
        {isSelected ? (
          <div className="w-3.5 h-3.5 rounded bg-blue-500 flex items-center justify-center">
            <Check className="w-2.5 h-2.5 text-white" />
          </div>
        ) : (
          <div className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
            isInGraph ? 'bg-emerald-400' : 'bg-slate-700 group-hover:bg-slate-600'
          }`} />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-200 truncate">{result.label}</span>
          <span className="text-[9px] text-slate-600 font-mono shrink-0">{qid}</span>
        </div>
        {result.description && (
          <div className="text-[11px] text-slate-500 truncate mt-0.5">{result.description}</div>
        )}
      </div>

      {/* Hover actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); handleNavigate(); }}
          className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-blue-400 transition-colors"
          title="Naviguer"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
        <button
          onClick={handleAdd}
          className={`p-1 rounded transition-colors ${
            isInGraph
              ? 'text-slate-700 cursor-default'
              : 'hover:bg-slate-700/60 text-slate-500 hover:text-emerald-400'
          }`}
          title={isInGraph ? 'Déjà dans le graphe' : 'Ajouter au graphe'}
          disabled={isInGraph}
        >
          <Plus className="w-3 h-3" />
        </button>
        <button
          onClick={handleCopyQid}
          className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-amber-400 transition-colors"
          title="Copier le QID"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
};

// ── Collapsible Type Group ─────────────────────────────────────────────────
const TypeGroup = ({ typeLabel, typeQid, results, defaultOpen, selectNode, closeSearchModal, addFilter, addNodeToGraph, selectedUris, onToggleSelect, focusedUri, loadedNodes, loadedRelations, style }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={style}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 rounded-lg transition-colors group"
      >
        {open ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
        <span className="text-[11px] font-bold text-slate-300 truncate">{typeLabel}</span>
        <span className="text-[9px] text-slate-600 font-mono shrink-0">{results.length}</span>
        {typeQid && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              addFilter(createFilter(FILTER_TYPES.TYPE, typeQid, typeLabel));
            }}
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400/80 border border-red-500/20 hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
          >
            Filtrer
          </button>
        )}
      </button>
      {open && (
        <div className="pl-2 space-y-0.5">
          {results.map(result => (
            <ResultRow
              key={result.uri}
              result={result}
              selectNode={selectNode}
              closeSearchModal={closeSearchModal}
              addNodeToGraph={addNodeToGraph}
              isSelected={selectedUris.has(result.uri)}
              onToggleSelect={onToggleSelect}
              focused={focusedUri === result.uri}
              loadedNodes={loadedNodes}
              loadedRelations={loadedRelations}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Display Mode Selector (exploration mode) ───────────────────────────────
const DISPLAY_MODES = [
  { key: 'outgoing', label: 'Propriétés', icon: ArrowRight },
  { key: 'incoming', label: 'Associés', icon: Filter },
  { key: 'shared', label: 'Communes', icon: Database },
];

const DisplaySelector = ({ mode, setMode }) => (
  <div className="flex items-center gap-1.5 mt-2">
    {DISPLAY_MODES.map(({ key, label, icon: Icon }) => {
      const active = mode === key;
      return (
        <button
          key={key}
          onClick={() => setMode(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
            active
              ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
              : 'bg-slate-800/50 text-slate-500 border-slate-700/40 hover:text-slate-300 hover:border-slate-600/50'
          }`}
        >
          <Icon className="w-3 h-3" />
          {label}
        </button>
      );
    })}
  </div>
);

// ── Exploration: single relation row ───────────────────────────────────────
const ExplorationNodeRow = ({ uri, label, description, badge, selectNode, closeSearchModal, addNodeToGraph, loadedNodes }) => {
  const openSearchModal = useGraphStore(s => s.openSearchModal);
  const isInGraph = !!loadedNodes[uri];

  const handleClick = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      openSearchModal([], null, uri);
    } else {
      selectNode(uri);
      closeSearchModal();
    }
  }, [selectNode, closeSearchModal, openSearchModal, uri]);

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-3 px-3 py-1.5 rounded-xl transition-all cursor-pointer group hover:bg-slate-800/50"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${isInGraph ? 'bg-emerald-400' : 'bg-slate-700 group-hover:bg-slate-600'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-200 truncate">{label || uri.split('/').pop()}</span>
          <span className="text-[9px] text-slate-600 font-mono shrink-0">{uri.split('/').pop()}</span>
        </div>
        {description && <div className="text-[11px] text-slate-500 truncate">{description}</div>}
      </div>
      {badge && (
        <span className="text-[10px] font-mono text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded shrink-0">
          {badge}
        </span>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); if (!isInGraph) addNodeToGraph(uri); }}
          className={`p-1 rounded transition-colors ${isInGraph ? 'text-slate-700 cursor-default' : 'hover:bg-slate-700/60 text-slate-500 hover:text-emerald-400'}`}
          title={isInGraph ? 'Déjà dans le graphe' : 'Ajouter au graphe'}
          disabled={isInGraph}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// ── Exploration: predicate group (collapsible) ─────────────────────────────
const ExplorationPredicateGroup = ({ predicateLabel, count, children, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 rounded-lg transition-colors group"
      >
        {open ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
        <span className="text-[11px] font-bold text-slate-300 truncate">{predicateLabel}</span>
        <span className="text-[9px] text-slate-600 font-mono shrink-0">{count}</span>
      </button>
      {open && <div className="pl-2 space-y-0.5">{children}</div>}
    </div>
  );
};

// ── Exploration: incoming aggregate group ──────────────────────────────────
const IncomingAggregateGroup = ({ predicateLabel, targetClassLabel, count, sourceUri, pid, targetClass, selectNode, closeSearchModal, addNodeToGraph, loadedNodes }) => {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleExpand = useCallback(async () => {
    if (!expanded && children.length === 0) {
      setLoading(true);
      try {
        const result = await fetchAggregateChildren(sourceUri, pid, targetClass);
        setChildren(result?.nodes || []);
      } catch (err) {
        console.warn('[IncomingAggregateGroup] expand failed:', err);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(e => !e);
  }, [expanded, children.length, sourceUri, pid, targetClass]);

  return (
    <div>
      <button
        onClick={handleExpand}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/40 rounded-lg transition-colors group"
      >
        {loading ? (
          <Loader className="w-3 h-3 text-slate-500 animate-spin" />
        ) : expanded ? (
          <ChevronDown className="w-3 h-3 text-slate-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-500" />
        )}
        <span className="text-[11px] font-bold text-slate-300 truncate">{predicateLabel}</span>
        {targetClassLabel && (
          <span className="text-[10px] text-slate-500 truncate">· {targetClassLabel}</span>
        )}
        <span className="text-[9px] text-slate-600 font-mono shrink-0 ml-auto">{count}</span>
      </button>
      {expanded && children.length > 0 && (
        <div className="pl-2 space-y-0.5">
          {children.map(n => (
            <ExplorationNodeRow
              key={n.uri}
              uri={n.uri}
              label={n.label}
              description={n.description}
              selectNode={selectNode}
              closeSearchModal={closeSearchModal}
              addNodeToGraph={addNodeToGraph}
              loadedNodes={loadedNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Exploration results ────────────────────────────────────────────────────
const ExplorationResults = ({ explorationUri, displayMode, outgoingDisplayRelations, loadedNodes, explorationIncoming, explorationShared, explorationLoading, selectNode, closeSearchModal, addNodeToGraph }) => {
  if (explorationLoading) {
    return (
      <div className="flex items-center justify-center min-h-[120px] gap-2 text-slate-500">
        <Loader className="w-4 h-4 animate-spin" />
        <span className="text-sm">Chargement…</span>
      </div>
    );
  }

  // ── Propriétés (outgoing) ──
  if (displayMode === 'outgoing') {
    const edges = Object.values(outgoingDisplayRelations).filter(e => e.source === explorationUri);
    if (edges.length === 0) {
      return <div className="flex items-center justify-center min-h-[80px] text-slate-600 text-sm">Aucune propriété sortante chargée</div>;
    }
    const byPredicate = {};
    for (const edge of edges) {
      const key = edge.label || edge.predicate;
      if (!byPredicate[key]) byPredicate[key] = [];
      byPredicate[key].push(edge);
    }
    const groups = Object.entries(byPredicate).sort(([a], [b]) => a.localeCompare(b));
    return (
      <div className="p-2 space-y-1">
        {groups.map(([predicateLabel, groupEdges], idx) => (
          <ExplorationPredicateGroup
            key={predicateLabel}
            predicateLabel={predicateLabel}
            count={groupEdges.length}
            defaultOpen={idx < 3 || groupEdges.length <= 3}
          >
            {groupEdges.map(edge => {
              const targetNode = loadedNodes[edge.target];
              return (
                <ExplorationNodeRow
                  key={edge.id}
                  uri={edge.target}
                  label={targetNode?.label}
                  description={targetNode?.description}
                  selectNode={selectNode}
                  closeSearchModal={closeSearchModal}
                  addNodeToGraph={addNodeToGraph}
                  loadedNodes={loadedNodes}
                />
              );
            })}
          </ExplorationPredicateGroup>
        ))}
      </div>
    );
  }

  // ── Associés (incoming) ──
  if (displayMode === 'incoming') {
    if (explorationIncoming.length === 0) {
      return <div className="flex items-center justify-center min-h-[80px] text-slate-600 text-sm">Aucune référence entrante</div>;
    }
    const groups = [...explorationIncoming].sort((a, b) =>
      (a.predicateLabel || a.predicate).localeCompare(b.predicateLabel || b.predicate)
    );
    return (
      <div className="p-2 space-y-1">
        {groups.map((agg, i) => (
          <IncomingAggregateGroup
            key={`${agg.predicate}-${i}`}
            predicateLabel={agg.predicateLabel || agg.predicate}
            targetClassLabel={agg.targetClassLabels?.filter(l => l !== 'unknown').join(', ')}
            count={agg.count}
            sourceUri={explorationUri}
            pid={agg.predicate}
            targetClass={agg.targetClasses?.[0]}
            selectNode={selectNode}
            closeSearchModal={closeSearchModal}
            addNodeToGraph={addNodeToGraph}
            loadedNodes={loadedNodes}
          />
        ))}
      </div>
    );
  }

  // ── Communes (shared) ──
  if (displayMode === 'shared') {
    if (explorationShared.length === 0) {
      return <div className="flex items-center justify-center min-h-[80px] text-slate-600 text-sm">Aucune entité similaire trouvée</div>;
    }
    return (
      <div className="p-2 space-y-0.5">
        {explorationShared.map(({ uri, label, sharedCount }) => (
          <ExplorationNodeRow
            key={uri}
            uri={uri}
            label={label}
            badge={`${sharedCount} prop.`}
            selectNode={selectNode}
            closeSearchModal={closeSearchModal}
            addNodeToGraph={addNodeToGraph}
            loadedNodes={loadedNodes}
          />
        ))}
      </div>
    );
  }

  return null;
};

// ── Pre-search body (history + graph exploration) ──────────────────────────
const PreSearchBody = ({ addFilter, searchHistory, restoreFromHistory, selectNode, closeSearchModal }) => {
  const allDiscoveredTypes = useGraphStore(s => s.allDiscoveredTypes);
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const taxonomyClasses = useGraphStore(s => s.taxonomyClasses);

  const typeEntries = useMemo(() => {
    const types = [];
    for (const qid of allDiscoveredTypes) {
      const cls = taxonomyClasses[qid];
      const label = cls?.labels?.fr || cls?.labels?.en || qid;
      const count = Object.values(loadedNodes).filter(n =>
        n.types?.some(t => (t.startsWith('http') ? t.split('/').pop() : t) === qid)
      ).length;
      types.push({ qid, label, count });
    }
    return types.sort((a, b) => b.count - a.count);
  }, [allDiscoveredTypes, taxonomyClasses, loadedNodes]);

  const propertyEntries = useMemo(() => {
    return [];
  }, []);

  const entityEntries = useMemo(() => {
    return Object.values(loadedNodes)
      .slice(0, 50)
      .map(n => ({ uri: n.uri, label: n.label }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }, [loadedNodes]);

  const [showAllTypes, setShowAllTypes] = useState(false);
  const [showAllProps, setShowAllProps] = useState(false);
  const [showAllEntities, setShowAllEntities] = useState(false);

  return (
    <div className="p-4 space-y-5">
      {/* Search History */}
      {searchHistory.length > 0 && (
        <div>
          <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2">Recherches récentes</h4>
          <div className="space-y-1">
            {searchHistory.slice(0, 5).map(entry => (
              <button
                key={entry.id}
                onClick={() => {
                  if (entry.query && QID_PATTERN.test(entry.query.trim())) {
                    const qid = entry.query.trim().toUpperCase();
                    selectNode(`http://www.wikidata.org/entity/${qid}`);
                    closeSearchModal();
                  } else {
                    restoreFromHistory(entry);
                  }
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-800/50 transition-colors group"
              >
                <Clock className="w-3 h-3 text-slate-600 shrink-0" />
                <div className="flex-1 min-w-0 text-[11px] text-slate-400 truncate">
                  {entry.query && <span className="text-slate-300">{entry.query}</span>}
                  {entry.filters?.length > 0 && (
                    <span className="text-slate-500">
                      {entry.query ? ' · ' : ''}
                      {entry.filters.map(f => f.label).join(', ')}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-slate-600 shrink-0">
                  {entry.resultCount != null ? `${entry.resultCount} rés.` : ''}
                </span>
                <ArrowRight className="w-3 h-3 text-slate-700 group-hover:text-blue-400 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Explore current graph */}
      {(typeEntries.length > 0 || propertyEntries.length > 0 || entityEntries.length > 0) && (
        <div>
          <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-3">Explorer le graphe courant</h4>

          {/* Types as chips */}
          {typeEntries.length > 0 && (
            <div className="mb-3">
              <div className="text-[9px] text-slate-600 mb-1.5">Types</div>
              <div className="flex flex-wrap gap-1.5">
                {(showAllTypes ? typeEntries : typeEntries.slice(0, 8)).map(t => (
                  <button
                    key={t.qid}
                    onClick={() => addFilter(createFilter(FILTER_TYPES.TYPE, t.qid, t.label))}
                    className="text-[10px] px-2 py-1 rounded-lg bg-red-500/8 text-red-400/80 border border-red-500/15 hover:bg-red-500/15 transition-colors"
                  >
                    {t.label} <span className="text-red-500/40">{t.count}</span>
                  </button>
                ))}
                {!showAllTypes && typeEntries.length > 8 && (
                  <button onClick={() => setShowAllTypes(true)} className="text-[10px] px-2 py-1 text-slate-600 hover:text-slate-400 transition-colors">
                    + {typeEntries.length - 8} autres
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Properties as chips */}
          {propertyEntries.length > 0 && (
            <div className="mb-3">
              <div className="text-[9px] text-slate-600 mb-1.5">Propriétés</div>
              <div className="flex flex-wrap gap-1.5">
                {(showAllProps ? propertyEntries : propertyEntries.slice(0, 8)).map(p => (
                  <button
                    key={p.pid}
                    onClick={() => addFilter(createFilter(FILTER_TYPES.PROPERTY, p.pid, p.label))}
                    className="text-[10px] px-2 py-1 rounded-lg bg-violet-500/8 text-violet-400/80 border border-violet-500/15 hover:bg-violet-500/15 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
                {!showAllProps && propertyEntries.length > 8 && (
                  <button onClick={() => setShowAllProps(true)} className="text-[10px] px-2 py-1 text-slate-600 hover:text-slate-400 transition-colors">
                    + {propertyEntries.length - 8} autres
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Entities as chips */}
          {entityEntries.length > 0 && (
            <div>
              <div className="text-[9px] text-slate-600 mb-1.5">Entités chargées</div>
              <div className="flex flex-wrap gap-1.5">
                {(showAllEntities ? entityEntries : entityEntries.slice(0, 10)).map(e => (
                  <button
                    key={e.uri}
                    onClick={() => addFilter(createFilter(FILTER_TYPES.ENTITY, e.uri, e.label))}
                    className="text-[10px] px-2 py-1 rounded-lg bg-amber-500/8 text-amber-400/80 border border-amber-500/15 hover:bg-amber-500/15 transition-colors"
                  >
                    {e.label}
                  </button>
                ))}
                {!showAllEntities && entityEntries.length > 10 && (
                  <button onClick={() => setShowAllEntities(true)} className="text-[10px] px-2 py-1 text-slate-600 hover:text-slate-400 transition-colors">
                    + {entityEntries.length - 10} autres
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Zero Results Body ──────────────────────────────────────────────────────
const ZeroResultsBody = ({ query, scope, setScope, executeSearch, filters, removeFilter }) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <p className="text-sm text-slate-400 mb-1">
      Aucun résultat pour <span className="font-bold text-slate-200">"{query}"</span>
    </p>
    <p className="text-[11px] text-slate-600 mb-5">
      {scope === 'graph' ? 'dans le graphe courant' : scope === 'visible' ? 'parmi les nœuds visibles' : 'dans Wikidata'}
    </p>

    {scope !== 'wikidata' && (
      <button
        onClick={() => { setScope('wikidata'); setTimeout(() => executeSearch(), 50); }}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 transition-colors text-sm font-bold mb-4"
      >
        <Globe className="w-3.5 h-3.5" />
        Chercher dans Wikidata
      </button>
    )}

    {filters.length > 0 && (
      <div className="space-y-1.5">
        <p className="text-[10px] text-slate-600">Ou affinez vos filtres :</p>
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => removeFilter(f.id)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-3 h-3" /> Retirer "{f.label}"
          </button>
        ))}
      </div>
    )}
  </div>
);

// ── Selection Banner ───────────────────────────────────────────────────────
const SelectionBanner = ({ count, onAdd, onClear }) => (
  <div className="sticky bottom-0 mx-2 mb-2 flex items-center justify-between px-4 py-2.5 bg-blue-500/15 border border-blue-500/30 rounded-xl backdrop-blur-sm animate-selection-banner">
    <span className="text-[11px] font-bold text-blue-300">
      {count} entité{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}
    </span>
    <div className="flex items-center gap-2">
      <button
        onClick={onAdd}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors text-[11px] font-bold"
      >
        <Plus className="w-3 h-3" /> Ajouter au graphe
      </button>
      <button onClick={onClear} className="p-1 rounded hover:bg-slate-700/60 text-slate-500 hover:text-slate-300 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
);

// ── HAS_VALUE Popover (§5.3) ───────────────────────────────────────────────
const HasValuePopover = ({ pid, pidLabel, onAddProperty, onAddHasValue, onClose }) => {
  const ref = useRef(null);
  const [mode, setMode] = useState('choose'); // 'choose' | 'search'
  const [valueQuery, setValueQuery] = useState('');
  const [valueResults, setValueResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

  const handleValueSearch = useCallback((text) => {
    setValueQuery(text);
    clearTimeout(searchTimerRef.current);
    if (text.length < 2) { setValueResults([]); return; }
    setLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(text)}&lang=fr&limit=8`);
        if (resp.ok) {
          const results = await resp.json();
          setValueResults((results || []).map(r => ({
            uri: r.uri,
            qid: r.uri?.split('/').pop(),
            label: r.label,
            description: r.description,
          })));
        }
      } catch { /* ignore */ }
      setLoading(false);
    }, 300);
  }, []);

  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 z-[70] w-72 bg-slate-800/98 border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden animate-popover">
      <div className="p-3 space-y-2">
        <div className="text-[11px] font-bold text-slate-300">{pid} — {pidLabel || pid}</div>

        {mode === 'choose' && (
          <div className="space-y-1.5">
            <button
              onClick={() => { onAddProperty(); onClose(); }}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-slate-700/40 transition-colors"
            >
              <Filter className="w-3 h-3 text-violet-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-300">Filtrer par existence</div>
                <div className="text-[9px] text-slate-600">A la propriété {pid}</div>
              </div>
            </button>
            <button
              onClick={() => setMode('search')}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-slate-700/40 transition-colors"
            >
              <Search className="w-3 h-3 text-orange-400 shrink-0" />
              <div>
                <div className="text-[11px] text-slate-300">Filtrer par valeur spécifique…</div>
                <div className="text-[9px] text-slate-600">{pid} = Q…</div>
              </div>
            </button>
          </div>
        )}

        {mode === 'search' && (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                type="text"
                value={valueQuery}
                onChange={(e) => handleValueSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && onClose()}
                placeholder="Rechercher une valeur QID…"
                className="w-full pl-7 pr-3 py-1.5 bg-slate-700/60 border border-slate-600/40 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                autoFocus
              />
              {loading && <Loader className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-400 animate-spin" />}
            </div>
            <div className="max-h-[180px] overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {valueResults.map(r => (
                <button
                  key={r.uri}
                  onClick={() => { onAddHasValue(r.qid, r.label); onClose(); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-700/40 transition-colors"
                >
                  <ArrowRight className="w-3 h-3 text-orange-400 shrink-0" />
                  <span className="text-[11px] text-slate-300 truncate flex-1">{r.label}</span>
                  <span className="text-[9px] text-slate-600 font-mono shrink-0">{r.qid}</span>
                </button>
              ))}
              {valueQuery.length >= 2 && !loading && valueResults.length === 0 && (
                <p className="text-[10px] text-slate-600 italic px-2 py-1">Aucun résultat</p>
              )}
            </div>
            <button
              onClick={() => setMode('choose')}
              className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              ← Retour
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Suggested Properties Drawer ────────────────────────────────────────────
const SuggestedPropertiesDrawer = ({ suggestedProperties, addFilter }) => {
  const [expanded, setExpanded] = useState(false);
  const [activePopoverPid, setActivePopoverPid] = useState(null);
  if (!suggestedProperties?.length) return null;
  const shown = expanded ? suggestedProperties : suggestedProperties.slice(0, 5);

  return (
    <div className="px-4 pb-2 pt-1 border-t border-slate-700/20">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] text-slate-600 shrink-0">Propriétés fréquentes :</span>
        {shown.map(sp => (
          <div key={sp.pid} className="relative">
            <button
              onClick={() => setActivePopoverPid(activePopoverPid === sp.pid ? null : sp.pid)}
              className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                activePopoverPid === sp.pid
                  ? 'bg-violet-500/25 text-violet-300 border-violet-500/40'
                  : 'bg-violet-500/10 text-violet-400/80 border-violet-500/20 hover:bg-violet-500/20'
              }`}
              title={`${sp.pct?.toFixed(1) || '?'}% des entités de ce type`}
            >
              {sp.pid} <span className="text-violet-500/50">{sp.pct?.toFixed(0)}%</span>
            </button>
            {activePopoverPid === sp.pid && (
              <HasValuePopover
                pid={sp.pid}
                pidLabel={sp.label}
                onAddProperty={() => addFilter(createFilter(FILTER_TYPES.PROPERTY, sp.pid, sp.pid))}
                onAddHasValue={(qid, label) => addFilter(createFilter(FILTER_TYPES.HAS_VALUE, `${sp.pid}=${qid}`, `${sp.pid}=${label}`, 'and', { pid: sp.pid, qid }))}
                onClose={() => setActivePopoverPid(null)}
              />
            )}
          </div>
        ))}
        {!expanded && suggestedProperties.length > 5 && (
          <button onClick={() => setExpanded(true)} className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors">
            + {suggestedProperties.length - 5}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Type Hierarchy Popover ─────────────────────────────────────────────────
const TypeHierarchyPopover = ({ typeQid, onSelectType, onClose }) => {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 z-[60] w-72 max-h-[300px] bg-slate-800/98 border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden animate-popover">
      <TypeHierarchyPanel
        activeTypeQid={typeQid}
        onSelectType={(qid, label) => { onSelectType(qid, label); onClose(); }}
        popoverMode
      />
    </div>
  );
};

// ── Main SearchModal ───────────────────────────────────────────────────────
const SearchModal = () => {
  // ─── Store state ───
  const searchModalOpen = useGraphStore(s => s.searchModalOpen);
  const closeSearchModal = useGraphStore(s => s.closeSearchModal);
  const openSearchModal = useGraphStore(s => s.openSearchModal);
  const searchFilters = useGraphStore(s => s.searchFilters);
  const searchResults = useGraphStore(s => s.searchResults);
  const searchLoading = useGraphStore(s => s.searchLoading);
  const searchQuery = useGraphStore(s => s.searchQuery);
  const addFilter = useGraphStore(s => s.addFilter);
  const removeFilter = useGraphStore(s => s.removeFilter);
  const clearFilters = useGraphStore(s => s.clearFilters);
  const toggleFilterOperator = useGraphStore(s => s.toggleFilterOperator);
  const setSearchQuery = useGraphStore(s => s.setSearchQuery);
  const executeSearch = useGraphStore(s => s.executeSearch);
  const selectNode = useGraphStore(s => s.selectNode);
  const visibleNodeIds = useGraphStore(s => s.visibleNodeIds);
  const searchHasMore = useGraphStore(s => s.searchHasMore);
  const getSuggestedProperties = useGraphStore(s => s.getSuggestedProperties);
  const loadPropertyMatrix = useGraphStore(s => s.loadPropertyMatrix);
  const propertyMatrixLoaded = useGraphStore(s => s.propertyMatrixLoaded);
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const loadedRelations = useGraphStore(s => s.loadedRelations);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);

  // New scope & history
  const searchScope = useGraphStore(s => s.searchScope);
  const setSearchScope = useGraphStore(s => s.setSearchScope);
  const searchHistory = useGraphStore(s => s.searchHistory);
  const restoreFromHistory = useGraphStore(s => s.restoreFromHistory);

  // Exploration mode
  const searchExplorationUri = useGraphStore(s => s.searchExplorationUri);
  const searchDisplayMode = useGraphStore(s => s.searchDisplayMode);
  const setSearchDisplayMode = useGraphStore(s => s.setSearchDisplayMode);
  const fetchOutgoingForDisplay = useGraphStore(s => s.fetchOutgoingForDisplay);
  const outgoingDisplayRelations = useGraphStore(s => s.outgoingDisplayRelations);
  const outgoingFetchedUris = useGraphStore(s => s.outgoingFetchedUris);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const filterDebounceRef = useRef(null);
  const resultsRef = useRef(null);

  // ─── Local state ───
  const [localQuery, setLocalQuery] = useState('');
  const [selectedUris, setSelectedUris] = useState(new Set());
  const [hierarchyPopoverFilterId, setHierarchyPopoverFilterId] = useState(null);
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1);
  const [searchExecuted, setSearchExecuted] = useState(false);

  // Exploration local state
  const [explorationIncoming, setExplorationIncoming] = useState([]);
  const [explorationShared, setExplorationShared] = useState([]);
  const [explorationLoading, setExplorationLoading] = useState(false);

  // Sync local query with store
  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  // Focus input on open + load property matrix
  useEffect(() => {
    if (searchModalOpen) {
      if (inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
      if (!propertyMatrixLoaded) loadPropertyMatrix();
      setSelectedUris(new Set());
      setFocusedResultIndex(-1);
      setSearchExecuted(false);
    }
  }, [searchModalOpen, propertyMatrixLoaded, loadPropertyMatrix]);

  // Auto-execute on filter change (with debounce 250ms)
  useEffect(() => {
    if (!searchModalOpen) return;
    if (searchFilters.length === 0 && !searchQuery) return;

    clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      executeSearch();
      setSearchExecuted(true);
    }, 250);

    return () => clearTimeout(filterDebounceRef.current);
  }, [searchFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search-as-you-type for local scopes
  useEffect(() => {
    if (!searchModalOpen) return;

    clearTimeout(debounceRef.current);

    if (searchScope === 'graph' || searchScope === 'visible') {
      // Local search: debounce 150ms, search-as-you-type
      if (localQuery.length >= 1 || searchFilters.length > 0) {
        debounceRef.current = setTimeout(() => {
          setSearchQuery(localQuery);
          executeSearch();
          setSearchExecuted(true);
        }, 150);
      } else if (localQuery.length === 0 && searchFilters.length === 0) {
        setSearchQuery('');
        setSearchExecuted(false);
      }
    }
    // For wikidata scope, don't auto-search on type — wait for Enter

    return () => clearTimeout(debounceRef.current);
  }, [localQuery, searchScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset focused index when results change
  useEffect(() => {
    setFocusedResultIndex(-1);
  }, [searchResults]);

  // Fetch exploration data when URI or display mode changes
  useEffect(() => {
    if (!searchExplorationUri) return;

    if (searchDisplayMode === 'outgoing') {
      if (!outgoingFetchedUris.has(searchExplorationUri)) {
        fetchOutgoingForDisplay(searchExplorationUri);
      }
    } else if (searchDisplayMode === 'incoming') {
      setExplorationLoading(true);
      setExplorationIncoming([]);
      fetchIncomingAggregates(searchExplorationUri)
        .then(data => setExplorationIncoming(data?.aggregates || []))
        .catch(err => console.warn('[SearchModal] fetchIncomingAggregates failed:', err))
        .finally(() => setExplorationLoading(false));
    } else if (searchDisplayMode === 'shared') {
      const node = loadedNodes[searchExplorationUri];
      if (!node?.properties || Object.keys(node.properties).length === 0) {
        setExplorationShared([]);
        return;
      }
      setExplorationLoading(true);
      setExplorationShared([]);
      fetchSimilarByProperties(searchExplorationUri, node.properties)
        .then(data => setExplorationShared(Array.isArray(data) ? data : []))
        .catch(err => console.warn('[SearchModal] fetchSimilarByProperties failed:', err))
        .finally(() => setExplorationLoading(false));
    }
  }, [searchExplorationUri, searchDisplayMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived data ───
  const loadedCount = Object.keys(loadedNodes).length;
  const visibleCount = visibleNodeIds?.size || 0;

  const isQidInput = QID_PATTERN.test(localQuery.trim());

  const placeholder = useMemo(() => {
    if (searchScope === 'graph') return `Filtrer dans les ${loadedCount} nœuds chargés…`;
    if (searchScope === 'wikidata') return 'Rechercher dans Wikidata…';
    if (searchScope === 'visible') return `Filtrer les ${visibleCount} nœuds visibles…`;
    return 'Rechercher…';
  }, [searchScope, loadedCount, visibleCount]);

  const activeTypeFilter = searchFilters.find(f => f.type === FILTER_TYPES.TYPE);

  const suggestedProperties = useMemo(() => {
    if (!activeTypeFilter || !propertyMatrixLoaded) return [];
    return getSuggestedProperties(activeTypeFilter.value, 10);
  }, [activeTypeFilter, propertyMatrixLoaded, getSuggestedProperties]);

  // Group results by type
  const { groupedResults, stats } = useMemo(() => {
    const groups = {};
    let inGraphCount = 0;
    const typeSet = new Set();

    for (const result of searchResults) {
      if (result.inGraph) inGraphCount++;
      const primaryType = result.typeLabels?.[0] || 'Autre';
      const typeQid = result.types?.[0] ? (result.types[0].startsWith('http') ? result.types[0].split('/').pop() : result.types[0]) : null;
      typeSet.add(primaryType);
      if (!groups[primaryType]) groups[primaryType] = { typeQid, results: [] };
      groups[primaryType].results.push(result);
    }

    const sorted = Object.entries(groups)
      .sort(([, a], [, b]) => b.results.length - a.results.length);

    return {
      groupedResults: sorted,
      stats: { total: searchResults.length, inGraph: inGraphCount, types: typeSet.size },
    };
  }, [searchResults]);

  // Flat list of all result URIs for keyboard navigation
  const flatResultUris = useMemo(() => {
    const uris = [];
    for (const [, { results }] of groupedResults) {
      for (const r of results) uris.push(r.uri);
    }
    return uris;
  }, [groupedResults]);

  // Is in pre-search state?
  const isPreSearch = !searchExecuted && localQuery === '' && searchFilters.length === 0;

  // ─── Handlers ───
  const handleSubmit = useCallback(() => {
    if (isQidInput) {
      const qid = localQuery.trim().toUpperCase();
      const uri = `http://www.wikidata.org/entity/${qid}`;
      if (loadedNodes[uri]) {
        selectNode(uri);
        closeSearchModal();
      } else {
        addNodeToGraph(uri).then(() => {
          selectNode(uri);
          closeSearchModal();
        });
      }
      return;
    }
    setSearchQuery(localQuery);
    executeSearch();
    setSearchExecuted(true);
  }, [localQuery, isQidInput, setSearchQuery, executeSearch, selectNode, closeSearchModal, loadedNodes, addNodeToGraph]);

  const handleInputChange = useCallback((e) => {
    setLocalQuery(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      closeSearchModal();
      return;
    }

    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        // ⌘Enter: add focused result to graph
        if (focusedResultIndex >= 0 && focusedResultIndex < flatResultUris.length) {
          const uri = flatResultUris[focusedResultIndex];
          if (!loadedNodes[uri]) addNodeToGraph(uri);
        }
        return;
      }
      if (focusedResultIndex >= 0 && focusedResultIndex < flatResultUris.length) {
        // Enter on focused result: navigate
        selectNode(flatResultUris[focusedResultIndex]);
        closeSearchModal();
        return;
      }
      handleSubmit();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedResultIndex(prev => Math.min(prev + 1, flatResultUris.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedResultIndex(prev => Math.max(prev - 1, -1));
      if (focusedResultIndex <= 0) inputRef.current?.focus();
      return;
    }

    // Scope shortcuts: Ctrl/⌘ + 1/2/3
    if ((e.ctrlKey || e.metaKey) && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      const scopes = ['graph', 'wikidata', 'visible'];
      setSearchScope(scopes[parseInt(e.key) - 1]);
      return;
    }
  }, [closeSearchModal, handleSubmit, focusedResultIndex, flatResultUris, selectNode, loadedNodes, addNodeToGraph, setSearchScope]);

  const handleLoadMore = useCallback(() => {
    executeSearch(true);
  }, [executeSearch]);

  const handleTypeFilterReplace = useCallback((qid, label) => {
    const currentTypeFilter = searchFilters.find(f => f.type === FILTER_TYPES.TYPE);
    if (currentTypeFilter) removeFilter(currentTypeFilter.id);
    addFilter(createFilter(FILTER_TYPES.TYPE, qid, label));
    setHierarchyPopoverFilterId(null);
  }, [searchFilters, removeFilter, addFilter]);

  const toggleSelectUri = useCallback((uri) => {
    setSelectedUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  const handleBatchAdd = useCallback(async () => {
    for (const uri of selectedUris) {
      if (!loadedNodes[uri]) await addNodeToGraph(uri);
    }
    setSelectedUris(new Set());
  }, [selectedUris, loadedNodes, addNodeToGraph]);

  // ── Idle bar (when modal is closed) ──
  if (!searchModalOpen) {
    const lastSearch = searchHistory[0];
    const idleText = searchFilters.length > 0
      ? `${searchFilters.length} filtre${searchFilters.length > 1 ? 's' : ''} actif${searchFilters.length > 1 ? 's' : ''}`
      : lastSearch?.query
        ? `"${lastSearch.query}"`
        : 'Rechercher une entité…';

    return (
      <div className="absolute bottom-1 left-1/2 w-[520px] z-10 transition-opacity duration-300 opacity-40 hover:opacity-100" style={{ transform: 'translateX(-50%)' }}>
        <button
          onClick={() => openSearchModal()}
          className="w-full flex items-center gap-3 pl-4 pr-4 py-2.5 bg-slate-700/60 backdrop-blur-sm border border-transparent rounded-2xl text-slate-500 text-sm hover:border-blue-500/30 hover:bg-slate-700/80 transition-all shadow-2xl"
        >
          <Search className="w-4 h-4" />
          <span className="truncate">{idleText}</span>
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-slate-600">{loadedCount} nœuds</span>
            <kbd className="text-[10px] px-1.5 py-0.5 bg-slate-800/80 rounded text-slate-600 border border-slate-700/40">⌘K</kbd>
          </span>
        </button>
      </div>
    );
  }

  // ── Active search panel ──
  return (
    <div
      className="fixed bottom-0 left-1/2 z-50 w-[720px] max-h-[85vh] flex flex-col bg-slate-900/97 border border-slate-700/50 border-b-0 rounded-t-2xl shadow-2xl overflow-hidden animate-slide-up"
      style={{ transform: 'translateX(-50%)' }}
      onKeyDown={handleKeyDown}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              value={localQuery}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-800/80 border border-slate-700/50 rounded-xl text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
            />
            {searchLoading && (
              <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
            )}
            {!searchLoading && localQuery && (
              <button
                onClick={() => { setLocalQuery(''); setSearchQuery(''); setSearchExecuted(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-700 rounded"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}
          </div>
          <button
            onClick={closeSearchModal}
            className="p-2.5 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-500 border border-slate-700/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QID hint */}
        {isQidInput && (
          <button
            onClick={handleSubmit}
            className="mt-1.5 ml-10 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            → Naviguer directement vers {localQuery.trim().toUpperCase()}
          </button>
        )}

        {/* Wikidata hint */}
        {searchScope === 'wikidata' && localQuery.length >= 2 && !isQidInput && !searchLoading && (
          <div className="mt-1.5 ml-10 text-[10px] text-slate-600">
            Appuie sur <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[9px]">↩</kbd> pour chercher dans Wikidata
          </div>
        )}

        {/* Scope selector — hidden in exploration mode */}
        {!searchExplorationUri && (
          <ScopeSelector
            scope={searchScope}
            setScope={setSearchScope}
            loadedCount={loadedCount}
            visibleCount={visibleCount}
          />
        )}

        {/* Exploration mode: node label + display selector */}
        {searchExplorationUri && (
          <>
            <div className="flex items-center gap-2 mt-2.5">
              <Compass className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-[12px] font-bold text-violet-300 truncate">
                {loadedNodes[searchExplorationUri]?.label || searchExplorationUri.split('/').pop()}
              </span>
              <span className="text-[9px] text-slate-600 font-mono shrink-0">
                {searchExplorationUri.split('/').pop()}
              </span>
            </div>
            <DisplaySelector mode={searchDisplayMode} setMode={setSearchDisplayMode} />
          </>
        )}
      </div>

      {/* ── Filter Bar ── */}
      {searchFilters.length > 0 && (
        <div className="px-4 pb-2 border-t border-slate-700/30 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {searchFilters.map(f => (
              <div key={f.id} className="relative">
                <FilterBadge
                  filter={f}
                  onToggleOperator={toggleFilterOperator}
                  onRemove={removeFilter}
                  onShowHierarchy={f.type === FILTER_TYPES.TYPE ? () => setHierarchyPopoverFilterId(f.id === hierarchyPopoverFilterId ? null : f.id) : undefined}
                />
                {/* Type hierarchy popover */}
                {f.type === FILTER_TYPES.TYPE && hierarchyPopoverFilterId === f.id && (
                  <TypeHierarchyPopover
                    typeQid={f.value}
                    onSelectType={handleTypeFilterReplace}
                    onClose={() => setHierarchyPopoverFilterId(null)}
                  />
                )}
              </div>
            ))}
            {searchFilters.length > 1 && (
              <button
                onClick={clearFilters}
                className="text-[10px] text-slate-600 hover:text-red-400 px-2 py-0.5 rounded transition-colors"
              >
                Tout effacer
              </button>
            )}
          </div>
        </div>
      )}

      {/* Suggested properties drawer (below filter bar, when TYPE filter active) */}
      {activeTypeFilter && suggestedProperties.length > 0 && (
        <SuggestedPropertiesDrawer suggestedProperties={suggestedProperties} addFilter={addFilter} />
      )}

      {/* ── Body ── */}
      <div ref={resultsRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-h-0 relative">
        {searchExplorationUri ? (
          // Exploration mode: show node relations
          <ExplorationResults
            explorationUri={searchExplorationUri}
            displayMode={searchDisplayMode}
            outgoingDisplayRelations={outgoingDisplayRelations}
            loadedNodes={loadedNodes}
            explorationIncoming={explorationIncoming}
            explorationShared={explorationShared}
            explorationLoading={explorationLoading}
            selectNode={selectNode}
            closeSearchModal={closeSearchModal}
            addNodeToGraph={addNodeToGraph}
          />
        ) : isPreSearch ? (
          // Pre-search state: history + filter browser
          <PreSearchBody
            addFilter={addFilter}
            searchHistory={searchHistory}
            restoreFromHistory={restoreFromHistory}
            selectNode={selectNode}
            closeSearchModal={closeSearchModal}
          />
        ) : groupedResults.length > 0 ? (
          // Results
          <div className={`p-2 space-y-1 transition-opacity duration-150 ${searchLoading ? 'opacity-50' : 'opacity-100'}`}>
            {groupedResults.map(([typeLabel, { typeQid, results }], idx) => (
              <TypeGroup
                key={typeLabel}
                typeLabel={typeLabel}
                typeQid={typeQid}
                results={results}
                defaultOpen={idx < 3}
                selectNode={selectNode}
                closeSearchModal={closeSearchModal}
                addFilter={addFilter}
                addNodeToGraph={addNodeToGraph}
                selectedUris={selectedUris}
                onToggleSelect={toggleSelectUri}
                focusedUri={focusedResultIndex >= 0 ? flatResultUris[focusedResultIndex] : null}
                loadedNodes={loadedNodes}
                loadedRelations={loadedRelations}
                style={idx < 6 ? { animation: `fade-in-stagger 0.2s ease-out ${idx * 0.05}s both` } : undefined}
              />
            ))}

            {/* Load more */}
            {searchHasMore && !searchLoading && (
              <div className="p-2 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800/60 text-slate-400 text-[11px] font-bold border border-slate-700/40 hover:bg-slate-700/60 hover:text-slate-200 transition-all"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Charger 50 résultats de plus
                </button>
              </div>
            )}
          </div>
        ) : (
          // Empty / zero results / loading
          <div className="flex items-center justify-center min-h-[120px]">
            {searchLoading ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm">Recherche…</span>
              </div>
            ) : (searchQuery || searchFilters.length > 0) ? (
              <ZeroResultsBody
                query={searchQuery}
                scope={searchScope}
                setScope={setSearchScope}
                executeSearch={executeSearch}
                filters={searchFilters}
                removeFilter={removeFilter}
              />
            ) : (
              <p className="text-sm text-slate-600">
                {searchScope === 'wikidata' ? 'Tapez et appuyez sur Entrée pour rechercher' : 'Tapez pour filtrer…'}
              </p>
            )}
          </div>
        )}

        {/* Loading overlay on existing results */}
        {searchLoading && groupedResults.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader className="w-5 h-5 text-blue-400 animate-spin" />
          </div>
        )}

        {/* Selection banner */}
        {selectedUris.size > 0 && (
          <SelectionBanner
            count={selectedUris.size}
            onAdd={handleBatchAdd}
            onClear={() => setSelectedUris(new Set())}
          />
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2 border-t border-slate-700/40 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[9px] text-slate-600">
          <span><kbd className="px-1 py-0.5 bg-slate-800 rounded">↩</kbd> {searchScope === 'wikidata' ? 'rechercher' : 'naviguer'}</span>
          <span><kbd className="px-1 py-0.5 bg-slate-800 rounded">⌘↩</kbd> ajouter</span>
          <span><kbd className="px-1 py-0.5 bg-slate-800 rounded">⌘K</kbd> fermer</span>
          {searchFilters.length > 0 && (
            <span><kbd className="px-1 py-0.5 bg-slate-800 rounded">Ctrl+⌫</kbd> filtre</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          {stats.total > 0 && <span>{stats.total}</span>}
          {stats.inGraph > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-emerald-500">{stats.inGraph}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
