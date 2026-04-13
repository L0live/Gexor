import React, { useMemo, useEffect, useCallback } from 'react';
import { X, Link2, Clock, MapPin, Hash, FileText, Image, Globe, Layers, Shield, ExternalLink, Plus } from 'lucide-react';
import { classifyPid, getRedundancyGroupForPid, isNoisePid, isRedundancyPid, getRedundancyGroups, getNoiseGroups } from '../../services/propertyClassification';
import useGraphStore from '../../store/useGraphStore';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';

// ── Same datatype mapping as NodeDetailPanel ──────────────────────────────
const DATATYPE_GROUPS = {
  'wikibase-item':      'relation',
  'wikibase-property':  'relation',
  'external-id':        'identifiant',
  'time':               'temporel',
  'globe-coordinate':   'spatial',
  'quantity':           'numérique',
  'string':             'texte',
  'monolingualtext':    'texte',
  'commonsMedia':       'média',
  'tabular-data':       'média',
  'geo-shape':          'média',
  'url':                'web',
  'math':               'texte',
  'musical-notation':   'texte',
};

const GROUP_META = {
  relation:     { label: 'Relations primaires',     icon: Link2,    color: 'blue',   bg: 'bg-blue-500/5',    border: 'border-blue-500/20' },
  redundancy:   { label: 'Hiérarchies (redondance)', icon: Layers,  color: 'orange', bg: 'bg-orange-500/5',  border: 'border-orange-500/20' },
  noise:        { label: 'Bruit UI (masquées)',       icon: Shield,  color: 'slate',  bg: 'bg-slate-500/5',   border: 'border-slate-600/20' },
  temporel:     { label: 'Temporel',                 icon: Clock,   color: 'amber',  bg: 'bg-amber-500/5',   border: 'border-amber-500/20' },
  spatial:      { label: 'Spatial',                  icon: MapPin,  color: 'green',  bg: 'bg-green-500/5',   border: 'border-green-500/20' },
  numérique:    { label: 'Numérique',                icon: Hash,    color: 'purple', bg: 'bg-purple-500/5',  border: 'border-purple-500/20' },
  texte:        { label: 'Texte',                    icon: FileText,color: 'slate',  bg: 'bg-slate-500/5',   border: 'border-slate-600/20' },
  média:        { label: 'Média',                    icon: Image,   color: 'pink',   bg: 'bg-pink-500/5',    border: 'border-pink-500/20' },
  web:          { label: 'Web',                      icon: Globe,   color: 'cyan',   bg: 'bg-cyan-500/5',    border: 'border-cyan-500/20' },
  identifiant:  { label: 'Identifiants',             icon: ExternalLink, color: 'slate', bg: 'bg-slate-500/5', border: 'border-slate-600/20' },
};

const MODAL_GROUP_ORDER = ['média', 'redundancy', 'temporel', 'spatial', 'relation', 'numérique', 'texte', 'web', 'noise', 'identifiant'];

