import React from 'react';
import { Users } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { useConnectedNodes } from '../../hooks/useConnectedNodes';
import { getCategoryColor } from '../../constants/graphConstants';

const ClassificationBadge = ({ classification }) => {
  const colors = {
    'primary': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'context-dependent': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    'unclassified': 'bg-slate-700/30 text-slate-500 border-slate-700/30',
    'secondary': 'bg-slate-800/30 text-slate-600 border-slate-700/20',
  };
  const style = colors[classification] || colors.unclassified;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded border ${style}`}>
      {classification === 'context-dependent' ? 'ctx' : classification?.slice(0, 3)}
    </span>
  );
};

const AssociatesTab = () => {
  const selectedNode = useGraphStore(s => s.selectedNode);
  const selectNode = useGraphStore(s => s.selectNode);

  const connectedNodes = useConnectedNodes(selectedNode?.id);

  if (!selectedNode) return null;

  if (connectedNodes.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <Users className="w-8 h-8 text-slate-700 mx-auto" />
        <p className="text-slate-500 text-sm">Aucun nœud associé chargé.</p>
        <p className="text-xs text-slate-600">Activez "Associés" dans la barre d'exploration pour charger les entrants.</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-0.5">
      <div className="px-2 py-1 text-[10px] text-slate-600 font-bold uppercase tracking-wider">
        {connectedNodes.length} nœuds connectés
      </div>
      {connectedNodes.map(node => (
        <button
          key={node.uri}
          onClick={() => selectNode(node.uri)}
          className="w-full text-left flex items-start gap-2 p-2 rounded-xl hover:bg-slate-800/40 transition-colors group"
        >
          <div
            className="shrink-0 w-2 h-2 rounded-full mt-1.5"
            style={{ backgroundColor: getCategoryColor(node.type) }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12px] font-bold text-slate-300 truncate group-hover:text-white transition-colors">
                {node.label}
              </span>
              <ClassificationBadge classification={node.bestClassification} />
            </div>
            {node.description && (
              <div className="text-[10px] text-slate-600 truncate mt-0.5">{node.description}</div>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {node.relations.slice(0, 3).map((r, i) => (
                <span
                  key={i}
                  className={`text-[9px] px-1.5 py-0.5 rounded border ${
                    r.direction === 'outgoing'
                      ? 'bg-teal-500/10 text-teal-500 border-teal-500/20'
                      : 'bg-slate-700/30 text-slate-500 border-slate-700/30'
                  }`}
                >
                  {r.direction === 'outgoing' ? '→' : '←'} {r.label || r.pid}
                </span>
              ))}
              {node.relations.length > 3 && (
                <span className="text-[9px] text-slate-600">+{node.relations.length - 3}</span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default AssociatesTab;
