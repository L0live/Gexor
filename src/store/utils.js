// ============================================================================
// Fonctions utilitaires pour mapper les données LOD vers le format graphe Gexor
// ============================================================================

import { getPrimaryTypeLabel } from '../models/lodNode';

/**
 * Convertit un LodNode en node interne du graphe (pour le rendu).
 * Le type est désormais le premier typeLabel (label P31 humain) directement.
 */
export const mapLodNodeToGraphNode = (lodNode) => ({
  id: lodNode.uri,
  label: lodNode.label,
  type: (lodNode.typeLabels && lodNode.typeLabels[0]) || (lodNode.types && lodNode.types[0]) || 'unknown',
  typeLabel: getPrimaryTypeLabel(lodNode),
  types: lodNode.types,
  typeLabels: lodNode.typeLabels,
  description: lodNode.description,
  temporal: lodNode.temporal,
  geo: lodNode.geo,
  locations: lodNode.geo?.lat ? [`${lodNode.geo.lat}, ${lodNode.geo.lon}`] : [],
  sources: lodNode.sources,
  thumbnailUrl: lodNode.thumbnailUrl,
  externalIds: lodNode.externalIds,
  aliases: lodNode.aliases,
  properties: lodNode.properties,
});

/**
 * Convertit un LodEdge en edge interne du graphe (pour le rendu)
 */
export const mapLodEdgeToGraphEdge = (lodEdge) => ({
  id: lodEdge.id,
  source: lodEdge.source,
  target: lodEdge.target,
  type: lodEdge.label || lodEdge.predicate,
  predicate: lodEdge.predicate,
  description: lodEdge.label,
  rank: lodEdge.rank,
  referenceCount: lodEdge.referenceCount,
  sources: lodEdge.sources,
  classification: lodEdge.classification || 'unclassified',
  redundancyGroup: lodEdge.redundancyGroup || null,
  // Phase 2-3 enrichment fields
  tier: lodEdge.tier || 'primary',
  direction: lodEdge.direction || 'outgoing',
  contextPromoted: lodEdge.contextPromoted || false,
  weight: lodEdge.weight ?? 100,
  aggregateCount: lodEdge.aggregateCount || null,
});

/**
 * Crée un Map de lookup pour accéder rapidement aux nodes par ID (URI)
 */
export const buildNodeMap = (nodes) => new Map(nodes.map(n => [n.id, n]));

/**
 * Calcule les statistiques d'un ensemble de nodes/edges.
 * Les catégories sont désormais dynamiques (dérivées de P31).
 */
export const computeStats = (nodes, edges) => {
  const byCat = {};
  nodes.forEach(n => {
    const cat = n.type || 'unknown';
    byCat[cat] = (byCat[cat] || 0) + 1;
  });

  return {
    total: nodes.length,
    relations: edges.length,
    visible: nodes.length, // no filters → all visible
    byCategory: byCat,
  };
};
