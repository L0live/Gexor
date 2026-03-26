import React, { useMemo } from 'react';
import { ChevronUp, ChevronDown, Circle } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';

const TypeHierarchyPanel = ({ activeTypeQid, onSelectType, lang = 'fr', popoverMode = false }) => {
  const taxonomyClasses = useGraphStore(s => s.taxonomyClasses);
  const getTaxonomyLabel = useGraphStore(s => s.getTaxonomyLabel);

  const cls = taxonomyClasses[activeTypeQid];

  const parents = useMemo(() => {
    if (!cls?.parents) return [];
    return cls.parents
      .filter(p => taxonomyClasses[p])
      .map(p => ({
        qid: p,
        label: getTaxonomyLabel(p, lang),
        totalInstances: taxonomyClasses[p]?.totalInstances || 0,
      }));
  }, [cls, taxonomyClasses, getTaxonomyLabel, lang]);

  const children = useMemo(() => {
    if (!cls?.children) return [];
    return cls.children
      .filter(c => taxonomyClasses[c])
      .map(c => ({
        qid: c,
        label: getTaxonomyLabel(c, lang),
        totalInstances: taxonomyClasses[c]?.totalInstances || 0,
      }))
      .sort((a, b) => b.totalInstances - a.totalInstances);
  }, [cls, taxonomyClasses, getTaxonomyLabel, lang]);

  const currentLabel = getTaxonomyLabel(activeTypeQid, lang);
  const currentInstances = cls?.totalInstances || 0;

  const formatCount = (n) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  // In popover mode, render without the sidebar wrapper
  const containerClass = popoverMode
    ? 'overflow-y-auto max-h-[280px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent'
    : 'w-56 border-r border-slate-700/40 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent';

  return (
    <div className={containerClass}>
      <div className="p-3 space-y-1">
        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Naviguer dans la taxonomie P279</h4>

        {/* Parents (↑) */}
        {parents.map(p => (
          <button
            key={p.qid}
            onClick={() => onSelectType(p.qid, p.label)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-700/40 transition-colors group"
          >
            <ChevronUp className="w-3 h-3 text-slate-600 group-hover:text-blue-400 shrink-0" />
            <span className="text-[11px] text-slate-400 group-hover:text-slate-200 truncate flex-1">{p.label}</span>
            <span className="text-[9px] text-slate-600 font-mono shrink-0">{formatCount(p.totalInstances)}</span>
          </button>
        ))}

        {/* Current (●) */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <Circle className="w-3 h-3 text-red-400 fill-red-400 shrink-0" />
          <span className="text-[11px] text-red-300 font-bold truncate flex-1">{currentLabel}</span>
          <span className="text-[9px] text-red-400/60 font-mono shrink-0">{formatCount(currentInstances)}</span>
        </div>

        {/* Children (↓) */}
        {children.map(c => (
          <button
            key={c.qid}
            onClick={() => onSelectType(c.qid, c.label)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-slate-700/40 transition-colors group"
          >
            <ChevronDown className="w-3 h-3 text-slate-600 group-hover:text-blue-400 shrink-0" />
            <span className="text-[11px] text-slate-400 group-hover:text-slate-200 truncate flex-1">{c.label}</span>
            <span className="text-[9px] text-slate-600 font-mono shrink-0">{formatCount(c.totalInstances)}</span>
          </button>
        ))}

        {children.length === 0 && parents.length === 0 && (
          <p className="text-[10px] text-slate-600 italic px-2">Aucune hiérarchie disponible</p>
        )}

        {popoverMode && (children.length > 0 || parents.length > 0) && (
          <p className="text-[9px] text-slate-600 italic px-2 mt-2">Cliquer pour remplacer le filtre</p>
        )}
      </div>
    </div>
  );
};

export default TypeHierarchyPanel;
