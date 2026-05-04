import React from 'react';
import { Plus } from 'lucide-react';

/**
 * Affiche les entités sémantiquement similaires déjà présentes dans le store.
 * Lecture pure — aucun fetch SPARQL déclenché ici.
 *
 * @param {{ nodes: Array, onSelectNode: (uri:string)=>void, onAddNode: (uri:string)=>void }} props
 */
const InGraphSection = ({ nodes, onSelectNode, onAddNode }) => {
  if (nodes.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-slate-500 italic">
        Aucun similaire dans le graphe.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map(node => {
        const dots = Math.min(node.sharedCount, 3);
        return (
          <div
            key={node.uri}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800/40 cursor-pointer group"
            onClick={() => onSelectNode(node.uri)}
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

            {/* Score visuel (dots) */}
            <span className="flex gap-0.5 shrink-0" title={`${node.sharedCount} propriété(s) commune(s)`}>
              {Array.from({ length: dots }).map((_, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              ))}
            </span>

            {/* Bouton ajouter si hors-vue */}
            {!node.isVisible && (
              <button
                className="shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                onClick={e => { e.stopPropagation(); onAddNode(node.uri); }}
                title="Ajouter au graphe"
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default InGraphSection;
