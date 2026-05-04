import React, { useState } from 'react';
import { Eye, EyeOff, RefreshCcw, Download, Upload, Sliders, Zap, Circle, Hexagon, Share2, Sparkles } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import { downloadGraphJSON, validateAndRestoreGraph } from '../../utils/exportImport';
import { THEMES } from '../../constants/themes';

// ── Primitives ──────────────────────────────────────────────────────────────

const SliderRow = ({ label, min, max, step, value, onChange, unit = '' }) => (
  <div className="cursor-default">
    <div className="flex justify-between items-center text-[11px] text-slate-400 mb-1">
      <span>{label}</span>
      <span className="font-bold text-blue-400">
        {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(step < 0.01 ? 4 : step < 0.1 ? 2 : 2)) : value}{unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
    />
  </div>
);

const ColorRow = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-[11px] text-slate-400">{label}</span>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-6 rounded cursor-pointer bg-transparent border border-slate-700"
      />
      <span className="font-mono text-[10px] text-slate-500 w-16 text-right">{value}</span>
    </div>
  </div>
);

const SwitchRow = ({ label, checked, onChange }) => (
  <label className="flex items-center justify-between gap-2 cursor-pointer group">
    <span className="text-[11px] text-slate-400 group-hover:text-slate-300">{label}</span>
    <span
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-slate-700'}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </span>
  </label>
);

