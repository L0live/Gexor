import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Layers, Link as LinkIcon, Calendar, User, ShieldCheck, Filter, ChevronDown, ChevronUp } from 'lucide-react';

const CATEGORIES = {
  Entity: {
    icon: User,
    label: 'Entities',
    color: 'bg-blue-500',
    textColor: 'text-blue-400',
    hoverColor: 'hover:bg-blue-600/30',
    fromColor: 'bg-blue-600/20',
    description: 'Entités représentant des personnes, lieux ou organisations.',
    statsKey: 'entities'
  },
  Event: {
    icon: Calendar,
    label: 'Events',
    color: 'bg-green-500',
    textColor: 'text-green-400',
    hoverColor: 'hover:bg-green-600/30',
    fromColor: 'bg-green-600/20',
    description: 'Événements majeurs ayant marqué la période étudiée.',
    statsKey: 'events'
  },
  Context: {
    icon: Layers,
    label: 'Contexts',
    color: 'bg-purple-500',
    textColor: 'text-purple-400',
    hoverColor: 'hover:bg-purple-600/30',
    fromColor: 'bg-purple-600/20',
    description: 'Éléments contextuels définissant le cadre historique.',
    statsKey: 'contexts'
  },
  Relations: {
    icon: LinkIcon,
    label: 'Links',
    color: 'bg-slate-400',
    textColor: 'text-slate-400',
    hoverColor: 'hover:bg-slate-500/30',
    fromColor: 'bg-slate-500/20',
    description: 'Liens et relations entre les différents éléments du graphe.',
    statsKey: 'relations'
  }
};

