import React from 'react';
import { X, Focus, Pin, ChevronRight, ChevronLeft } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';

const NodeDetailPanel = ({
  selectedNode,
  selectedEdge,
  nodes,
  connectedReecs,
  isPinned,
  toggleNodePin,
  clearSelectedNode,
  selectNode,
  onShowConnectedReecs
}) => {
  if (!selectedNode && !selectedEdge) return null;

  return (
    <div className="absolute bottom-4 right-4 w-[500px] min-h-[400px] bg-slate-900/80 backdrop-blur-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col z-30 transition-all duration-300 pointer-events-auto">
      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {/* Vue Node */}
        {selectedNode ? (
          <div className="flex flex-col h-full">
            <div className={`p-4 ${
              selectedNode.type === 'Entity' ? 'bg-gradient-to-br from-blue-600/30 to-blue-500/10' :
              selectedNode.type === 'Event' ? 'bg-gradient-to-br from-green-600/30 to-green-500/10' :
              'bg-gradient-to-br from-purple-600/30 to-purple-500/10'
            } border-b border-slate-700/30`}>
              <div className="flex items-start justify-between mb-2">
                <div className="text-[12px] font-bold text-slate-400 uppercase tracking-widest px-2.5 py-1">
                  {selectedNode.type}
                </div>
                <div className="flex items-center gap-2">
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
                  <div className="w-px h-6 bg-slate-700/50 mx-1" />
                  <button
                    onClick={clearSelectedNode}
                    className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between mb-2">
                <h2 className="text-2xl font-black text-white leading-tight">
                  {selectedNode.label}
                </h2>
                
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {selectedNode.temporal?.start && (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-0.5">Chronologie</span>
                      <span className="text-[12px] font-bold text-slate-300">
                        {selectedNode.temporal.start} {selectedNode.temporal.end && `— ${selectedNode.temporal.end}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <div className="flex items-center gap-3 pl-2">
                  <span className="text-slate-400 text-xs font-medium">
                    {selectedNode.subtype} {selectedNode.category ? '• ' + selectedNode.category : ''}
                  </span>
                </div>
                {selectedNode.locations?.length > 0 && (
                  <div className="flex flex-col items-end max-w-[200px]">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-0.5">Géographie</span>
                    <span className="text-[12px] font-bold text-slate-300 text-right">
                      {selectedNode.locations.join(' • ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Details Section integrated */}
              <div className="space-y-2">
                {selectedNode.summaryDetailed && selectedNode.summaryDetailed !== selectedNode.summary && (
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Détails</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{selectedNode.summaryDetailed}</p>
                  </div>
                )}
                
                {selectedNode.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.tags.map((tag, i) => (
                      <span key={i} className="px-1.5 py-1 bg-blue-500/10 text-blue-400/80 rounded-lg text-[10px] border border-blue-500/20 font-bold lowercase">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={onShowConnectedReecs}
                  className="p-1.5 bg-slate-800/40 rounded-2xl border border-slate-700/30 text-left group hover:border-green-500/30 transition-colors"
                >
                  <div className="flex justify-around gap-2 items-center">
                    <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-green-400 transition-colors" />
                    <span className="text-md text-slate-400 font-bold">Connexions ({connectedReecs.length})</span>
                  </div>
                </button>
                <div className="flex items-center justify-center bg-slate-800/40 rounded-2xl border border-slate-700/30 group hover:border-blue-500/30 transition-colors">
                  <span className="text-md font-bold text-slate-400">Confiance: {Math.round((selectedNode.confiance || 0) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
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
                <span className="font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">{nodes.find(n => n.id === selectedEdge.source)?.label}</span>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <span className="font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded">{nodes.find(n => n.id === selectedEdge.target)?.label}</span>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {selectedEdge.description && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Description</h3>
                  <p className="text-slate-300 text-sm leading-relaxed">{selectedEdge.description}</p>
                </div>
              )}

              {selectedEdge.confiance && (
                <div className="p-5 bg-blue-600/5 rounded-2xl border border-blue-500/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-blue-400 uppercase font-black tracking-widest">Confiance</span>
                    <span className="text-xl font-black text-blue-300 italic">{Math.round((selectedEdge.confiance || 0) * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: `${selectedEdge.confiance * 100}%` }} />
                  </div>
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
