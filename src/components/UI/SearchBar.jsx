import React from 'react';
import { Search, X, GripVertical } from 'lucide-react';

const SearchBar = ({
  searchQuery,
  setSearchQuery,
  searchFocused,
  setSearchFocused,
  filteredReecs,
  topReecs,
  handleCustomDoubleClick
}) => {
  return (
    <div className="absolute bottom-1 left-1/2 w-[450px] z-10 transition-opacity duration-300 opacity-40 hover:opacity-100 focus-within:opacity-100" style={{ transform: 'translateX(-50%)' }}>
      <div className="bg-transparent backdrop-blur-sm rounded-2xl shadow-2xl border border-transparent p-1">
        {/* Résultats de recherche */}
        {searchFocused && searchQuery && filteredReecs.length > 0 && (
          <div className="mb-3 max-h-64 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            {filteredReecs.map(reec => (
              <div key={reec.reec_id} className="flex items-center gap-2 p-2 bg-slate-700/70 rounded-lg hover:bg-slate-700 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                  <div className="text-xs text-slate-400">{reec.type} • {reec.subtype}</div>
                </div>
                <button
                  onMouseDown={(e) => handleCustomDoubleClick(e, reec.reec_id, true)}
                  className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                  title="Double-cliquez pour ajouter et déplacer"
                >
                  <GripVertical className="w-5 h-5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {searchFocused && searchQuery && filteredReecs.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-3 mb-3">
            Aucun résultat
          </div>
        )}
        
        {/* Top REECs (affichés automatiquement au focus) */}
        {searchFocused && !searchQuery && (
          <div className="mb-3 max-h-72 overflow-y-auto space-y-2">
            {topReecs.slice(0, 3).map(reec => (
              <div key={reec.reec_id} className="flex items-center gap-2 p-2 bg-slate-700/70 rounded-lg hover:bg-slate-700 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate">{reec.label}</div>
                  <div className="text-xs text-slate-400">
                    {reec.type} • {reec.connectionCount} relation{reec.connectionCount > 1 ? 's' : ''}
                  </div>
                </div>
                <button
                  onMouseDown={(e) => handleCustomDoubleClick(e, reec.reec_id, true)}
                  className="flex-shrink-0 cursor-grab active:cursor-grabbing"
                  title="Double-cliquez pour ajouter et déplacer"
                >
                  <GripVertical className="w-5 h-5 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Barre de recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            placeholder="Rechercher un REEC par nom ou alias..."
            className="w-full pl-10 pr-10 py-2 bg-slate-700 border border-transparent rounded-2xl text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-600 rounded"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
