import React, { useMemo } from 'react';
import { Moon } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { COLOR_MAP } from '../../constants/graphConstants';

const Minimap = () => {
  const nodes = useGraphStore(state => state.nodes);
  const positions = useGraphStore(state => state.positions);
  const selectedNode = useGraphStore(state => state.selectedNode);
  const selectNode = useGraphStore(state => state.selectNode);
  const simulationStable = useGraphStore(state => state.simulationStable);
  const simulationPaused = useGraphStore(state => state.simulationPaused);
  
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
    <div className="absolute top-4 right-4 w-[150px] h-[150px] bg-black/60 border border-white/20 rounded-lg overflow-hidden backdrop-blur-md pointer-events-auto">
      <div className="absolute top-2 left-2 text-[10px] text-white/40 uppercase tracking-widest font-bold pointer-events-none">
        Minimap
      </div>

      {/* Indicateur de simulation stable/endormie */}
      {simulationStable && !simulationPaused && (
        <div 
          className="absolute top-2 right-2"
          title="Simulation en veille (stable)"
        >
          <Moon className="w-4 h-4 text-blue-400" />
        </div>
      )}
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
          
          return (
            <circle
              key={node.id}
              cx={pos.x}
              cy={pos.z + 10}
              r={isSelected ? 12 / scale : 6 / scale}
              fill={COLOR_MAP[node.type] || COLOR_MAP.Default}
              stroke={isSelected ? 'white' : 'none'}
              strokeWidth={2 / scale}
              className="cursor-pointer hover:brightness-125 transition-all"
              onClick={() => selectNode(node.id)}
            />
          );
        })}
      </svg>
    </div>
  );
};

export default Minimap;