const ThemePicker = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-2">
    {Object.values(THEMES).map((t) => {
      const active = value === t.id;
      return (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative rounded-lg overflow-hidden border-2 transition-all ${active ? 'border-blue-400' : 'border-slate-700 hover:border-slate-500'}`}
          title={t.label}
        >
          <div className="h-10 w-full" style={{ background: t.sceneBgFallback }} />
          <div className="text-[10px] text-slate-300 py-1 text-center bg-slate-900/60">{t.label}</div>
        </button>
      );
    })}
  </div>
);

// ── Tab contents ────────────────────────────────────────────────────────────

const GeneralTab = () => {
  const theme = useGraphStore(s => s.theme);
  const setTheme = useGraphStore(s => s.setTheme);
  const autoFetchProperties = useGraphStore(s => s.autoFetchProperties);
  const setAutoFetchProperties = useGraphStore(s => s.setAutoFetchProperties);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide mb-2">Thème</div>
        <ThemePicker value={theme} onChange={setTheme} />
      </div>
      <div className="pt-3 border-t border-slate-800/70">
        <SwitchRow
          label="Charger automatiquement les propriétés"
          checked={autoFetchProperties}
          onChange={setAutoFetchProperties}
        />
      </div>
    </div>
  );
};

const ForceTab = () => {
  const p = useGraphStore(s => s.forceParams);
  const set = useGraphStore(s => s.setForceParam);
  return (
    <div className="space-y-3">
      <SliderRow label="Node strength (répulsion)" min={0} max={500} step={5} value={p.nodeStrength} onChange={(v) => set('nodeStrength', v)} />
      <SliderRow label="Edge strength" min={0} max={500} step={5} value={p.edgeStrength} onChange={(v) => set('edgeStrength', v)} />
      <SliderRow label="Link distance" min={10} max={300} step={5} value={p.linkDistance} onChange={(v) => set('linkDistance', v)} />
      <SliderRow label="Damping" min={0.5} max={0.99} step={0.01} value={p.damping} onChange={(v) => set('damping', v)} />
      <SliderRow label="Max speed" min={10} max={500} step={10} value={p.maxSpeed} onChange={(v) => set('maxSpeed', v)} />
      <SliderRow label="Gravity" min={0} max={50} step={1} value={p.gravity} onChange={(v) => set('gravity', v)} />
      <SliderRow label="Coulomb distance scale" min={0.0001} max={0.05} step={0.0005} value={p.coulombDisScale} onChange={(v) => set('coulombDisScale', v)} />
    </div>
  );
};

const NodesTab = () => {
  const p = useGraphStore(s => s.nodeParams);
  const set = useGraphStore(s => s.setNodeParam);
  return (
    <div className="space-y-3">
      <SliderRow label="Rayon" min={2} max={20} step={1} value={p.radius} onChange={(v) => set('radius', v)} />
      <SliderRow label="Opacité nœuds shared" min={0} max={1} step={0.05} value={p.sharedOpacity} onChange={(v) => set('sharedOpacity', v)} />
      <SliderRow label="Scale nœuds shared" min={0.3} max={2} step={0.05} value={p.sharedScale} onChange={(v) => set('sharedScale', v)} />
    </div>
  );
};

const AggregatesTab = () => {
  const p = useGraphStore(s => s.aggregateParams);
  const set = useGraphStore(s => s.setAggregateParam);
  return (
    <div className="space-y-3">
      <SliderRow label="Seuil d'agrégation entrante" min={0} max={30} step={1} value={p.threshold} onChange={(v) => set('threshold', v)} />
      <SliderRow label="Scale min" min={0.5} max={5} step={0.1} value={p.minScale} onChange={(v) => set('minScale', v)} />
      <SliderRow label="Scale max" min={0.5} max={5} step={0.1} value={p.maxScale} onChange={(v) => set('maxScale', v)} />
      <ColorRow label="Couleur" value={p.color} onChange={(v) => set('color', v)} />
      <ColorRow label="Couleur (loading)" value={p.colorLoading} onChange={(v) => set('colorLoading', v)} />
    </div>
  );
};

const EdgesTab = () => {
  const p = useGraphStore(s => s.edgeParams);
  const set = useGraphStore(s => s.setEdgeParam);
  return (
    <div className="space-y-3">
      <SwitchRow label="Afficher les arêtes (trait)" checked={p.showEdges} onChange={(v) => set('showEdges', v)} />
      <SwitchRow label="Afficher les pointes de flèches" checked={p.showArrows} onChange={(v) => set('showArrows', v)} />
      <SliderRow label="Taille flèche" min={1} max={10} step={0.5} value={p.arrowSize} onChange={(v) => set('arrowSize', v)} />
      <SliderRow label="Opacité arêtes shared" min={0} max={1} step={0.05} value={p.sharedEdgeOpacity} onChange={(v) => set('sharedEdgeOpacity', v)} />
    </div>
  );
};

const HighlightsTab = () => {
  const p = useGraphStore(s => s.highlightParams);
  const set = useGraphStore(s => s.setHighlightParam);
  return (
    <div className="space-y-3">
      <ColorRow label="Couleur sélection" value={p.selectionColor} onChange={(v) => set('selectionColor', v)} />
      <ColorRow label="Couleur pulse (ajout)" value={p.addedPulseColor} onChange={(v) => set('addedPulseColor', v)} />
      <SliderRow label="Durée pulse" min={200} max={5000} step={100} value={p.addedPulseDuration} onChange={(v) => set('addedPulseDuration', v)} unit=" ms" />
    </div>
  );
};

// ── Main panel ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'general',    label: 'Général',      icon: Sliders,  Component: GeneralTab },
  { id: 'force',      label: 'Force layout', icon: Zap,      Component: ForceTab },
  { id: 'nodes',      label: 'Nodes',        icon: Circle,   Component: NodesTab },
  { id: 'aggregates', label: 'Aggregates',   icon: Hexagon,  Component: AggregatesTab },
  { id: 'edges',      label: 'Edges',        icon: Share2,   Component: EdgesTab },
  { id: 'highlights', label: 'Highlights',   icon: Sparkles, Component: HighlightsTab },
];

const SettingsPanel = ({
  stats,
  showBackground,
  toggleBackground,
  resetAllSettings,
}) => {
  const [activeTab, setActiveTab] = useState('general');

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

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.Component ?? GeneralTab;

  return (
    <div className="flex items-stretch pointer-events-none">
      {/* Vertical icon column — aligned with settings button below */}
      <div className="flex flex-col gap-1 bg-slate-900/80 backdrop-blur-sm rounded-l-2xl shadow-2xl p-2 pointer-events-auto border-r border-slate-800/70">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={label}
              className={`p-2 rounded-lg transition-all ${
                active
                  ? 'bg-blue-600/30 text-blue-300'
                  : 'text-slate-400 hover:bg-slate-700/40 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div className="w-96 bg-slate-900/80 backdrop-blur-sm rounded-r-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col pointer-events-auto">
        <div className="p-3 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="ml-1 text-xl font-bold text-white">
              {TABS.find(t => t.id === activeTab)?.label ?? 'Settings'}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => toggleBackground()}
                className={`p-1.5 rounded-2xl transition-all ${
                  showBackground
                    ? 'bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 hover:text-white'
                    : 'bg-slate-600/30 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200'
                }`}
                title={showBackground ? 'Masquer le fond' : 'Afficher le fond'}
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

          {/* Stats */}
          <div className="flex gap-3 px-1">
            <div className="flex items-center text-[10px] gap-1">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-300">{stats.total}</span>
            </div>
            <div className="flex items-center text-[10px] gap-1">
              <span className="text-slate-500">Relations:</span>
              <span className="font-bold text-white">{stats.relations}</span>
            </div>
          </div>

          {/* Active tab */}
          <div className="pt-1 h-[170px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
