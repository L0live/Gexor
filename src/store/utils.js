// ============================================================================
// Fonctions utilitaires pour mapper les données brutes REEC vers le format graphe
// ============================================================================

/**
 * Convertit un objet REEC brut en node du graphe
 */
export const mapReecToNode = (reec) => ({
  id: reec.reec_id,
  label: reec.label,
  type: reec.type,
  subtype: reec.subtype,
  category: reec.category,
  summary: reec.summary_short,
  summaryDetailed: reec.summary_detailed,
  temporal: {
    start: reec.temporal_start_date || reec.temporal_date,
    end: reec.temporal_end_date,
    precision: reec.temporal_precision
  },
  locations: reec.spatial_locations || [],
  confiance: reec.metadata_confiance,
  tags: reec.metadata_tags || []
});

/**
 * Convertit une relation brute en edge du graphe
 */
export const mapRelationToEdge = (rel) => ({
  id: `${rel.source_reec_id}-${rel.target_reec_id}`,
  source: rel.source_reec_id,
  target: rel.target_reec_id,
  type: rel.relation_type,
  description: rel.description,
  confiance: rel.confiance
});

/**
 * Crée un Map de lookup pour accéder rapidement aux nodes par ID
 */
export const buildNodeMap = (nodes) => new Map(nodes.map(n => [n.id, n]));

/**
 * Crée un Map de lookup pour accéder rapidement aux REECs par ID
 */
export const buildReecMap = (reecs) => new Map(reecs.map(r => [r.reec_id, r]));

/**
 * Calcule les statistiques d'un ensemble de nodes/edges
 */
export const computeStats = (nodes, edges, filters) => ({
  total: nodes.length,
  entities: nodes.filter(n => n.type === 'Entity').length,
  events: nodes.filter(n => n.type === 'Event').length,
  contexts: nodes.filter(n => n.type === 'Context').length,
  relations: edges.length,
  visible: nodes.filter(n => filters[n.type]).length
});
