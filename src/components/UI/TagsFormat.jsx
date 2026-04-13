import React, { useMemo } from 'react';
import {
  Info, Users, Globe, Calendar, MapPin, Building, Layers, Filter,
  Share2, ExternalLink, Lock, Store, Loader, PenLine, Image
} from 'lucide-react';
import useGraphStore from '../../store/useGraphStore';
import contextResolverData from '../../data/contextResolver.json';
import { resolveTagsForNode } from '../../plugins/tagRegistry';
import { createFilter, FILTER_TYPES } from '../../models/searchFilter';

const ICON_MAP = {
  Info, Users, Globe, Calendar, MapPin, Building, Layers,
  Filter, Share2, ExternalLink, Lock, Store, PenLine, Image,
};

const TAG_STYLES = {
  actif: 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25 cursor-pointer',
  inactif: 'bg-slate-800/40 text-slate-500 border-slate-700/40 hover:bg-slate-700/50 hover:text-slate-400 cursor-pointer',
  locked: 'bg-slate-800/30 text-slate-600 border-slate-700/30 cursor-not-allowed opacity-60',
  marketplace: 'bg-slate-800/30 text-slate-600 border-slate-700/30 cursor-pointer hover:bg-slate-700/40',
  loading: 'bg-slate-800/40 text-slate-500 border-slate-700/40 cursor-wait',
};

