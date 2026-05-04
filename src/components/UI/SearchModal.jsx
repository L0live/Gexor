import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Search, X, Loader, Plus, ChevronDown, ChevronRight, ExternalLink, Copy, Check, Clock, Database, Eye, Globe, ArrowRight, Filter } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';
import TypeHierarchyPanel from './TypeHierarchyPanel';

const QID_PATTERN = /^Q\d+$/i;

// ── Scope Selector ─────────────────────────────────────────────────────────
const SCOPES = [
  { key: 'graph',    label: 'Graphe',   icon: Database, desc: 'Nœuds chargés' },
  { key: 'wikidata', label: 'Wikidata', icon: Globe,    desc: 'Recherche distante' },
  { key: 'visible',  label: 'Visible',  icon: Eye,      desc: 'Nœuds visibles' },
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
          {key === 'graph'   && <span className="text-[9px] opacity-60">{loadedCount}</span>}
          {key === 'visible' && <span className="text-[9px] opacity-60">{visibleCount}</span>}
        </button>
      );
    })}
  </div>
);

// ── Preview Tooltip ─────────────────────────────────────────────────────────
const PreviewTooltip = ({ node, connectionCount }) => {
  if (!node) return null;
  const propEntries = Object.entries(node.properties || {}).slice(0, 3);

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
// connectionCount is pre-computed by parent (§8.2 fix)
const ResultRow = ({ result, selectNode, closeSearchModal, addNodeToGraph, isSelected, onToggleSelect, focused, loadedNodes, connectionCount }) => {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimerRef = useRef(null);
  const qid = result.uri?.split('/').pop();
  const isInGraph = result.inGraph || !!loadedNodes[result.uri];

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

  return (
    <div
      onClick={handleNavigate}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer group ${
        focused ? 'bg-slate-700/60 ring-1 ring-blue-500/50' : 'hover:bg-slate-800/50'
      }`}
    >
      {showPreview && isInGraph && loadedNodes[result.uri] && (
        <PreviewTooltip node={loadedNodes[result.uri]} connectionCount={connectionCount} />
      )}
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

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-200 truncate">{result.label}</span>
          <span className="text-[9px] text-slate-600 font-mono shrink-0">{qid}</span>
        </div>
        {result.description && (
          <div className="text-[11px] text-slate-500 truncate mt-0.5">{result.description}</div>
        )}
      </div>

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
const TypeGroup = ({ typeLabel, typeQid, results, defaultOpen, selectNode, closeSearchModal, addFilter, addNodeToGraph, selectedUris, onToggleSelect, focusedUri, loadedNodes, connectionsByUri, style }) => {
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
              connectionCount={connectionsByUri[result.uri] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Pre-search body (history + graph filter browser) ───────────────────────
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

  const entityEntries = useMemo(() => {
    return Object.values(loadedNodes)
      .slice(0, 50)
      .map(n => ({ uri: n.uri, label: n.label }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }, [loadedNodes]);

  const [showAllTypes, setShowAllTypes] = useState(false);
  const [showAllEntities, setShowAllEntities] = useState(false);

  return (
    <div className="p-4 space-y-5">
      {searchHistory.length > 0 && (
        <div>
          <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2">Recherches récentes</h4>
          <div className="space-y-1">
            {searchHistory.slice(0, 5).map(entry => (
              <button
                key={entry.id}
                onClick={() => {
                  // §8.7: QID shortcut only when entry has no filters.
                  // If there are filters too, restore the full context instead.
                  const hasQid = entry.query && QID_PATTERN.test(entry.query.trim());
                  const hasFilters = entry.filters?.length > 0;
                  if (hasQid && !hasFilters) {
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

      {(typeEntries.length > 0 || entityEntries.length > 0) && (
        <div>
          <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-3">Explorer le graphe courant</h4>

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

// ── Zero Results Body — §8.1 fix: callback instead of setTimeout ───────────
const ZeroResultsBody = ({ query, scope, onSearchInWikidata, filters, removeFilter }) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <p className="text-sm text-slate-400 mb-1">
      Aucun résultat pour <span className="font-bold text-slate-200">"{query}"</span>
    </p>
    <p className="text-[11px] text-slate-600 mb-5">
      {scope === 'graph' ? 'dans le graphe courant' : scope === 'visible' ? 'parmi les nœuds visibles' : 'dans Wikidata'}
    </p>

    {scope !== 'wikidata' && (
      <button
        onClick={onSearchInWikidata}
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
const SelectionBanner = ({ count, onAdd, onClear, statusMsg }) => (
  <div className="sticky bottom-0 mx-2 mb-2 flex items-center justify-between px-4 py-2.5 bg-blue-500/15 border border-blue-500/30 rounded-xl backdrop-blur-sm animate-selection-banner">
    <span className="text-[11px] font-bold text-blue-300">
      {statusMsg || `${count} entité${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''}`}
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

// ── HAS_VALUE Popover ──────────────────────────────────────────────────────
const HasValuePopover = ({ pid, pidLabel, onAddProperty, onAddHasValue, onClose }) => {
  const ref = useRef(null);
  const [mode, setMode] = useState('choose');
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
            <button onClick={() => setMode('choose')} className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors">
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

// ── Filter Row — text-based rendering ──────────────────────────────────────
const FILTER_TYPE_LABELS = {
  [FILTER_TYPES.TYPE]:      'est de type',
  [FILTER_TYPES.PROPERTY]:  'a la propriété',
  [FILTER_TYPES.ENTITY]:    'est lié à',
  [FILTER_TYPES.HAS_VALUE]: '=',
  [FILTER_TYPES.TEXT]:      'texte',
};

const QID_RAW = /^Q\d+$/i;

const FilterRow = ({ filter, onRemove, onReplaceType, hierarchyOpen, onShowHierarchy, onHierarchyClose }) => {
  const taxonomyClasses = useGraphStore(s => s.taxonomyClasses);

  const typeLabel = filter.type === FILTER_TYPES.HAS_VALUE
    ? `${filter.meta?.pid || ''} =`
    : (FILTER_TYPE_LABELS[filter.type] || filter.type);

  // Resolve label if it's still a raw QID (e.g. history entry created before taxonomy loaded)
  let displayLabel = filter.label;
  if (filter.type === FILTER_TYPES.TYPE && QID_RAW.test(filter.label)) {
    const cls = taxonomyClasses[filter.value];
    const resolved = cls?.labels?.fr || cls?.labels?.en;
    displayLabel = resolved || filter.label; // keep QID if still unresolved
  }

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-lg group ${filter.operator === 'not' ? 'bg-red-500/5' : ''}`}>
      {filter.operator === 'not' && (
        <span className="text-[10px] font-bold text-red-400/80 shrink-0">sauf</span>
      )}
      <span className="text-[11px] text-slate-500 shrink-0">{typeLabel}</span>
      <span className="text-[11px] text-slate-200 font-medium truncate flex-1">{displayLabel}</span>
      {filter.type === FILTER_TYPES.TYPE && (
        <div className="relative shrink-0">
          <button
            onClick={onShowHierarchy}
            className="p-0.5 rounded text-slate-600 hover:text-slate-400 transition-colors"
            title="Naviguer dans la taxonomie P279"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          {hierarchyOpen && (
            <TypeHierarchyPopover
              typeQid={filter.value}
              onSelectType={(qid, label) => onReplaceType(filter.id, qid, label)}
              onClose={onHierarchyClose}
            />
          )}
        </div>
      )}
      <button
        onClick={() => onRemove(filter.id)}
        className="shrink-0 p-0.5 rounded text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        title="Retirer ce filtre"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

// ── Filter Builder — progressive inline query builder ─────────────────────
const FilterBuilder = ({ onAddFilter, taxonomyClasses, loadedNodes, propertyMatrix, searchFilters, onCancel }) => {
  const [step, setStep] = useState('choice'); // 'choice' | 'type' | 'property' | 'entity'
  const [operator, setOperator] = useState('and');
  const [orTarget, setOrTarget] = useState('new');

  // TYPE filter state
  const [typeQuery, setTypeQuery] = useState('');
  const [selectedType, setSelectedType] = useState(null);

  // PROPERTY filter state
  const [propQuery, setPropQuery] = useState('');
  const [selectedProp, setSelectedProp] = useState(null);
  const [valueMode, setValueMode] = useState('exists'); // 'exists' | 'equals'
  const [valueQuery, setValueQuery] = useState('');
  const [valueResults, setValueResults] = useState([]);
  const [valueLoading, setValueLoading] = useState(false);
  const valueTimerRef = useRef(null);

  // ENTITY filter state
  const [entityQuery, setEntityQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(null);

  useEffect(() => () => clearTimeout(valueTimerRef.current), []);

  const existingOrGroupIds = useMemo(() => {
    const ids = {};
    for (const f of searchFilters) {
      if (f.groupId && f.operator === 'or') ids[f.groupId] = true;
    }
    return Object.keys(ids);
  }, [searchFilters]);

  const typeResults = useMemo(() => {
    const lc = typeQuery.toLowerCase().trim();
    const entries = Object.entries(taxonomyClasses || {});
    const filtered = lc
      ? entries.filter(([qid, cls]) => {
          const label = cls.labels?.fr || cls.labels?.en || '';
          return label.toLowerCase().includes(lc) || qid.toLowerCase().includes(lc);
        })
      : entries;
    return filtered.slice(0, 8).map(([qid, cls]) => ({ qid, label: cls.labels?.fr || cls.labels?.en || qid }));
  }, [typeQuery, taxonomyClasses]);

  // Build property list from loaded graph nodes
  const knownProperties = useMemo(() => {
    const map = {};
    for (const node of Object.values(loadedNodes)) {
      for (const [pid, prop] of Object.entries(node.properties || {})) {
        if (!map[pid]) map[pid] = prop.label || pid;
      }
    }
    return Object.entries(map).map(([pid, label]) => ({ pid, label }));
  }, [loadedNodes]);

  const propResults = useMemo(() => {
    const lc = propQuery.toLowerCase().trim();
    const filtered = lc
      ? knownProperties.filter(p => p.label.toLowerCase().includes(lc) || p.pid.toLowerCase().includes(lc))
      : knownProperties;
    return filtered.slice(0, 8);
  }, [propQuery, knownProperties]);

  const localEntityResults = useMemo(() => {
    const lc = entityQuery.toLowerCase().trim();
    const nodes = Object.values(loadedNodes);
    const filtered = lc ? nodes.filter(n => n.label?.toLowerCase().includes(lc)) : nodes;
    return filtered.slice(0, 8).map(n => ({ uri: n.uri, label: n.label }));
  }, [entityQuery, loadedNodes]);

  const handleValueSearch = useCallback((text) => {
    setValueQuery(text);
    clearTimeout(valueTimerRef.current);
    if (text.length < 2) { setValueResults([]); return; }
    setValueLoading(true);
    valueTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/search?q=${encodeURIComponent(text)}&lang=fr&limit=8`);
        if (resp.ok) {
          const results = await resp.json();
          setValueResults((results || []).map(r => ({
            uri: r.uri,
            qid: r.uri?.split('/').pop(),
            label: r.label,
          })));
        }
      } catch { /* ignore */ }
      setValueLoading(false);
    }, 300);
  }, []);

  const handleConfirm = useCallback((type, value, label, meta = {}) => {
    let groupId = null;
    if (operator === 'or') {
      groupId = orTarget === 'new' ? `or-group-${Date.now()}` : orTarget;
    }
    onAddFilter(createFilter(type, value, label, operator, meta, groupId));
    onCancel();
  }, [operator, orTarget, onAddFilter, onCancel]);

  // Shared operator row (inlined to avoid hooks-in-nested-component issues)
  const operatorRow = (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[9px] text-slate-600 shrink-0">Opérateur :</span>
      {[['and', 'ET'], ['or', 'OU'], ['not', 'SAUF']].map(([key, lbl]) => (
        <button
          key={key}
          onClick={() => setOperator(key)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            operator === key
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              : 'bg-slate-800/50 text-slate-500 border-slate-700/40 hover:text-slate-300'
          }`}
        >
          {lbl}
        </button>
      ))}
      {operator === 'or' && existingOrGroupIds.length > 0 && (
        <select
          value={orTarget}
          onChange={e => setOrTarget(e.target.value)}
          className="ml-1 text-[9px] bg-slate-800 border border-slate-700/40 rounded text-slate-400 px-1 py-0.5"
        >
          <option value="new">Nouveau groupe OU</option>
          {existingOrGroupIds.map((gid, i) => (
            <option key={gid} value={gid}>Ajouter au groupe OU {i + 1}</option>
          ))}
        </select>
      )}
    </div>
  );

  // Step 1: Choose filter type
  if (step === 'choice') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded-xl border border-slate-700/30">
        <span className="text-[10px] text-slate-500 shrink-0">Ajouter :</span>
        <button onClick={() => setStep('type')} className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400/80 border border-red-500/20 hover:bg-red-500/20 transition-colors">
          Type d'entité
        </button>
        <button onClick={() => setStep('property')} className="text-[10px] px-2 py-1 rounded bg-violet-500/10 text-violet-400/80 border border-violet-500/20 hover:bg-violet-500/20 transition-colors">
          Propriété
        </button>
        <button onClick={() => setStep('entity')} className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-400/80 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">
          Entité liée
        </button>
        <button onClick={onCancel} className="ml-auto p-1 rounded hover:bg-slate-700/60 text-slate-600 hover:text-slate-300 transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Step 2a: Type filter config
  if (step === 'type') {
    return (
      <div className="p-2.5 bg-slate-800/50 rounded-xl border border-red-500/15 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 shrink-0">est de type</span>
          {selectedType ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/25 text-[10px] text-red-300">
              <span>{selectedType.label}</span>
              <button onClick={() => setSelectedType(null)} className="text-red-500/60 hover:text-red-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={typeQuery}
              onChange={e => setTypeQuery(e.target.value)}
              placeholder="Chercher un type d'entité…"
              className="flex-1 px-2 py-0.5 bg-slate-700/60 border border-slate-600/40 rounded text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500/40"
              autoFocus
            />
          )}
        </div>

        {!selectedType && typeResults.length > 0 && (
          <div className="space-y-0.5 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {typeResults.map(t => (
              <button
                key={t.qid}
                onClick={() => setSelectedType(t)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-red-500/10 text-left transition-colors"
              >
                <span className="text-[10px] text-slate-300 flex-1">{t.label}</span>
                <span className="text-[9px] text-slate-600 font-mono">{t.qid}</span>
              </button>
            ))}
          </div>
        )}

        {operatorRow}

        <div className="flex items-center justify-between">
          <button onClick={() => setStep('choice')} className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors">← Retour</button>
          <button
            onClick={() => selectedType && handleConfirm(FILTER_TYPES.TYPE, selectedType.qid, selectedType.label)}
            disabled={!selectedType}
            className={`text-[10px] px-3 py-1 rounded border transition-colors ${
              selectedType
                ? 'bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30 cursor-pointer'
                : 'bg-slate-800/50 text-slate-600 border-slate-700/30 cursor-not-allowed'
            }`}
          >
            Ajouter
          </button>
        </div>
      </div>
    );
  }

  // Step 2b: Property filter config
  if (step === 'property') {
    return (
      <div className="p-2.5 bg-slate-800/50 rounded-xl border border-violet-500/15 space-y-2">
        {!selectedProp ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 shrink-0">propriété</span>
              <input
                type="text"
                value={propQuery}
                onChange={e => setPropQuery(e.target.value)}
                placeholder="Chercher une propriété (ex: P31, occupation)…"
                className="flex-1 px-2 py-0.5 bg-slate-700/60 border border-slate-600/40 rounded text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/40"
                autoFocus
              />
            </div>
            {propResults.length > 0 && (
              <div className="space-y-0.5 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {propResults.map(p => (
                  <button
                    key={p.pid}
                    onClick={() => setSelectedProp(p)}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-violet-500/10 text-left transition-colors"
                  >
                    <span className="text-[9px] font-mono text-violet-400 shrink-0">{p.pid}</span>
                    <span className="text-[10px] text-slate-300 flex-1">{p.label}</span>
                  </button>
                ))}
              </div>
            )}
            {propResults.length === 0 && propQuery.length >= 2 && (
              <p className="text-[10px] text-slate-600 italic px-1">Aucune propriété connue — tapez un PID directement (ex: P569)</p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 shrink-0">propriété</span>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/15 border border-violet-500/25 text-[10px] text-violet-300">
                <span className="font-mono">{selectedProp.pid}</span>
                <span>{selectedProp.label}</span>
                <button onClick={() => { setSelectedProp(null); setValueMode('exists'); setValueQuery(''); setValueResults([]); }} className="text-violet-500/60 hover:text-violet-400">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setValueMode('exists')}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  valueMode === 'exists'
                    ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                    : 'bg-slate-800/50 text-slate-500 border-slate-700/40 hover:text-slate-300'
                }`}
              >
                A la propriété
              </button>
              <button
                onClick={() => setValueMode('equals')}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  valueMode === 'equals'
                    ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                    : 'bg-slate-800/50 text-slate-500 border-slate-700/40 hover:text-slate-300'
                }`}
              >
                = valeur spécifique
              </button>
            </div>

            {valueMode === 'equals' && (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                  <input
                    type="text"
                    value={valueQuery}
                    onChange={e => handleValueSearch(e.target.value)}
                    placeholder="Rechercher une valeur…"
                    className="w-full pl-7 pr-3 py-1 bg-slate-700/60 border border-slate-600/40 rounded text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-orange-500/40"
                    autoFocus
                  />
                  {valueLoading && <Loader className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-orange-400 animate-spin" />}
                </div>
                {valueResults.length > 0 && (
                  <div className="space-y-0.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {valueResults.map(r => (
                      <button
                        key={r.uri}
                        onClick={() => handleConfirm(
                          FILTER_TYPES.HAS_VALUE,
                          `${selectedProp.pid}=${r.qid}`,
                          `${selectedProp.label} = ${r.label}`,
                          { pid: selectedProp.pid, qid: r.qid }
                        )}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-orange-500/10 text-left transition-colors"
                      >
                        <span className="text-[10px] text-slate-300 flex-1">{r.label}</span>
                        <span className="text-[9px] text-slate-600 font-mono">{r.qid}</span>
                      </button>
                    ))}
                  </div>
                )}
                {valueQuery.length >= 2 && !valueLoading && valueResults.length === 0 && (
                  <p className="text-[10px] text-slate-600 italic px-1">Aucun résultat</p>
                )}
              </div>
            )}
          </>
        )}

        {operatorRow}

        <div className="flex items-center justify-between">
          <button onClick={() => setStep('choice')} className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors">← Retour</button>
          {selectedProp && valueMode === 'exists' && (
            <button
              onClick={() => handleConfirm(FILTER_TYPES.PROPERTY, selectedProp.pid, selectedProp.label)}
              className="text-[10px] px-3 py-1 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
            >
              Ajouter
            </button>
          )}
        </div>
      </div>
    );
  }

  // Step 2c: Entity filter config
  if (step === 'entity') {
    return (
      <div className="p-2.5 bg-slate-800/50 rounded-xl border border-amber-500/15 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 shrink-0">est lié à</span>
          {selectedEntity ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-[10px] text-amber-300">
              <span>{selectedEntity.label}</span>
              <button onClick={() => setSelectedEntity(null)} className="text-amber-500/60 hover:text-amber-400">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={entityQuery}
              onChange={e => setEntityQuery(e.target.value)}
              placeholder="Chercher une entité du graphe…"
              className="flex-1 px-2 py-0.5 bg-slate-700/60 border border-slate-600/40 rounded text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/40"
              autoFocus
            />
          )}
        </div>

        {!selectedEntity && localEntityResults.length > 0 && (
          <div className="space-y-0.5 max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {localEntityResults.map(e => (
              <button
                key={e.uri}
                onClick={() => setSelectedEntity(e)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-amber-500/10 text-left transition-colors"
              >
                <span className="text-[10px] text-slate-300 flex-1">{e.label}</span>
                <span className="text-[9px] text-slate-600 font-mono">{e.uri?.split('/').pop()}</span>
              </button>
            ))}
          </div>
        )}

        {operatorRow}

        <div className="flex items-center justify-between">
          <button onClick={() => setStep('choice')} className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors">← Retour</button>
          {selectedEntity && (
            <button
              onClick={() => handleConfirm(FILTER_TYPES.ENTITY, selectedEntity.uri, selectedEntity.label)}
              className="text-[10px] px-3 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
            >
              Ajouter
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
};

// ── Main SearchModal ───────────────────────────────────────────────────────
const SearchModal = () => {
  // ─── Store state ───
  const searchModalOpen     = useGraphStore(s => s.searchModalOpen);
  const closeSearchModal    = useGraphStore(s => s.closeSearchModal);
  const openSearchModal     = useGraphStore(s => s.openSearchModal);
  const searchFilters       = useGraphStore(s => s.searchFilters);
  const searchResults       = useGraphStore(s => s.searchResults);
  const searchLoading       = useGraphStore(s => s.searchLoading);
  const searchQuery         = useGraphStore(s => s.searchQuery);
  const addFilter           = useGraphStore(s => s.addFilter);
  const removeFilter        = useGraphStore(s => s.removeFilter);
  const clearFilters        = useGraphStore(s => s.clearFilters);
  const setSearchQuery      = useGraphStore(s => s.setSearchQuery);
  const executeSearch       = useGraphStore(s => s.executeSearch);
  const selectNode          = useGraphStore(s => s.selectNode);
  const visibleNodeIds      = useGraphStore(s => s.visibleNodeIds);
  const searchHasMore       = useGraphStore(s => s.searchHasMore);
  const getSuggestedProperties = useGraphStore(s => s.getSuggestedProperties);
  const loadPropertyMatrix  = useGraphStore(s => s.loadPropertyMatrix);
  const propertyMatrixLoaded = useGraphStore(s => s.propertyMatrixLoaded);
  const propertyMatrix      = useGraphStore(s => s.propertyMatrix);
  const loadedNodes         = useGraphStore(s => s.loadedNodes);
  const loadedRelations     = useGraphStore(s => s.loadedRelations);
  const addNodeToGraph      = useGraphStore(s => s.addNodeToGraph);
  const searchScope         = useGraphStore(s => s.searchScope);
  const setSearchScope      = useGraphStore(s => s.setSearchScope);
  const searchHistory       = useGraphStore(s => s.searchHistory);
  const restoreFromHistory  = useGraphStore(s => s.restoreFromHistory);
  const taxonomyClasses     = useGraphStore(s => s.taxonomyClasses);

  const inputRef          = useRef(null);
  const debounceRef       = useRef(null);
  const filterDebounceRef = useRef(null);
  const resultsRef        = useRef(null);

  // §8.6 — Stable refs for store actions and guard values used inside useEffects.
  // Avoids spurious re-runs by keeping effect dep arrays minimal and accurate.
  const executeSearchRef   = useRef(executeSearch);
  const setSearchQueryRef  = useRef(setSearchQuery);
  const searchModalOpenRef = useRef(searchModalOpen);
  const searchQueryRef     = useRef(searchQuery);
  const searchFiltersRef   = useRef(searchFilters);
  useEffect(() => { executeSearchRef.current  = executeSearch;   }, [executeSearch]);
  useEffect(() => { setSearchQueryRef.current = setSearchQuery;  }, [setSearchQuery]);
  useEffect(() => { searchModalOpenRef.current = searchModalOpen; }, [searchModalOpen]);
  useEffect(() => { searchQueryRef.current    = searchQuery;     }, [searchQuery]);
  useEffect(() => { searchFiltersRef.current  = searchFilters;   }, [searchFilters]);

  // ─── Local state ───
  const [localQuery, setLocalQuery]               = useState('');
  const [selectedUris, setSelectedUris]           = useState(new Set());
  const [hierarchyPopoverFilterId, setHierarchyPopoverFilterId] = useState(null);
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1);
  const [searchExecuted, setSearchExecuted]       = useState(false);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [batchAddStatus, setBatchAddStatus]       = useState('');

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
      setShowFilterBuilder(false);
    }
  }, [searchModalOpen, propertyMatrixLoaded, loadPropertyMatrix]);

  // Auto-execute on filter change (250ms debounce).
  // Only `searchFilters` is a real trigger — other values are read via refs.
  useEffect(() => {
    if (!searchModalOpenRef.current) return;
    if (searchFilters.length === 0 && !searchQueryRef.current) return;

    clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      executeSearchRef.current();
      setSearchExecuted(true);
    }, 250);

    return () => clearTimeout(filterDebounceRef.current);
  }, [searchFilters]);

  // Search-as-you-type for local scopes.
  // Only `localQuery` and `searchScope` are real triggers — other values are read via refs.
  useEffect(() => {
    if (!searchModalOpenRef.current) return;

    clearTimeout(debounceRef.current);

    const filters = searchFiltersRef.current;
    if (searchScope === 'graph' || searchScope === 'visible') {
      if (localQuery.length >= 1 || filters.length > 0) {
        debounceRef.current = setTimeout(() => {
          setSearchQueryRef.current(localQuery);
          executeSearchRef.current();
          setSearchExecuted(true);
        }, 150);
      } else if (localQuery.length === 0 && filters.length === 0) {
        setSearchQueryRef.current('');
        setSearchExecuted(false);
      }
    }

    return () => clearTimeout(debounceRef.current);
  }, [localQuery, searchScope]);

  // Reset focused index when results change
  useEffect(() => {
    setFocusedResultIndex(-1);
  }, [searchResults]);

  // ─── Precalculate connectionsByUri (§8.2 fix: O(M) instead of O(N×M)) ───
  const connectionsByUri = useMemo(() => {
    const map = {};
    for (const rel of Object.values(loadedRelations)) {
      map[rel.source] = (map[rel.source] || 0) + 1;
      map[rel.target] = (map[rel.target] || 0) + 1;
    }
    return map;
  }, [loadedRelations]);

  // ─── Derived data ───
  const loadedCount = Object.keys(loadedNodes).length;
  const visibleCount = visibleNodeIds?.size || 0;

  const isQidInput = QID_PATTERN.test(localQuery.trim());

  const placeholder = useMemo(() => {
    if (searchScope === 'graph')    return `Filtrer dans les ${loadedCount} nœuds chargés…`;
    if (searchScope === 'wikidata') return 'Rechercher dans Wikidata…';
    if (searchScope === 'visible')  return `Filtrer les ${visibleCount} nœuds visibles…`;
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
      const typeQid = result.types?.[0]
        ? (result.types[0].startsWith('http') ? result.types[0].split('/').pop() : result.types[0])
        : null;
      typeSet.add(primaryType);
      if (!groups[primaryType]) groups[primaryType] = { typeQid, results: [] };
      groups[primaryType].results.push(result);
    }

    const sorted = Object.entries(groups).sort(([, a], [, b]) => b.results.length - a.results.length);
    return { groupedResults: sorted, stats: { total: searchResults.length, inGraph: inGraphCount, types: typeSet.size } };
  }, [searchResults]);

  // Flat list for keyboard navigation
  const flatResultUris = useMemo(() => {
    const uris = [];
    for (const [, { results }] of groupedResults) {
      for (const r of results) uris.push(r.uri);
    }
    return uris;
  }, [groupedResults]);

  const isPreSearch = !searchExecuted && localQuery === '' && searchFilters.length === 0;

  // ─── Filter rendering with OR group support ───
  const renderFilterBar = () => {
    const processedGroups = new Set();
    const orGroups = {};
    for (const f of searchFilters) {
      if (f.operator === 'or' && f.groupId) {
        if (!orGroups[f.groupId]) orGroups[f.groupId] = [];
        orGroups[f.groupId].push(f);
      }
    }

    return searchFilters.map(f => {
      if (f.operator === 'or' && f.groupId) {
        if (processedGroups.has(f.groupId)) return null;
        processedGroups.add(f.groupId);
        const groupFilters = orGroups[f.groupId];
        return (
          <div key={`group-${f.groupId}`} className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-1.5 py-1 space-y-0.5">
            {groupFilters.map((gf, idx) => (
              <div key={gf.id} className="flex items-center gap-1">
                {idx > 0 && <span className="text-[9px] font-bold text-amber-500/50 w-5 text-right shrink-0">ou</span>}
                {idx === 0 && <span className="w-5 shrink-0" />}
                <FilterRow
                  filter={gf}
                  onRemove={removeFilter}
                  onReplaceType={handleReplaceTypeFilter}
                  hierarchyOpen={hierarchyPopoverFilterId === gf.id}
                  onShowHierarchy={() => setHierarchyPopoverFilterId(hierarchyPopoverFilterId === gf.id ? null : gf.id)}
                  onHierarchyClose={() => setHierarchyPopoverFilterId(null)}
                />
              </div>
            ))}
          </div>
        );
      }
      return (
        <FilterRow
          key={f.id}
          filter={f}
          onRemove={removeFilter}
          onReplaceType={handleReplaceTypeFilter}
          hierarchyOpen={hierarchyPopoverFilterId === f.id}
          onShowHierarchy={() => setHierarchyPopoverFilterId(hierarchyPopoverFilterId === f.id ? null : f.id)}
          onHierarchyClose={() => setHierarchyPopoverFilterId(null)}
        />
      );
    });
  };

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

  // §8.5 fix: single onKeyDown on the input only (not on container)
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      closeSearchModal();
      return;
    }

    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        if (focusedResultIndex >= 0 && focusedResultIndex < flatResultUris.length) {
          const uri = flatResultUris[focusedResultIndex];
          if (!loadedNodes[uri]) addNodeToGraph(uri);
        }
        return;
      }
      if (focusedResultIndex >= 0 && focusedResultIndex < flatResultUris.length) {
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

  const handleReplaceTypeFilter = useCallback((filterId, qid, label) => {
    removeFilter(filterId);
    addFilter(createFilter(FILTER_TYPES.TYPE, qid, label));
    setHierarchyPopoverFilterId(null);
  }, [removeFilter, addFilter]);

  const toggleSelectUri = useCallback((uri) => {
    setSelectedUris(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }, []);

  // §8.4 fix: handleBatchAdd with per-iteration error handling
  const handleBatchAdd = useCallback(async () => {
    let success = 0, failed = 0;
    for (const uri of selectedUris) {
      try {
        if (!loadedNodes[uri]) await addNodeToGraph(uri);
        success++;
      } catch { failed++; }
    }
    setSelectedUris(new Set());
    if (failed > 0) {
      setBatchAddStatus(`${success} ajouté${success > 1 ? 's' : ''} · ${failed} échec${failed > 1 ? 's' : ''}`);
      setTimeout(() => setBatchAddStatus(''), 3000);
    }
  }, [selectedUris, loadedNodes, addNodeToGraph]);

  // §8.1 fix: searchInWikidata without setTimeout — Zustand set() is synchronous
  const handleSearchInWikidata = useCallback(() => {
    setSearchScope('wikidata');
    setSearchQuery(localQuery);
    executeSearch();
    setSearchExecuted(true);
  }, [setSearchScope, setSearchQuery, localQuery, executeSearch]);

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

        <ScopeSelector scope={searchScope} setScope={setSearchScope} loadedCount={loadedCount} visibleCount={visibleCount} />
      </div>

      {/* ── Filter Bar (shown when filters exist or builder is open) ── */}
      {(searchFilters.length > 0 || showFilterBuilder) && (
        <div className="px-4 pb-2 border-t border-slate-700/30 pt-2 space-y-1">
          {renderFilterBar()}

          {showFilterBuilder ? (
            <FilterBuilder
              onAddFilter={addFilter}
              taxonomyClasses={taxonomyClasses}
              loadedNodes={loadedNodes}
              propertyMatrix={propertyMatrix}
              searchFilters={searchFilters}
              onCancel={() => setShowFilterBuilder(false)}
            />
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setShowFilterBuilder(true)}
                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Ajouter un filtre
              </button>
              {searchFilters.length > 1 && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-[10px] text-slate-600 hover:text-red-400 transition-colors"
                >
                  × Tout effacer
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* "+ Ajouter un filtre" trigger when searching but no filters yet */}
      {searchFilters.length === 0 && !showFilterBuilder && !isPreSearch && (
        <div className="px-4 pb-1.5">
          <button
            onClick={() => setShowFilterBuilder(true)}
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Ajouter un filtre
          </button>
        </div>
      )}

      {/* Suggested properties drawer (below filter bar, when TYPE filter active) */}
      {activeTypeFilter && suggestedProperties.length > 0 && !showFilterBuilder && (
        <SuggestedPropertiesDrawer suggestedProperties={suggestedProperties} addFilter={addFilter} />
      )}

      {/* ── Body ── */}
      <div ref={resultsRef} className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent min-h-0 relative">
        {isPreSearch ? (
          <PreSearchBody
            addFilter={addFilter}
            searchHistory={searchHistory}
            restoreFromHistory={restoreFromHistory}
            selectNode={selectNode}
            closeSearchModal={closeSearchModal}
          />
        ) : groupedResults.length > 0 ? (
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
                connectionsByUri={connectionsByUri}
                style={idx < 6 ? { animation: `fade-in-stagger 0.2s ease-out ${idx * 0.05}s both` } : undefined}
              />
            ))}

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
                onSearchInWikidata={handleSearchInWikidata}
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
            statusMsg={batchAddStatus}
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
