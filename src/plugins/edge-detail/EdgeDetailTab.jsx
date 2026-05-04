import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Network } from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';

// Labels des qualifier PIDs courants (QUALIFIER_PIDS du backend)
const QUALIFIER_PID_LABELS = {
  P580: 'date de début',
  P582: 'date de fin',
  P585: 'date',
  P571: 'date de création',
  P576: 'date de dissolution',
  P453: 'rôle',
  P794: 'rang / grade',
  P3831: 'type d\'objet',
  P1932: 'présenté comme',
  P1545: 'ordre de tri',
};

const ClassificationBadge = ({ classification }) => {
  const colors = {
    'primary': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'context-dependent': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    'unclassified': 'bg-slate-700/30 text-slate-500 border-slate-700/30',
    'secondary': 'bg-slate-800/30 text-slate-600 border-slate-700/20',
  };
  const style = colors[classification] || colors.unclassified;
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded border ${style} shrink-0`}>
      {classification === 'context-dependent' ? 'ctx' : classification?.slice(0, 3)}
    </span>
  );
};

const RankBadge = ({ rank }) => {
  if (!rank || rank === 'normal') return null;
  const style = rank === 'preferred'
    ? 'bg-green-500/10 text-green-400 border-green-500/20'
    : 'bg-red-500/10 text-red-400 border-red-500/20';
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded border ${style} shrink-0`}>
      {rank}
    </span>
  );
};

const QualifierValue = ({ snak, selectNode }) => {
  if (snak.isEntity) {
    return (
      <button
        onClick={() => selectNode(snak.value)}
        className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
      >
        {snak.label || snak.value}
      </button>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/30 text-slate-400 border border-slate-700/20">
      {snak.label || snak.value}
    </span>
  );
};

const RelationCard = ({ relation, nodes, selectNode, defaultOpen }) => {
  const [open, setOpen] = useState(defaultOpen);

  const sourceNode = nodes.find(n => n.id === relation.source);
  const targetNode = nodes.find(n => n.id === relation.target);
  const hasQualifiers = relation.qualifiers && Object.keys(relation.qualifiers).length > 0;

  const pid = relation.predicate
    ? relation.predicate.split('/').pop()
    : null;

  return (
    <div className="border border-slate-700/30 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/40 transition-colors text-left"
      >
        {open
          ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
          : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
        }
        <ClassificationBadge classification={relation.classification} />
        {pid && (
          <span className="text-[9px] font-mono text-slate-600 shrink-0">{pid}</span>
        )}
        <span className="text-[11px] font-bold text-slate-300 truncate flex-1">
          {relation.type || relation.predicate || 'relation'}
        </span>
        <RankBadge rank={relation.rank} />
      </button>

      {/* Body */}
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-700/20 bg-slate-900/20">
          {/* Source → Target */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => selectNode(relation.source)}
              className="text-[11px] font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded hover:bg-blue-400/20 transition-colors"
            >
              {sourceNode?.label || relation.source}
            </button>
            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
            <button
              onClick={() => selectNode(relation.target)}
              className="text-[11px] font-bold text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded hover:bg-purple-400/20 transition-colors"
            >
              {targetNode?.label || relation.target}
            </button>
          </div>

          {/* Qualifiers */}
          {hasQualifiers && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Qualifiers</div>
              {Object.entries(relation.qualifiers).map(([pid, snaks]) => (
                <div key={pid} className="flex items-start gap-2">
                  <span className="text-[10px] text-slate-500 shrink-0 w-28">
                    {QUALIFIER_PID_LABELS[pid] || pid}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {snaks.map((snak, i) => (
                      <QualifierValue key={i} snak={snak} selectNode={selectNode} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const EdgeDetailTab = () => {
  const selectedEdge = useGraphStore(s => s.selectedEdge);
  const nodes = useGraphStore(s => s.nodes);
  const selectNode = useGraphStore(s => s.selectNode);

  if (!selectedEdge) return null;

  const relations = selectedEdge.relations || [];

  if (relations.length === 0) {
    return (
      <div className="p-6 text-center space-y-2">
        <Network className="w-8 h-8 text-slate-700 mx-auto" />
        <p className="text-slate-500 text-sm">Aucune relation.</p>
      </div>
    );
  }

  // Avec une seule relation : pas d'accordéon, ouvert direct
  // Avec plusieurs : ouvert par défaut si ≤ 3
  const defaultOpen = relations.length <= 3;

  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider px-1">
        {relations.length} relation{relations.length > 1 ? 's' : ''}
      </div>
      {relations.map((rel, i) => (
        <RelationCard
          key={rel.id || i}
          relation={rel}
          nodes={nodes}
          selectNode={selectNode}
          defaultOpen={defaultOpen}
        />
      ))}
    </div>
  );
};

export default React.memo(EdgeDetailTab);
