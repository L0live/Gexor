import React from 'react';
import { Eye, EyeOff, RefreshCcw, Download, Upload } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { downloadGraphJSON, validateAndRestoreGraph } from '../../utils/exportImport';

// ── Auto-fetch properties checkbox ──────────────────────────────────────────
const AutoFetchCheckbox = () => {
  const autoFetchProperties = useGraphStore(s => s.autoFetchProperties);
  const setAutoFetchProperties = useGraphStore(s => s.setAutoFetchProperties);
  return (
    <label className="flex items-center gap-2 px-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={autoFetchProperties}
        onChange={(e) => setAutoFetchProperties(e.target.checked)}
        className="sr-only peer"
      />
      <span
        className={`w-4 h-4 shrink-0 rounded border transition-colors flex items-center justify-center ${
          autoFetchProperties
            ? 'bg-blue-500 border-blue-400'
            : 'bg-transparent border-slate-600 hover:border-slate-400'
        }`}
      >
        {autoFetchProperties && (
          <svg viewBox="0 0 10 10" className="w-full h-full text-white" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1.5,5 4,7.5 8.5,2.5" />
          </svg>
        )}
      </span>
      <span className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors select-none">Charger automatiquement les propriétés</span>
    </label>
  );
};

// ── Agrégation threshold ────────────────────────────────────────────────────
const AggregateThresholdSlider = () => {
  const aggregateThreshold = useGraphStore(s => s.aggregateThreshold);
  const setAggregateThreshold = useGraphStore(s => s.setAggregateThreshold);

  return (
    <div className="px-2 mt-3 cursor-default">
      <div className="flex justify-between items-center text-[11px] text-slate-400 mb-2">
        <span>Seuil d'agrégation entrant :</span>
        <span className="font-bold text-blue-400 relative group">
          {aggregateThreshold}
          <div className="absolute right-0 top-full mt-1 w-48 p-2 bg-slate-800 text-[10px] text-slate-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            Nœuds entrants automatiquement groupés si &gt; {aggregateThreshold}
          </div>
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="30"
        step="1"
        value={aggregateThreshold}
        onChange={(e) => setAggregateThreshold(parseInt(e.target.value, 10))}
        className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
};

const SettingsPanel = ({
  nodes,
  edges,
  stats,
  showBackground,
  toggleBackground,
  resetAllSettings,
}) => {
  const handleExport = () => {
    downloadGraphJSON(useGraphStore.getState());
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          validateAndRestoreGraph(data, useGraphStore.setState);
        } catch (err) {
          console.error('Failed to parse graph:', err);
          alert('Fichier source invalide.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="flex gap-4 items-start pointer-events-none">
      <div className="w-102 bg-slate-900/80 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden max-h-[55vh] flex flex-col transition-all duration-200 pointer-events-auto">
        <div className="p-3 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
          {/* En-tête */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="ml-3 text-xl font-bold text-white">Settings</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleBackground()}
                  className={`p-1.5 rounded-2xl transition-all ${
                    showBackground
                      ? 'bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 hover:text-white'
                      : 'bg-slate-600/30 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200'
                  }`}
                  title={showBackground ? "Masquer le fond" : "Afficher le fond"}
                >
                  {showBackground ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleExport}
                  className="p-1.5 bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-2xl transition-colors"
                  title="Exporter la session"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={handleImportClick}
                  className="p-1.5 bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-2xl transition-colors"
                  title="Importer une session"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button
                  onClick={() => resetAllSettings()}
                  className="p-1.5 bg-slate-600/30 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-2xl transition-colors"
                  title="Réinitialiser"
                >
                  <RefreshCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-3 px-2">
            <div className="flex items-center text-[10px] gap-1">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-300">{stats.total}</span>
            </div>
            <div className="flex items-center text-[10px] gap-1">
              <span className="text-slate-500">Relations:</span>
              <span className="font-bold text-white">{stats.relations}</span>
            </div>
          </div>

          {/* Auto-fetch properties checkbox */}
          <AutoFetchCheckbox />

          {/* Aggregate Threshold Slider */}
          <AggregateThresholdSlider />
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