// ── Value renderer ──────────────────────────────────────────────────────
const ModalPropertyValue = ({ prop, groupKey, selectNode, visibleNodeIds, addNodeToGraph }) => {
  const WD_PREFIX = 'http://www.wikidata.org/entity/';
  const isIdentifiant = groupKey === 'identifiant';
  return (
    <>
      {prop.values.map((v, i) => {
        if (groupKey === 'web' && v.value?.startsWith?.('http')) {
          return (
            <a key={i} href={v.value} target="_blank" rel="noopener noreferrer"
              className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors truncate max-w-[300px]">
              {v.label}
            </a>
          );
        }
        if (isIdentifiant) {
          return (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/50 text-slate-400 border border-slate-700/30 font-mono">
              {v.label}
            </span>
          );
        }
        if (v.isEntity && selectNode) {
          const entityUri = v.value?.startsWith?.('http') ? v.value : `${WD_PREFIX}${v.value}`;
          const isInGraph = visibleNodeIds?.has(entityUri);
          return (
            <span key={i} className="inline-flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    useGraphStore.getState().openSearchModal([], null, entityUri);
                  } else {
                    selectNode(entityUri);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const { addFilter } = useGraphStore.getState();
                  addFilter(createFilter(FILTER_TYPES.ENTITY, entityUri, v.label));
                }}
                className={`text-[11px] px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                  isInGraph
                    ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20 hover:bg-blue-500/20'
                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/30 hover:bg-slate-700/70 hover:text-slate-200'
                }`}
                title={`${v.label} (Ctrl+Click pour explorer)`}
              >
                {v.label}
              </button>
              {!isInGraph && addNodeToGraph && (
                <button
                  onClick={(e) => { e.stopPropagation(); addNodeToGraph(entityUri); }}
                  className="text-[9px] p-0.5 rounded text-slate-600 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                  title="Ajouter au graphe"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        }
        return (
          <span key={i} className={`text-[11px] px-2 py-0.5 rounded-md ${
            v.isEntity
              ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20'
              : groupKey === 'temporel' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
              : groupKey === 'numérique' ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
              : groupKey === 'spatial' ? 'bg-green-500/10 text-green-300 border border-green-500/20'
              : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
          }`}>
            {v.label}
          </span>
        );
      })}
    </>
  );
};

// ── A-group sub-section in modal ────────────────────────────────────────
const ModalRedundancySubGroup = ({ groupKey, label, rationale, props, selectNode, visibleNodeIds, addNodeToGraph }) => {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        <span className="text-[10px] font-bold text-orange-400/70 uppercase tracking-wider">{label.split('—')[0].trim()}</span>
        {rationale && (
          <span className="text-[9px] text-slate-600 italic truncate max-w-[400px]" title={rationale}>
            — {rationale.substring(0, 80)}{rationale.length > 80 ? '…' : ''}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {props.map(prop => (
          <div key={prop.pid} className="flex flex-wrap gap-2 pl-2">
            <span className="text-[10px] font-mono text-slate-600 min-w-[40px] shrink-0 pt-0.5">{prop.pid}</span>
            <span className="text-[11px] font-bold text-slate-400 min-w-[140px] shrink-0 pt-0.5">
              {prop.label}
            </span>
            <ModalPropertyValue prop={prop} groupKey="relation" selectNode={selectNode} visibleNodeIds={visibleNodeIds} addNodeToGraph={addNodeToGraph} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ── B-noise sub-section in modal ────────────────────────────────────────
const ModalNoiseSubGroup = ({ groupKey, label, rationale, props, selectNode, visibleNodeIds, addNodeToGraph }) => {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label.split('—')[0].trim()}</span>
        {rationale && (
          <span className="text-[9px] text-slate-600 italic truncate max-w-[400px]" title={rationale}>
            — {rationale.substring(0, 80)}{rationale.length > 80 ? '…' : ''}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {props.map(prop => (
          <div key={prop.pid} className="flex flex-wrap gap-2 pl-2">
            <span className="text-[10px] font-mono text-slate-600 min-w-[40px] shrink-0 pt-0.5">{prop.pid}</span>
            <span className="text-[11px] font-bold text-slate-500 min-w-[140px] shrink-0 pt-0.5">
              {prop.label}
            </span>
            <ModalPropertyValue prop={prop} groupKey={DATATYPE_GROUPS[prop.datatype] || 'texte'} selectNode={selectNode} visibleNodeIds={visibleNodeIds} addNodeToGraph={addNodeToGraph} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main Modal ──────────────────────────────────────────────────────────
const AllPropertiesModal = ({ selectedNode, onClose, selectNode, visibleNodeIds, addNodeToGraph }) => {
  // Close on Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const organized = useMemo(() => {
    if (!selectedNode?.properties) return null;

    const standard = {};             // groupKey → props[]
    const redundancyBuckets = {};    // A-groupKey → { label, rationale, props[] }
    const noiseBuckets = {};         // B-groupKey → { label, rationale, props[] }

    // Pre-load A-group and B-group metadata
    const aGroupMeta = {};
    for (const g of getRedundancyGroups()) {
      aGroupMeta[g.key] = { label: g.label, rationale: g.rationale };
    }
    const bGroupMeta = {};
    for (const g of getNoiseGroups()) {
      bGroupMeta[g.key] = { label: g.label, rationale: g.rationale };
    }

    for (const [pid, prop] of Object.entries(selectedNode.properties)) {
      const dt = prop.datatype || 'string';
      const dtGroup = DATATYPE_GROUPS[dt] || 'texte';
      const propWithPid = { pid, ...prop };

      // Classify wikibase-item relations into A / B / normal
      if (dtGroup === 'relation') {
        const rInfo = getRedundancyGroupForPid(pid);
        if (rInfo) {
          const { groupKey } = rInfo;
          if (!redundancyBuckets[groupKey]) {
            redundancyBuckets[groupKey] = {
              label: aGroupMeta[groupKey]?.label || groupKey,
              rationale: aGroupMeta[groupKey]?.rationale || '',
              props: [],
            };
          }
          redundancyBuckets[groupKey].props.push(propWithPid);
          continue;
        }
        if (isNoisePid(pid)) {
          // Find which B-group it belongs to
          let placed = false;
          for (const [bKey, bMeta] of Object.entries(bGroupMeta)) {
            // We need to check against the noise groups
            const noiseGroups = getNoiseGroups();
            const bGroup = noiseGroups.find(g => g.key === bKey);
            if (bGroup && (bGroup.pids[pid] || bGroup.pids?.exemples_canoniques?.[pid])) {
              if (!noiseBuckets[bKey]) {
                noiseBuckets[bKey] = { label: bMeta.label, rationale: bMeta.rationale, props: [] };
              }
              noiseBuckets[bKey].props.push(propWithPid);
              placed = true;
              break;
            }
          }
          if (!placed) {
            if (!noiseBuckets._unclassified) {
              noiseBuckets._unclassified = { label: 'Autres (bruit)', rationale: '', props: [] };
            }
            noiseBuckets._unclassified.props.push(propWithPid);
          }
          continue;
        }
        // Normal relation
        if (!standard.relation) standard.relation = [];
        standard.relation.push(propWithPid);
        continue;
      }

      // Non-relation types — check noise
      if (isNoisePid(pid)) {
        // Put into matching B-group
        let placed = false;
        const noiseGroups = getNoiseGroups();
        for (const bGroup of noiseGroups) {
          if (bGroup.pids[pid]) {
            if (!noiseBuckets[bGroup.key]) {
              noiseBuckets[bGroup.key] = { label: bGroup.label, rationale: bGroup.rationale, props: [] };
            }
            noiseBuckets[bGroup.key].props.push(propWithPid);
            placed = true;
            break;
          }
        }
        if (!placed) {
          if (!noiseBuckets._unclassified) {
            noiseBuckets._unclassified = { label: 'Autres (bruit)', rationale: '', props: [] };
          }
          noiseBuckets._unclassified.props.push(propWithPid);
        }
        continue;
      }

      // Normal non-relation property
      if (!standard[dtGroup]) standard[dtGroup] = [];
      standard[dtGroup].push(propWithPid);
    }

    return { standard, redundancyBuckets, noiseBuckets };
  }, [selectedNode]);

  if (!organized || !selectedNode) return null;

  const { standard, redundancyBuckets, noiseBuckets } = organized;
  const hasRedundancy = Object.keys(redundancyBuckets).length > 0;
  const hasNoise = Object.keys(noiseBuckets).length > 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[85vw] max-w-[1200px] h-[80vh] bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-700/40 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/30 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black text-white">{selectedNode.label}</h2>
            <span className="text-xs text-slate-500 font-mono">
              {selectedNode.properties ? Object.keys(selectedNode.properties).length : 0} propriétés
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent p-6">
          <div className="flex flex-wrap gap-6">
            {MODAL_GROUP_ORDER.map(groupKey => {
              // Handle redundancy group
              if (groupKey === 'redundancy') {
                if (!hasRedundancy) return null;
                const meta = GROUP_META.redundancy;
                const Icon = meta.icon;
                const aKeys = Object.keys(redundancyBuckets).sort();
                return (
                  <div key="redundancy" className={`rounded-xl border ${meta.border} ${meta.bg} p-4 space-y-3`}>
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 text-${meta.color}-400`} />
                      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{meta.label}</h3>
                      <span className="text-[9px] text-slate-600 font-mono">{aKeys.reduce((s, k) => s + redundancyBuckets[k].props.length, 0)}</span>
                    </div>
                    {aKeys.map(k => (
                      <ModalRedundancySubGroup
                        key={k}
                        groupKey={k}
                        label={redundancyBuckets[k].label}
                        rationale={redundancyBuckets[k].rationale}
                        props={redundancyBuckets[k].props}
                        selectNode={selectNode}
                        visibleNodeIds={visibleNodeIds}
                        addNodeToGraph={addNodeToGraph}
                      />
                    ))}
                  </div>
                );
              }

              // Handle noise group
              if (groupKey === 'noise') {
                if (!hasNoise) return null;
                const meta = GROUP_META.noise;
                const Icon = meta.icon;
                const bKeys = Object.keys(noiseBuckets).sort();
                return (
                  <div key="noise" className={`rounded-xl border ${meta.border} ${meta.bg} p-4 space-y-3 lg:col-span-2`}>
                    <div className="flex items-center gap-1.5">
                      <Icon className={`w-4 h-4 text-${meta.color}-400`} />
                      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{meta.label}</h3>
                      <span className="text-[9px] text-slate-600 font-mono">{bKeys.reduce((s, k) => s + noiseBuckets[k].props.length, 0)}</span>
                    </div>
                    <div className="columns-1 md:columns-2 gap-4">
                      {bKeys.map(k => (
                        <ModalNoiseSubGroup
                          key={k}
                          groupKey={k}
                          label={noiseBuckets[k].label}
                          rationale={noiseBuckets[k].rationale}
                          props={noiseBuckets[k].props}
                          selectNode={selectNode}
                          visibleNodeIds={visibleNodeIds}
                          addNodeToGraph={addNodeToGraph}
                        />
                      ))}
                    </div>
                  </div>
                );
              }

              // Standard groups
              const props = standard[groupKey];
              if (!props || props.length === 0) return null;
              const meta = GROUP_META[groupKey];
              if (!meta) return null;
              const Icon = meta.icon;

              return (
                <div key={groupKey} className={`rounded-xl border ${meta.border} ${meta.bg} p-4 space-y-2`}>
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-4 h-4 text-${meta.color}-400`} />
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{meta.label}</h3>
                    <span className="text-[9px] text-slate-600 font-mono">{props.length}</span>
                  </div>
                  <div className={`columns-1 md:columns-2 gap-4`}>
                    {props.map(prop => (
                      <div key={prop.pid} className="flex items-start gap-2 pl-2">
                        <span className="text-[10px] font-mono text-slate-600 min-w-[40px] shrink-0 pt-0.5">{prop.pid}</span>
                        <div key={prop.pid} className="flex flex-wrap gap-2">
                          <span className="text-[11px] font-bold text-slate-400 min-w-[120px] shrink-0 pt-0.5">
                            {prop.label}
                          </span>
                          <ModalPropertyValue prop={prop} groupKey={groupKey} selectNode={selectNode} visibleNodeIds={visibleNodeIds} addNodeToGraph={addNodeToGraph} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700/30 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-slate-600">
            Appuyez sur <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[9px] border border-slate-700/50">Échap</kbd> pour fermer
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800/60 text-slate-400 text-xs font-medium hover:bg-slate-700/60 hover:text-slate-200 transition-colors border border-slate-700/30"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default AllPropertiesModal;