const UnifiedFilterSection = ({
  nodes,
  edges,
  filters,
  opacityLevels,
  stats,
  showFiltersSubSection,
  onToggleList,
  toggleFilter,
  setOpacityLevel,
  selectNode,
  selectEdge,
  setAdvancedFilter,
  title = "Filtres",
  headerStats = []
}) => {
  const [activeCategory, setActiveCategory] = useState('Entity');
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  const category = CATEGORIES[activeCategory];
  const isRelations = activeCategory === 'Relations';
  
  const maxOpacity = 1.5; // Support up to 150% for highlight
  const currentOpacity = opacityLevels[activeCategory];
  const isVisible = filters[activeCategory];

  // Map activeCategory to the keys used in showFiltersSubSection
  const subSectionKey = activeCategory.toLowerCase();
  const listSectionKey = isRelations ? 'relationsList' : `${subSectionKey}Nodes`;

  const isListOpen = showFiltersSubSection[listSectionKey];

  const filteredItems = isRelations 
    ? edges 
    : nodes.filter(n => n.type === activeCategory);
  
  const totalCount = isRelations ? edges.length : (stats[category.statsKey] || 0);
  const visibleCount = isVisible ? totalCount : 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Header with Stats and Toggle */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-2 rounded hover:bg-slate-800/40 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <Filter className={`w-4 h-4 transition-colors ${isCollapsed ? 'text-slate-500' : 'text-blue-400'}`} />
          <h3 className={`text-xs font-semibold uppercase tracking-wider transition-colors ${isCollapsed ? 'text-slate-500' : 'text-slate-300'}`}>
            {title}
          </h3>
        </div>
        
        <div className="flex gap-3">
          {headerStats.map((stat, idx) => (
            <div key={idx} className="flex items-center text-[10px] gap-1">
              <span className="text-slate-500">{stat.label}:</span>
              <span className={`font-bold ${stat.color || 'text-white'}`}>{stat.value}</span>
            </div>
          ))}
          {isCollapsed ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronUp className="w-3 h-3 text-slate-500 group-hover:text-slate-300" />}
        </div>
      </button>

      {!isCollapsed && (
        <div className="bg-slate-900/30 rounded-lg overflow-hidden border border-slate-800/50 flex flex-row">
          {/* Vertical Confidence Slider Sidebar */}
          <div className="flex flex-col items-center gap-3 py-3 px-1.5 bg-slate-900/50 border-r border-slate-800/50 w-11 flex-shrink-0" title="Confiance minimale">
            <div className="flex flex-col items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span className="text-[9px] font-mono text-blue-400 w-full text-center">{Math.round((filters.minConfiance || 0) * 100)}%</span>
            </div>
            <div className="relative flex-1 flex items-center justify-center w-full min-h-[120px]">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={filters.minConfiance || 0}
                onChange={(e) => setAdvancedFilter('minConfiance', parseFloat(e.target.value))}
                className="h-full w-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500/90"
                style={{ WebkitAppearance: 'slider-vertical' }}
              />
            </div>
          </div>

          {/* Category Selection Tabs - Vertical Left Sidebar */}
          <div className="flex flex-col bg-slate-900/50 p-1 gap-1 border-r border-slate-800/30">
            {Object.entries(CATEGORIES).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const isActive = activeCategory === key;
              return (
                <button
                  key={key}
                  onClick={() => {
                    const isAlreadyActive = activeCategory === key;
                    setActiveCategory(key);
                    
                    const isAnyListOpen = showFiltersSubSection.entityNodes || 
                                        showFiltersSubSection.eventNodes || 
                                        showFiltersSubSection.contextNodes || 
                                        showFiltersSubSection.relationsList;

                    if (isAnyListOpen && !isAlreadyActive) {
                      const subKey = key.toLowerCase();
                      const targetKey = key === 'Relations' ? 'relationsList' : `${subKey}Nodes`;
                      onToggleList(targetKey);
                    }
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-1 rounded-l-lg transition-all ${
                    isActive 
                      ? `${cfg.fromColor} ${cfg.textColor} shadow-sm ring-1 ring-slate-600/50` 
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                  }`}
                  title={cfg.label}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="p-3 space-y-3 flex-1 overflow-hidden">
            {/* Description */}
            <div className="text-[11px] text-slate-400 leading-relaxed italic">
              {category.description}
            </div>

            {/* Toggle Display */}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs font-medium text-slate-300">Affichage Global</span>
              <button
                type="button"
                onClick={() => toggleFilter(activeCategory)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  isVisible ? category.color : 'bg-slate-500'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isVisible ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            
            {/* Opacity Slider */}
            <div className="space-y-2 px-1">
              <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">Opacité</span>
            <span className="text-xs font-mono text-slate-400">{Math.round(Math.min(currentOpacity, 1) * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <EyeOff 
              className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
              onClick={() => setOpacityLevel(activeCategory, 0)}
              title="0%"
            />
            <div className="flex-1 flex flex-col">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={Math.min(currentOpacity, 1)}
                onChange={(e) => setOpacityLevel(activeCategory, parseFloat(e.target.value))}
                className={`w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:${category.color} [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:${category.color} [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer`}
              />
            </div>
            <Eye 
              className="w-3 h-3 text-slate-500 hover:text-slate-300 flex-shrink-0 cursor-pointer transition-colors" 
              onClick={() => setOpacityLevel(activeCategory, 1)}
              title="100%"
            />
          </div>
        </div>

        {/* Highlight Slider */}
        <div className="space-y-2 px-1 border-t border-slate-800/20 pt-2">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase tracking-tight transition-colors ${currentOpacity >= 1 ? 'text-blue-400' : 'text-slate-500'}`}>
              Highlight
            </span>
            <span className={`text-xs font-mono transition-colors ${currentOpacity >= 1 ? 'text-blue-400' : 'text-slate-500'}`}>
              +{Math.round(Math.max(0, currentOpacity - 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={Math.max(0, currentOpacity - 1)}
            onChange={(e) => setOpacityLevel(activeCategory, 1.0 + parseFloat(e.target.value))}
            className={`w-full h-1.5 rounded-lg appearance-none transition-all cursor-pointer ${
              currentOpacity >= 1 
                ? 'bg-blue-600/30 [&::-webkit-slider-thumb]:bg-blue-400' 
                : 'bg-slate-800 [&::-webkit-slider-thumb]:bg-slate-600'
            } [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0`}
          />
        </div>

        {/* List Section Toggle button only */}
        <div className="border-t border-slate-800/30 pt-1.5">
              {filteredItems.length > 0 ? (
                <button
                  onClick={() => onToggleList(listSectionKey)}
                  className={`w-full flex items-center justify-between p-1.5 rounded transition-colors ${
                    isListOpen ? 'bg-slate-700/40 text-white' : 'hover:bg-slate-700/30 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      {isRelations ? 'Relations' : 'Nodes'} ({filteredItems.length})
                    </span>
                    {isListOpen && <div className={`w-1 h-1 rounded-full animate-pulse ${
                      isVisible ? category.color : 'bg-slate-500'
                    }`}/>}
                  </div>
                  {isListOpen ?
                    <ChevronLeft className="w-3 h-3 transition-transform duration-200"/> :
                    <ChevronRight className="w-3 h-3 transition-transform duration-200"/>
                  }
                </button>
              ) : (
                <div className="w-full flex items-center justify-between p-1.5 text-slate-500/50">
                  <span className="text-xs font-semibold uppercase tracking-wide italic">
                    {isRelations ? 'Aucune Relation' : 'Aucun Node'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default UnifiedFilterSection;
