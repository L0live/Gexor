import React from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Info } from 'lucide-react';

const FilterSection = ({ 
  type, 
  color, 
  description, 
  nodes, 
  filters, 
  filterModes,
  opacityLevels,
  stats,
  isOpen,
  isNodesListOpen,
  onToggle,
  onNodesListToggle,
  toggleFilter,
  setFilterMode,
  setOpacityLevel,
  selectNode
}) => {
  const typeColor = {
    Entity: { bg: 'bg-blue-500', text: 'text-blue-400', hover: 'hover:bg-blue-600/30', from: 'bg-blue-600/20' },
    Event: { bg: 'bg-purple-500', text: 'text-purple-400', hover: 'hover:bg-purple-600/30', from: 'bg-purple-600/20' },
    Context: { bg: 'bg-green-500', text: 'text-green-400', hover: 'hover:bg-green-600/30', from: 'bg-green-600/20' }
  }[type];

  const maxOpacity = type === 'Relations' ? 0.5 : 1;
  const filteredNodes = nodes.filter(n => n.type === type);
  const visibleCount = filteredNodes.filter(n => filters[type]).length;

  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden">
      {/* En-tête minimal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:bg-slate-700/50 p-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 ${color} rounded-full`}></div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            {type}
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-300">{stats.total}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Visibles:</span>
              <span className={`font-bold ${typeColor.text}`}>{visibleCount}</span>
            </div>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      
      {/* Contenu de la section */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-3 border-t border-slate-600/30">
          {/* Description */}
          <div className="pt-2 text-xs text-slate-400">
            {description}
          </div>

          {/* Toggle Affichage */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Affichage</span>
            <button
              type="button"
              onClick={() => toggleFilter(type)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                filters[type] ? color.replace('bg-', 'bg-').replace('-500', '-600') : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  filters[type] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          
          {/* Slider d'opacité (appliqué quand affichage est activé) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Niveau d'opacité</span>
              <span className="text-xs font-mono text-slate-400">{Math.round(opacityLevels[type] * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <EyeOff 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel(type, 0)}
                title="Opacité minimale (0%)"
              />
              <input
                type="range"
                min="0"
                max={maxOpacity}
                step="0.05"
                value={opacityLevels[type]}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setOpacityLevel(type, value);
                }}
                className={`flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:${color} [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:${color} [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer`}
              />
              <Eye 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel(type, maxOpacity)}
                title={`Opacité maximale (${Math.round(maxOpacity * 100)}%)`}
              />
            </div>
          </div>
          
          {/* Liste des nodes - Section rétractable */}
          {filteredNodes.length > 0 && (
            <div className="border-t border-slate-600/30 pt-3">
              <button
                onClick={onNodesListToggle}
                className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
              >
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Nodes ({filteredNodes.length})
                </span>
                {isNodesListOpen ? (
                  <ChevronUp className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                )}
              </button>
              
              {isNodesListOpen && (
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                  {filteredNodes.map(node => (
                    <div key={node.id} className="flex items-start gap-2 p-2 bg-slate-700/50 rounded hover:bg-slate-700 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">{node.label}</div>
                        <div className="text-xs text-slate-500">{node.subtype}</div>
                      </div>
                      <button
                        onClick={() => selectNode(node.id)}
                        className={`p-1 ${typeColor.from} ${typeColor.hover} ${typeColor.text} rounded transition-colors flex-shrink-0`}
                        title="Sélectionner"
                      >
                        <Info className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterSection;
