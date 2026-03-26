import React, { useState, useCallback } from 'react';
import { Search, Globe, Loader, Sparkles, AlertCircle } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { getCategoryColor } from '../../constants/graphConstants';

const SUGGESTIONS = [
  { uri: 'http://www.wikidata.org/entity/Q7742', label: 'Louis XIV', description: 'Roi de France (1638–1715)', category: 'person' },
  { uri: 'http://www.wikidata.org/entity/Q9068', label: 'Voltaire', description: 'Écrivain et philosophe français (1694–1778)', category: 'person' },
  { uri: 'http://www.wikidata.org/entity/Q5598', label: 'Rembrandt', description: 'Peintre néerlandais (1606–1669)', category: 'person' },
  { uri: 'http://www.wikidata.org/entity/Q6534', label: 'Révolution française', description: 'Période de bouleversements (1789–1799)', category: 'event' },
  { uri: 'http://www.wikidata.org/entity/Q5879', label: 'Johann Sebastian Bach', description: 'Compositeur allemand (1685–1750)', category: 'person' },
  { uri: 'http://www.wikidata.org/entity/Q1299', label: 'Les Beatles', description: 'Groupe de musique britannique', category: 'organization' },
];

const StartScreen = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const initFromEntity = useGraphStore(s => s.initFromEntity);
  const searchWikidata = useGraphStore(s => s.searchWikidata);
  const initLoading = useGraphStore(s => s.initLoading);
  const initError = useGraphStore(s => s.initError);

  const handleSearch = useCallback(async (text) => {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchWikidata(text);
      setResults(res || []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, [searchWikidata]);

  const handleSelect = useCallback((uri) => {
    initFromEntity(uri);
  }, [initFromEntity]);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-50">
      <div className="flex flex-col items-center gap-8 max-w-xl w-full px-6">
        {/* Logo / Title */}
        <div className="text-center space-y-3 select-none">
          <h1 className="text-6xl font-black text-white tracking-tight">
            Gexor
          </h1>
          <p className="text-slate-400 text-sm">
            Explorateur de graphes LOD — Recherchez une entité pour commencer
          </p>
        </div>

        {/* Search Input */}
        <div className="w-full relative">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Rechercher une entité Wikidata..."
              autoFocus
              className="w-full pl-12 pr-12 py-4 bg-slate-800 border border-slate-700 rounded-2xl text-white text-lg placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
            />
            {searching && (
              <Loader className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400 animate-spin" />
            )}
          </div>

          {/* Search Results */}
          {results.length > 0 && (
            <div className="absolute top-full mt-2 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-10 max-h-80 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.uri}
                  onClick={() => handleSelect(r.uri)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0"
                >
                  <div className="text-sm font-bold text-white">{r.label}</div>
                  {r.description && (
                    <div className="text-xs text-slate-400 mt-0.5">{r.description}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Suggestions */}
        <div className="w-full space-y-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Suggestions</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.uri}
                onClick={() => handleSelect(s.uri)}
                className="group flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl transition-all text-left"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getCategoryColor(s.category) }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-200 group-hover:text-white truncate">
                    {s.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {s.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Loading overlay */}
        {initLoading && (
          <div className="flex items-center gap-3 p-4 bg-blue-900/30 border border-blue-700/50 rounded-xl w-full">
            <Loader className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
            <span className="text-blue-300 text-sm">Chargement depuis Wikidata...</span>
          </div>
        )}

        {/* Error message */}
        {initError && (
          <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700/50 rounded-xl w-full">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm">{initError}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 text-slate-600 text-xs">
          <Globe className="w-3.5 h-3.5" />
          <span>Powered by Wikidata SPARQL</span>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
