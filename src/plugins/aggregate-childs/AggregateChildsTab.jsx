import React, { useState, useCallback } from 'react';
import { Loader, Plus, Layers } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';

const AggregateChildsTab = () => {
  const selectedNode = useGraphStore(s => s.selectedNode);
  const loadedAggregates = useGraphStore(s => s.loadedAggregates);
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const expandAggregateForList = useGraphStore(s => s.expandAggregateForList);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);
  const selectNode = useGraphStore(s => s.selectNode);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  if (!selectedNode?.isAggregate) return null;

  const aggregateId = selectedNode.aggregateId;
  const aggNode = loadedAggregates[aggregateId];

  if (!aggNode) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm">
        <Layers className="w-8 h-8 text-slate-700 mx-auto mb-2" />
        <p>Données d'agrégat non disponibles.</p>
      </div>
    );
  }

  const children = aggNode.children || [];

  const handleFetchList = useCallback(async () => {
    if (children.length > 0) return;
    setLoading(true);
    try {
      await expandAggregateForList(aggregateId);
    } catch (err) {
      console.warn('[AggregateChildsTab] Failed to fetch children:', err);
    }
    setLoading(false);
  }, [aggregateId, children.length, expandAggregateForList]);

  const filteredChildren = filter
    ? children.filter(uri => {
        const node = loadedNodes[uri];
        return node?.label?.toLowerCase().includes(filter.toLowerCase());
      })
    : children;

  return (
    <div className="flex flex-col h-full">
      {children.length === 0 ? (
        <div className="p-6 text-center space-y-3">
          <Layers className="w-8 h-8 text-violet-700 mx-auto" />
          <p className="text-slate-400 text-sm">
            <span className="font-bold text-violet-300">{aggNode.count}</span> entités disponibles
          </p>
          <button
            onClick={handleFetchList}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-all text-sm font-bold disabled:opacity-50"
          >
            {loading
              ? <><Loader className="w-3 h-3 animate-spin inline mr-2" />Chargement…</>
              : 'Charger la liste'
            }
          </button>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2 p-2 border-b border-slate-700/20 shrink-0">
            <input
              type="text"
              placeholder="Filtrer…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="flex-1 bg-slate-800/50 border border-slate-700/30 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 placeholder-slate-600 outline-none focus:border-slate-600"
            />
            <button
              onClick={() => children.forEach(uri => addNodeToGraph(uri))}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 border border-violet-500/20 transition-all whitespace-nowrap"
              title="Tout ajouter au graphe"
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" />
              Tout ({children.length})
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {filteredChildren.map(childUri => {
              const child = loadedNodes[childUri];
              if (!child) return null;
              return (
                <div
                  key={childUri}
                  className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-800/40 transition-colors group"
                >
                  <button onClick={() => selectNode(childUri)} className="flex-1 text-left min-w-0">
                    <div className="text-[11px] font-bold text-slate-300 truncate group-hover:text-white transition-colors">
                      {child.label}
                    </div>
                    {child.description && (
                      <div className="text-[9px] text-slate-600 truncate">{child.description}</div>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); addNodeToGraph(childUri); }}
                    className="shrink-0 p-1 rounded text-slate-600 hover:text-violet-400 hover:bg-violet-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Ajouter au graphe"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {filteredChildren.length === 0 && filter && (
              <div className="text-center text-slate-600 text-xs py-4">Aucun résultat pour "{filter}"</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AggregateChildsTab;
