import React from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

const RelationsSection = ({ 
  edges, 
  nodes,
  filters, 
  filterModes,
  opacityLevels,
  isOpen,
  isRelationsListOpen,
  onToggle,
  onRelationsListToggle,
  toggleFilter,
  setFilterMode,
  setOpacityLevel,
  selectEdge
}) => {
  const visibleCount = edges.filter(e => filters['Relations']).length;

  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden">
      {/* En-tête minimal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:bg-slate-700/50 p-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            Relations
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-300">{edges.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500">Visibles:</span>
              <span className="font-bold text-slate-400">{visibleCount}</span>
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
            Liens et relations entre les différents éléments du graphe.
          </div>

          {/* Toggle Affichage */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Affichage</span>
            <button
              type="button"
              onClick={() => toggleFilter('Relations')}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                filters['Relations'] ? 'bg-slate-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  filters['Relations'] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          
          {/* Slider d'opacité (appliqué quand affichage est activé) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Niveau d'opacité</span>
              <span className="text-xs font-mono text-slate-400">{Math.round(opacityLevels.Relations * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <EyeOff 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel('Relations', 0)}
                title="Opacité minimale (0%)"
              />
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.05"
                value={opacityLevels.Relations}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setOpacityLevel('Relations', value);
                }}
                className="flex-1 h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-slate-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <Eye 
                className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
                onClick={() => setOpacityLevel('Relations', 0.5)}
                title="Opacité maximale (50%)"
              />
            </div>
          </div>
          
          {/* Liste des relations - Section rétractable */}
          {edges.length > 0 && (
            <div className="border-t border-slate-600/30 pt-3">
              <button
                onClick={onRelationsListToggle}
                className="w-full flex items-center justify-between hover:bg-slate-700/30 p-2 rounded transition-colors"
              >
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  Relations ({edges.length})
                </span>
                {isRelationsListOpen ? (
                  <ChevronUp className="w-3 h-3 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                )}
              </button>
              
              {isRelationsListOpen && (
                <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
                  {edges.map(edge => {
                    const sourceNode = nodes.find(n => n.id === edge.source);
                    const targetNode = nodes.find(n => n.id === edge.target);
                    return (
                      <div key={edge.id} className="p-2 bg-slate-700/50 rounded hover:bg-slate-700 transition-colors">
                        <div className="text-xs text-slate-400 mb-1">{edge.label}</div>
                        <div className="text-xs text-slate-500">
                          {sourceNode?.label} → {targetNode?.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RelationsSection;
