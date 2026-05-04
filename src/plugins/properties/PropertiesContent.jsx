import { useMemo } from 'react';
import { Link2, Clock, MapPin, Hash, FileText, Image, Globe, Layers, Shield, Plus } from 'lucide-react';
import { getRedundancyGroupForPid, isNoisePid } from '../../services/propertyClassification';
import useGraphStore from '../../store/useGraphStore';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';

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
  relation:     { label: 'Relations primaires',     icon: Link2,    color: 'blue',   bg: 'bg-blue-500/5' },
  redundancy:   { label: 'Hiérarchies (redondance)', icon: Layers,  color: 'orange', bg: 'bg-orange-500/5' },
  noise:        { label: 'Bruit UI (masquées)',       icon: Shield,  color: 'slate',  bg: 'bg-slate-500/5' },
  temporel:     { label: 'Temporel',                 icon: Clock,   color: 'amber',  bg: 'bg-amber-500/5' },
  spatial:      { label: 'Spatial',                  icon: MapPin,  color: 'green',  bg: 'bg-green-500/5' },
  numérique:    { label: 'Numérique',                icon: Hash,    color: 'purple', bg: 'bg-purple-500/5' },
  texte:        { label: 'Texte',                    icon: FileText,color: 'slate',  bg: 'bg-slate-500/5' },
  média:        { label: 'Média',                    icon: Image,   color: 'pink',   bg: 'bg-pink-500/5' },
  web:          { label: 'Web',                      icon: Globe,   color: 'cyan',   bg: 'bg-cyan-500/5' },
  // identifiant:  { label: 'Identifiants',             icon: ExternalLink, color: 'slate', bg: 'bg-slate-500/5' },
};

const MODAL_GROUP_ORDER = ['média', 'redundancy', 'temporel', 'spatial', 'relation', 'texte', 'numérique', 'web', 'noise', 'identifiant'];

// ── Value renderer ──────────────────────────────────────────────────────
const ModalPropertyValue = ({ prop, groupKey, selectNode, visibleNodeIds, addNodeToGraph }) => {
  const WD_PREFIX = 'http://www.wikidata.org/entity/';
  // const isIdentifiant = groupKey === 'identifiant';
  return (
    <>
      {prop.values.map((v, i) => {
        if (groupKey === 'web' && v.value?.startsWith?.('http')) {
          return (
            <a key={i} href={v.value} target="_blank" rel="noopener noreferrer"
              className="text-[11px] px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors truncate max-w-[300px]">
              {v.label}
            </a>
          );
        }
        // if (isIdentifiant) {
        //   return (
        //     <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/50 text-slate-400 font-mono">
        //       {v.label}
        //     </span>
        //   );
        // }
        if (v.isEntity && selectNode) {
          const entityUri = v.value?.startsWith?.('http') ? v.value : `${WD_PREFIX}${v.value}`;
          const isInGraph = visibleNodeIds?.has(entityUri);
          return (
            <span key={i} className="inline-flex items-center gap-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode(entityUri);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const { addFilter } = useGraphStore.getState();
                  addFilter(createFilter(FILTER_TYPES.ENTITY, entityUri, v.label));
                }}
                className={`text-[11px] px-1.5 py-0.5 rounded-md cursor-pointer transition-colors ${
                  isInGraph
                    ? 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70 hover:text-slate-200'
                }`}
                title={v.label}
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
          <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded-md ${
            v.isEntity
              ? 'bg-blue-500/10 text-blue-300'
              : groupKey === 'temporel' ? 'bg-amber-500/10 text-amber-300'
              : groupKey === 'numérique' ? 'bg-purple-500/10 text-purple-300'
              : groupKey === 'spatial' ? 'bg-green-500/10 text-green-300'
              : 'bg-slate-700/50 text-slate-300'
          }`}>
            {v.label}
          </span>
        );
      })}
    </>
  );
};

// ── PropertiesContent — contenu du plugin PropertiesTab ───────────────────
export const PropertiesContent = ({ properties, selectNode, visibleNodeIds, addNodeToGraph }) => {
  const organized = useMemo(() => {
    if (!properties) return null;

    const standard = {};        // groupKey → props[]
    const redundancy = [];      // props redondants (A-groups)
    const noise = [];           // props bruit (B-groups)

    for (const [pid, prop] of Object.entries(properties)) {
      const dt = prop.datatype || 'string';
      const dtGroup = DATATYPE_GROUPS[dt] || 'texte';
      const propWithPid = { pid, ...prop };

      if (isNoisePid(pid)) {
        noise.push(propWithPid);
        continue;
      }
      if (dtGroup === 'relation' && getRedundancyGroupForPid(pid)) {
        redundancy.push(propWithPid);
        continue;
      }

      if (!standard[dtGroup]) standard[dtGroup] = [];
      standard[dtGroup].push(propWithPid);
    }

    standard.redundancy = redundancy;
    standard.noise = noise;
    return { standard };
  }, [properties]);

  if (!organized) return null;

  const { standard } = organized;

  return (
    <div className="flex flex-wrap gap-2">
      {MODAL_GROUP_ORDER.map(groupKey => {
        const props = standard[groupKey];
        if (!props || props.length === 0) return null;
        const meta = GROUP_META[groupKey];
        if (!meta) return null;
        const Icon = meta.icon;

        return (
          <div key={groupKey} className={`rounded-xl ${meta.bg} p-2 space-y-2`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`w-4 h-4 text-${meta.color}-400`} />
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{meta.label}</h3>
              <span className="text-[9px] text-slate-600 font-mono">{props.length}</span>
            </div>
            <div className="columns-1 md:columns-2 gap-1">
              {props.map(prop => (
                <div key={prop.pid} className="flex items-start gap-2 pl-2 pt-1">
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[11px] font-bold text-slate-400 shrink-0">
                      {prop.label}
                    </span>
                    <ModalPropertyValue prop={prop} groupKey={DATATYPE_GROUPS[prop.datatype] || 'texte'} selectNode={selectNode} visibleNodeIds={visibleNodeIds} addNodeToGraph={addNodeToGraph} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
