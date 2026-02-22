import React from 'react';
import { X, Network, Orbit } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';

const ConnectedReecsPanel = ({
  selectedNode,
  connectedReecs,
  selectNode,
  onClose
}) => {
  if (!selectedNode) return null;

  return (
    <div className="absolute right-[530px] bottom-4 min-w-50 max-w-80 max-h-[400px] bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-2xl flex flex-col z-40 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3 pr-2">
          <Network className="w-5 h-5 text-white" />
          <h3 className="text-sm font-black text-white leading-tight">REECs Connectés</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {connectedReecs.length > 0 ? (
          connectedReecs.map(reec => (
            <div 
              key={reec.reec_id} 
              className="group gap-4 p-3 bg-slate-800/20 hover:bg-slate-800/50 rounded-2xl transition-all border border-transparent hover:border-slate-700/50 cursor-pointer"
              onClick={() => {
                const { triggerCenterOnNode } = useGraphStore.getState();
                triggerCenterOnNode(reec.reec_id);
                selectNode(reec.reec_id);
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-slate-200 truncate group-hover:text-white transition-colors leading-none mb-1">
                  {reec.label}
                </div> 
                <div className={`text-[10px] font-bold uppercase tracking-tighter opacity-80 ${
                  reec.type === 'Entity' ? 'text-blue-500/90' :
                  reec.type === 'Event' ? 'text-green-500/90' : 
                  'text-purple-500/90'
                }`}>
                  {reec.type} {reec.subtype && `• ${reec.subtype}`}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3 py-10 opacity-30">
            <Orbit className="w-10 h-10 stroke-[1.5]" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">Désert de connexions</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectedReecsPanel;
