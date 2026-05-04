import React from 'react';
import { Loader, Download } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { usePluginData } from '../../hooks/usePluginData';
import { PropertiesContent } from './PropertiesContent';

const PropertiesTab = () => {
  const selectedNode  = useGraphStore(s => s.selectedNode);
  const selectNode    = useGraphStore(s => s.selectNode);
  const visibleNodeIds = useGraphStore(s => s.visibleNodeIds);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);

  const { properties } = usePluginData(selectedNode?.id);

  if (!selectedNode || selectedNode.isAggregate) return null;

  if (properties.isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm p-6">
        <Loader className="w-4 h-4 animate-spin text-blue-400" />
        <span>Chargement des propriétés…</span>
      </div>
    );
  }

  if (!properties.isLoaded || !properties.data || Object.keys(properties.data).length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm space-y-3">
        <p>Aucune propriété chargée.</p>
        <button
          onClick={properties.load}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          Charger les propriétés
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto p-2">
      <PropertiesContent
        properties={properties.data}
        selectNode={selectNode}
        visibleNodeIds={visibleNodeIds}
        addNodeToGraph={addNodeToGraph}
      />
    </div>
  );
};

export default React.memo(PropertiesTab);