const TagPill = ({ tag }) => {
  const Icon = tag.icon ? (ICON_MAP[tag.icon] || null) : null;
  const style = TAG_STYLES[tag.état] || TAG_STYLES.inactif;

  return (
    <button
      onClick={tag.état !== 'locked' && tag.état !== 'loading' ? tag.action : undefined}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${style}`}
      title={tag.label}
    >
      {tag.état === 'loading'
        ? <Loader className="w-3 h-3 animate-spin" />
        : Icon && <Icon className="w-3 h-3" />
      }
      <span>{tag.label}</span>
    </button>
  );
};

const MAX_EXPLORATION = 4;
const MAX_ACTION = 3;

/**
 * TagsFormat — deux sections de tags (Exploration + Action) générées en 4 couches :
 * 1. Structurelle (toujours présente)
 * 2. Context Resolver (mapping P31 type → tags)
 * 3. Dynamique sur propriétés chargées
 * 4. Relationnelle (depuis tagRegistry externe)
 */
const TagsFormat = ({ nodeUri, edgeData, aggregateId, mode }) => {
  const openRightPanel = useGraphStore(s => s.openRightPanel);
  const selectedNode = useGraphStore(s => s.selectedNode);
  const loadedNodes = useGraphStore(s => s.loadedNodes);
  const expandedUris = useGraphStore(s => s.expandedUris);
  const incomingExpandedUris = useGraphStore(s => s.incomingExpandedUris);

  const { explorationTags, actionTags } = useMemo(() => {
    const exploration = [];
    const action = [];

    // ─── Mode Node ────────────────────────────────────────────────────────
    if (mode === 'node' && nodeUri) {
      const node = loadedNodes[nodeUri] ?? selectedNode;
      const properties = node?.properties || {};
      const types = node?.types || [];
      const propertiesCount = Object.keys(properties).length;

      // Couche 1 — Structurelle
      exploration.push({
        id: 'structural-properties',
        label: `Propriétés${propertiesCount > 0 ? ` (${propertiesCount})` : ''}`,
        icon: 'Info',
        action: () => openRightPanel({ tab: 'properties' }),
        état: propertiesCount > 0 ? 'actif' : 'inactif',
        score: propertiesCount > 0 ? 6 : 3,
        source: 'structural',
      });

      exploration.push({
        id: 'structural-associates',
        label: 'Associés',
        icon: 'Users',
        action: () => openRightPanel({ tab: 'associates' }),
        état: incomingExpandedUris.has(nodeUri) ? 'actif' : 'inactif',
        score: incomingExpandedUris.has(nodeUri) ? 5 : 2,
        source: 'structural',
      });

      exploration.push({
        id: 'structural-wikipedia',
        label: 'Wikipedia',
        icon: 'Globe',
        action: () => openRightPanel({ tab: 'wikipedia' }),
        état: 'actif',
        score: 1,
        source: 'structural',
      });

      // Couche 2 — Context Resolver (P31 type family)
      for (const typeQid of types) {
        const qid = typeQid.startsWith('http') ? typeQid.split('/').pop() : typeQid;
        const contextEntry = contextResolverData[qid];
        if (!contextEntry) continue;
        for (const ctag of (contextEntry.explorationTags || [])) {
          if (exploration.find(t => t.id === ctag.id)) continue;
          let tagAction;
          if (ctag.plugin) {
            tagAction = () => openRightPanel({ tab: ctag.plugin });
          } else if (ctag.pid) {
            tagAction = () => {
              const { openSearchModal } = useGraphStore.getState();
              openSearchModal([createFilter(FILTER_TYPES.PROPERTY, ctag.pid, ctag.label)]);
            };
          } else {
            tagAction = () => {};
          }
          exploration.push({
            id: ctag.id,
            label: ctag.label,
            icon: ctag.icon,
            action: tagAction,
            état: ctag.pid && properties[ctag.pid] ? 'actif' : 'inactif',
            score: 4,
            source: 'context-resolver',
          });
        }
        break; // only first type
      }

      // Couche 3 — Dynamique depuis propriétés chargées
      if (propertiesCount > 0) {
        const hasTemporal = properties.P569 || properties.P570 || properties.P580 || properties.P582;
        const hasGeo = properties.P625;
        const hasImage = properties.P18;

        if (hasTemporal && !exploration.find(t => t.id === 'chronologie')) {
          exploration.push({
            id: 'chronologie',
            label: 'Chronologie',
            icon: 'Calendar',
            action: () => openRightPanel({ tab: 'temporal' }),
            état: 'inactif',
            score: 3,
            source: 'dynamic',
          });
        }
        if (hasGeo && !exploration.find(t => t.id === 'localisation')) {
          exploration.push({
            id: 'localisation',
            label: 'Géographique',
            icon: 'MapPin',
            action: () => openRightPanel({ tab: 'geographic' }),
            état: 'inactif',
            score: 3,
            source: 'dynamic',
          });
        }
        if (hasImage && !exploration.find(t => t.id === 'image')) {
          exploration.push({
            id: 'image',
            label: 'Image',
            icon: 'Image',
            action: () => openRightPanel({ tab: 'image' }),
            état: 'inactif',
            score: 2,
            source: 'dynamic',
          });
        }
      }

      // Couche 4 — TagRegistry (features externes)
      const registryTags = resolveTagsForNode(nodeUri, node);
      for (const rtag of registryTags) {
        if (rtag.section === 'exploration') exploration.push(rtag);
        else action.push(rtag);
      }

      // Tags Action
      if (types.length > 0) {
        action.push({
          id: 'filter-type',
          label: 'Filtrer ce type',
          icon: 'Filter',
          action: () => {
            const typeQid = types[0];
            const qid = typeQid?.startsWith('http') ? typeQid.split('/').pop() : typeQid;
            if (qid) {
              const { addFilter: addF } = useGraphStore.getState();
              addF(createFilter(FILTER_TYPES.TYPE, qid, node?.typeLabels?.[0]));
            }
          },
          disponible: true,
        });
      }

      action.push({
        id: 'share',
        label: 'Partager',
        icon: 'Share2',
        action: () => {
          const qid = nodeUri.startsWith('http') ? nodeUri.split('/').pop() : nodeUri;
          const url = `https://www.wikidata.org/wiki/${qid}`;
          navigator.clipboard?.writeText(url).catch(() => {});
        },
        disponible: true,
      });
    }

    // ─── Mode Relation (Edge) ─────────────────────────────────────────────
    if (mode === 'edge' && edgeData) {
      const pred = edgeData.predicate || '';
      const pid = pred.startsWith('http') ? pred.split('/').pop() : pred;

      if (pid) {
        exploration.push({
          id: 'wikidata-property',
          label: `${pid} sur Wikidata`,
          icon: 'ExternalLink',
          action: () => window.open(`https://www.wikidata.org/wiki/Property:${pid}`, '_blank'),
          état: 'actif',
          score: 5,
          source: 'structural',
        });
      }

      action.push({
        id: 'filter-pid',
        label: `Filtrer par ${edgeData.label || pid || 'propriété'}`,
        icon: 'Filter',
        action: () => {
          const { addFilter: addF } = useGraphStore.getState();
          if (pid) addF(createFilter(FILTER_TYPES.PROPERTY, pid, edgeData.label || pid));
        },
        disponible: true,
      });
    }

    // ─── Mode Aggregate ───────────────────────────────────────────────────
    if (mode === 'aggregate' && aggregateId) {
      exploration.push({
        id: 'aggregate-content',
        label: 'Contenu',
        icon: 'Layers',
        action: () => openRightPanel({ tab: 'aggregate-childs' }),
        état: 'actif',
        score: 6,
        source: 'structural',
      });
    }

    // Sort exploration by score desc
    exploration.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return { explorationTags: exploration, actionTags: action };
  }, [nodeUri, edgeData, aggregateId, mode, loadedNodes, expandedUris, incomingExpandedUris, selectedNode, openRightPanel]);

  const visibleExploration = explorationTags.slice(0, MAX_EXPLORATION);
  const hiddenExplorationCount = explorationTags.length - MAX_EXPLORATION;
  const visibleAction = actionTags.filter(t => t.disponible !== false).slice(0, MAX_ACTION);

  if (visibleExploration.length === 0 && visibleAction.length === 0) return null;

  return (
    <div className="px-4 py-3 space-y-3">
      {visibleExploration.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">Exploration</span>
            <div className="flex-1 h-px bg-slate-700/30" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleExploration.map(tag => <TagPill key={tag.id} tag={tag} />)}
            {hiddenExplorationCount > 0 && (
              <button className="flex items-center px-2.5 py-1 rounded-full text-[11px] text-slate-600 border border-slate-700/30 hover:text-slate-400 transition-colors">
                +{hiddenExplorationCount}
              </button>
            )}
          </div>
        </div>
      )}

      {visibleAction.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-[0.2em]">Action</span>
            <div className="flex-1 h-px bg-slate-700/30" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleAction.map(tag => <TagPill key={tag.id} tag={tag} />)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagsFormat;
