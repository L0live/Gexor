import React from 'react';
import { Loader, RefreshCw } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { usePluginData } from '../../hooks/usePluginData';
import InGraphSection from './InGraphSection';

const ClusterSharedTab = () => {
  const selectedNode  = useGraphStore(s => s.selectedNode);
  const selectNode    = useGraphStore(s => s.selectNode);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);

  const nodeUri = selectedNode?.id;
  const { shared } = usePluginData(nodeUri);

  if (!selectedNode) return null;

  return (
    <div className="flex flex-col gap-3 p-2">

      {/* ── Section : Dans le graphe ── */}
      {shared.isLoaded && (
        <section>
          <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Dans le graphe
            {shared.nodes.length > 0 && (
              <span className="ml-1.5 text-slate-400 font-normal normal-case">
                ({shared.nodes.length})
              </span>
            )}
          </div>
          <InGraphSection
            nodes={shared.nodes}
            onSelectNode={selectNode}
            onAddNode={addNodeToGraph}
          />
        </section>
      )}

      {/* ── Section : Similaires ── */}
      <section>
        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Similaires
        </div>

        {/* Bouton déclencheur */}
        {!shared.isLoading && (
          <div className="px-3 py-1">
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-slate-300 bg-slate-800/60 hover:bg-slate-700/60 transition-colors disabled:opacity-40"
              onClick={shared.load}
              disabled={shared.isLoading}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {shared.isLoaded ? 'Recalculer' : 'Calculer les similaires'}
            </button>
          </div>
        )}

        {/* Spinner */}
        {shared.isLoading && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-slate-400">
            <Loader className="w-3.5 h-3.5 animate-spin" />
            Recherche en cours…
          </div>
        )}

        {/* Liste complète après chargement */}
        {shared.isLoaded && !shared.isLoading && (
          shared.nodes.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-500 italic">
              Aucun similaire trouvé.
            </p>
          ) : (
            <div className="space-y-0.5">
              {shared.nodes.map(node => {
                const dots = Math.min(node.sharedCount, 3);
                return (
                  <div
                    key={node.uri}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800/40 cursor-pointer group"
                    onClick={() => selectNode(node.uri)}
                  >
                    {/* Indicateur de visibilité */}
                    <span
                      className={`shrink-0 w-2 h-2 rounded-full ${node.isVisible ? 'bg-sky-400' : 'border border-slate-500'}`}
                      title={node.isVisible ? 'Visible dans la scène' : 'Chargé, hors vue'}
                    />

                    {/* Label */}
                    <span className="flex-1 text-[12px] text-slate-200 truncate" title={node.label}>
                      {node.label}
                    </span>

                    {/* Score visuel */}
                    <span className="flex gap-0.5 shrink-0" title={`${node.sharedCount} propriété(s) commune(s)`}>
                      {Array.from({ length: dots }).map((_, i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                      ))}
                    </span>

                    {/* Badge ou bouton selon visibilité */}
                    {node.isVisible ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] text-sky-400 border border-sky-800/60">
                        Dans le graphe
                      </span>
                    ) : (
                      <button
                        className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                        onClick={e => { e.stopPropagation(); addNodeToGraph(node.uri); }}
                        title="Ajouter au graphe"
                      >
                        + Ajouter
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </section>

    </div>
  );
};

export default React.memo(ClusterSharedTab);
