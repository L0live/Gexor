import React from 'react';
import { Loader } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import PropertiesGrouped from '../../components/UI/PropertiesGrouped';

const PropertiesTab = () => {
  const selectedNode = useGraphStore(s => s.selectedNode);
  const selectNode = useGraphStore(s => s.selectNode);
  const visibleNodeIds = useGraphStore(s => s.visibleNodeIds);
  const addNodeToGraph = useGraphStore(s => s.addNodeToGraph);
  const loadingSelectedNodeProperties = useGraphStore(s => s.loadingSelectedNodeProperties);

  if (!selectedNode || selectedNode.isAggregate) return null;

  if (loadingSelectedNodeProperties) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm p-6">
        <Loader className="w-4 h-4 animate-spin text-blue-400" />
        <span>Chargement des propriétés…</span>
      </div>
    );
  }

  const propertiesCount = selectedNode.properties ? Object.keys(selectedNode.properties).length : 0;

  if (propertiesCount === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-sm space-y-2">
        <p>Aucune propriété chargée.</p>
        <p className="text-xs text-slate-600">Activez "Propriétés" dans la barre d'exploration pour charger les sortants.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <PropertiesGrouped
        nodeUri={selectedNode.id}
        properties={selectedNode.properties}
        totalPropertyCount={propertiesCount}
        selectNode={selectNode}
        visibleNodeIds={visibleNodeIds}
        addNodeToGraph={addNodeToGraph}
      />
    </div>
  );
};

export default PropertiesTab;
