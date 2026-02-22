import React from 'react';
import { X, ChevronRight } from 'lucide-react';

/**
 * Panneau flottant réutilisable pour afficher une liste de nodes ou relations.
 * Utilisé à la fois dans SettingsPanel (global) et GroupInfoPanel (par groupe).
 */
const FloatingListPanel = ({
  nodes,
  edges,
  activeKey,
  onClose,
  selectNode,
  selectEdge
}) => {
  const activeConfig = {
    entityNodes: { title: 'Entities', type: 'Entity' },
    eventNodes: { title: 'Events', type: 'Event' },
    contextNodes: { title: 'Contexts', type: 'Context' },
    relationsList: { title: 'Relations', type: 'Relations' }
  }[activeKey];

  if (!activeConfig) return null;

  const isRel = activeKey === 'relationsList';
  const items = isRel ? edges : nodes.filter(n => n.type === activeConfig.type);

  return (
    <div className="min-w-50 max-w-80 bg-slate-900/80 backdrop-blur-md rounded-2xl shadow-2xl flex flex-col max-h-[45vh] transition-all duration-300 pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-left-4">
      <div className="p-3 border-b border-slate-700 flex items-center justify-between bg-slate-900/30">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            {activeConfig.title} List
          </h3>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="p-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        <div className="space-y-1.5">
          {items.map(item => {
            if (isRel) {
              const s = nodes.find(n => n.id === item.source);
              const t = nodes.find(n => n.id === item.target);
              return (
                <div key={item.id} 
                  className="p-2.5 bg-slate-800/20 hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 rounded-xl cursor-pointer group transition-all"
                  onClick={() => selectEdge(item.id)}
                >
                  <div className="text-[11px] text-slate-100 font-semibold mb-1 group-hover:text-blue-400 truncate">{item.label || item.type}</div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="truncate max-w-[100px]">{s?.label}</span>
                    <ChevronRight className="w-2 h-2" />
                    <span className="truncate max-w-[100px]">{t?.label}</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={item.id}
                className="p-2.5 bg-slate-800/20 hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 rounded-xl cursor-pointer group transition-all"
                onClick={() => selectNode(item.id)}
              >
                <div className="text-[11px] font-bold text-slate-100 group-hover:text-blue-400 truncate mb-0.5">{item.label}</div>
                <div className="text-[10px] text-slate-500 font-medium">{item.subtype}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FloatingListPanel;
