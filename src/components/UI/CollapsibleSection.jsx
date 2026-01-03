import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const CollapsibleSection = ({ 
  id,
  title, 
  color, 
  icon: Icon,
  isOpen, 
  onToggle, 
  stats,
  children 
}) => {
  return (
    <div className="bg-slate-700/30 rounded-lg overflow-hidden">
      {/* En-tête minimal */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between hover:bg-slate-700/50 p-3 transition-colors"
      >
        <div className="flex items-center gap-3">
          {Icon ? (
            <Icon className="w-3 h-3 text-slate-400" />
          ) : (
            <div className={`w-3 h-3 ${color} rounded-full`}></div>
          )}
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {stats && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">{stats.label}:</span>
              <span className="font-bold text-white">{stats.value}</span>
            </div>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>
      
      {/* Contenu de la section */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-3 border-t border-slate-600/30">
          {children}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSection;
