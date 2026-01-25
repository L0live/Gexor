import React, { useMemo } from 'react';
import { Moon } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';

const Minimap = () => {
  const nodes = useGraphStore(state => state.nodes);
  const positions = useGraphStore(state => state.positions);
  const selectedNode = useGraphStore(state => state.selectedNode);
  const selectNode = useGraphStore(state => state.selectNode);
  const simulationStable = useGraphStore(state => state.simulationStable);
  const simulationPaused = useGraphStore(state => state.simulationPaused);
  const layoutMode = useGraphStore(state => state.layoutMode);
  
  // Calculer les limites pour le cadrage
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let hasNodes = false;
    
    Object.values(positions).forEach(pos => {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.z < minZ) minZ = pos.z;
      if (pos.z > maxZ) maxZ = pos.z;
      hasNodes = true;
    });
    
    if (!hasNodes) return { x: -100, z: -100, width: 200, height: 200 };
    
    const padding = 50;
    return {
      x: minX - padding,
      z: minZ - padding,
      width: (maxX - minX) + padding * 2,
      height: (maxZ - minZ) + padding * 2
    };
  }, [positions]);

  const size = 150; // Taille de la minimap en pixels
  const scale = size / Math.max(bounds.width, bounds.height, 1);

  return (
    <div className="absolute bottom-4 right-4 w-[150px] h-[150px] bg-black/60 border border-white/20 rounded-lg overflow-hidden backdrop-blur-md pointer-events-auto">
      <svg 
        width={size} 
        height={size} 
        viewBox={`${bounds.x} ${bounds.z} ${bounds.width} ${bounds.height}`}
        className="w-full h-full"
      >
        {/* Nodes */}
        {nodes.map(node => {
          const pos = positions[node.id];
          if (!pos) return null;
          
          const isSelected = selectedNode?.id === node.id;
          const colorMap = {
            'Entity': '#3b82f6',
            'Event': '#8b5cf6',
            'Context': '#10b981'
          };
          
          return (
            <circle
              key={node.id}
              cx={pos.x}
              cy={pos.z}
              r={isSelected ? 12 / scale : 6 / scale}
              fill={colorMap[node.type] || '#64748b'}
              stroke={isSelected ? 'white' : 'none'}
              strokeWidth={2 / scale}
              className="cursor-pointer hover:brightness-125 transition-all"
              onClick={() => selectNode(node.id)}
            />
          );
        })}
      </svg>
      <div className="absolute top-1 left-2 text-[10px] text-white/40 uppercase tracking-widest font-bold pointer-events-none">
        Minimap
      </div>

      {/* Indicateur de simulation stable/endormie */}
      {layoutMode === 'force' && simulationStable && !simulationPaused && (
        <Moon
          className="absolute bottom-2 right-2 w-4 h-4 text-blue-400"
          title="Simulation en veille (stable)"
        />
      )}
    </div>
  );
};

export default Minimap;
