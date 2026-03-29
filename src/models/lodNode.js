// ============================================================================
// Gexor LOD Data Model — generic Linked Open Data nodes & edges
// ============================================================================

/**
 * @typedef {Object} LodSource
 * @property {string} url
 * @property {string} [label]
 */

/**
 * @typedef {Object} LodNode
 * @property {string} uri
 * @property {string} label
 * @property {string[]} types
 * @property {string[]} typeLabels
 * @property {Object} properties
 * @property {{ start: string|null, end: string|null, birthDate: string|null, precision: string|null }} temporal
 * @property {{ lat: number|null, lon: number|null }} geo
 * @property {LodSource[]} sources
 * @property {string|null} thumbnailUrl
 * @property {Object} externalIds
 * @property {string} description
 * @property {string[]} aliases
 */

/**
 * @typedef {Object} LodEdge
 * @property {string} id
 * @property {string} source
 * @property {string} target
 * @property {string} predicate
 * @property {string} label
 * @property {LodSource[]} sources
 * @property {'preferred'|'normal'|'deprecated'} rank
 * @property {number} referenceCount
 * @property {string|null} redundancyGroup
 * @property {'primary'|'secondary'|'context-dependent'|'unclassified'} classification
 * @property {'primary'|'secondary'|'hidden'|'aggregate'} tier
 * @property {'incoming'|'outgoing'} direction
 * @property {boolean} contextPromoted
 * @property {number} weight
 * @property {number|null} aggregateCount
 */

/**
 * @typedef {Object} AggregateNode
 * @property {string} id
 * @property {'aggregate'} type
 * @property {string} sourceUri
 * @property {string} predicate
 * @property {string} predicateLabel
 * @property {string[]} targetClasses
 * @property {string[]} targetClassLabels
 * @property {number} count
 * @property {'incoming'|'outgoing'} direction
 * @property {boolean} expanded
 * @property {boolean} collapsed
 * @property {string[]} children
 * @property {boolean} loadingChildren
 */

/**
 * Create a new LodNode (entity from the LOD cloud).
 *
 * @param {Object} opts
 * @param {string} opts.uri          — Canonical URI (e.g. Wikidata Q-ID URL)
 * @param {string} opts.label        — Display label
 * @param {string[]} opts.types      — rdf:type URIs (e.g. ['Q5', 'Q36180'])
 * @param {string[]} opts.typeLabels — Human-readable type labels
 * @param {Object} opts.properties   — { predicate: { values: any[], sources: Source[] } }
 * @param {Object} opts.temporal     — { start, end, precision }
 * @param {Object} opts.geo          — { lat, lon }
 * @param {Source[]} opts.sources    — Provenance sources
 * @param {string} opts.thumbnailUrl — Wikimedia Commons thumbnail if available
 * @param {Object} opts.externalIds  — { propertyId: value } for cross-endpoint linking
 * @param {string} opts.description  — Short description / summary
 * @param {string[]} opts.aliases    — Alternative names
 */
export const createLodNode = ({
  uri,
  label = '',
  types = [],
  typeLabels = [],
  properties = {},
  temporal = { start: null, end: null, birthDate: null, precision: null },
  geo = { lat: null, lon: null },
  sources = [],
  thumbnailUrl = null,
  externalIds = {},
  description = '',
  aliases = [],
} = {}) => ({
  uri,
  label,
  types,
  typeLabels,
  properties,
  temporal,
  geo,
  sources,
  thumbnailUrl,
  externalIds,
  description,
  aliases,
});

/**
 * Create a new LodEdge (relation between two LOD entities).
 *
 * @param {Object} opts
 * @param {string} opts.source      — Source node URI
 * @param {string} opts.target      — Target node URI
 * @param {string} opts.predicate   — Predicate URI (e.g. wdt:P40)
 * @param {string} opts.label       — Human-readable label for the predicate
 * @param {Source[]} opts.sources   — Provenance sources
 * @param {string} opts.rank        — 'preferred' | 'normal' | 'deprecated'
 * @param {number} opts.referenceCount — Number of references backing this statement
 * @param {string} opts.classification — 'primary' | 'secondary' | 'context-dependent' | 'unclassified'
 * @param {string|null} opts.redundancyGroup — Group key if secondary (e.g. 'A1_localisation_geographique')
 * @param {string} opts.tier        — 'primary' | 'secondary' | 'hidden' | 'aggregate'
 * @param {string} opts.direction   — 'outgoing' | 'incoming'
 * @param {boolean} opts.contextPromoted — true if a C-axis PID was promoted by the Context Resolver
 * @param {number} opts.weight      — Sort weight (100=primary, 90=C promoted, 70=unclassified, 30=secondary)
 * @param {number|null} opts.redundancyRank — Position in A-axis hierarchy (1=most specific)
 * @param {number|null} opts.aggregateCount — Count of aggregated entities (for aggregate edges)
 */
export const createLodEdge = ({
  source,
  target,
  predicate = '',
  label = '',
  sources = [],
  rank = 'normal',
  referenceCount = 0,
  classification = 'unclassified',
  redundancyGroup = null,
  tier = 'primary',
  direction = 'outgoing',
  contextPromoted = false,
  weight = 100,
  redundancyRank = null,
  aggregateCount = null,
} = {}) => ({
  id: `${source}-${predicate}-${target}`,
  source,
  target,
  predicate,
  label,
  sources,
  rank,
  referenceCount,
  classification,
  redundancyGroup,
  tier,
  direction,
  contextPromoted,
  weight,
  redundancyRank,
  aggregateCount,
});

/**
 * Source provenance for a single piece of data.
 *
 * @param {Object} opts
 * @param {string} opts.endpoint     — Endpoint name ('wikidata', 'bnf', 'getty', …)
 * @param {string} opts.resourceUrl  — Direct URL to the resource
 * @param {string} opts.license      — License identifier ('CC0', 'CC-BY', …)
 * @param {string} opts.fetchedAt    — ISO timestamp of when the data was fetched
 */
export const createSource = ({
  endpoint = 'wikidata',
  resourceUrl = '',
  license = 'CC0',
  fetchedAt = new Date().toISOString(),
} = {}) => ({
  endpoint,
  resourceUrl,
  license,
  fetchedAt,
});

// ── Type helpers ───────────────────────────────────────────────────────────

/**
 * Get a primary type label for display.
 * With the P31-based system, typeLabels already contains human-readable
 * labels fetched from the Wikidata Action API.
 */
export const getPrimaryTypeLabel = (node) => {
  if (node.typeLabels && node.typeLabels.length > 0) return node.typeLabels[0];
  if (node.types && node.types.length > 0) return node.types[0];
  return 'entity';
};

// ── Aggregate nodes (Phase 3) ─────────────────────────────────────────────

/**
 * Create a new AggregateNode — represents a group of incoming entities
 * aggregated by PID (and optionally tracking their P31 types).
 *
 * @param {Object} opts
 * @param {string} opts.id              — Synthetic ID (e.g. 'agg:Q517:P921')
 * @param {string} opts.sourceUri       — URI of the entity these point to
 * @param {string} opts.predicate       — PID of the incoming relation
 * @param {string} opts.predicateLabel  — Human-readable predicate label
 * @param {string[]} opts.targetClasses — Array of QIDs of the P31 types of aggregated entities
 * @param {string[]} opts.targetClassLabels — Array of human-readable type labels
 * @param {number} opts.count           — Number of entities in this aggregate
 * @param {string} opts.direction       — 'incoming' (always for aggregates)
 * @param {boolean} opts.expanded       — Whether the aggregate has been expanded
 * @param {boolean} opts.collapsed      — Whether collapsed after expansion
 * @param {string[]} opts.children      — URIs of child entities (when expanded)
 * @param {boolean} opts.loadingChildren — Whether children are being loaded
 */
export const createAggregateNode = ({
  id,
  sourceUri,
  predicate,
  predicateLabel = '',
  targetClasses = [],
  targetClassLabels = [],
  count = 0,
  direction = 'incoming',
  expanded = false,
  collapsed = false,
  children = [],
  loadingChildren = false,
} = {}) => {
  // Create a combined label from the first few classes (or default to 'Entités')
  const primaryLabel = targetClassLabels.length > 0 && targetClassLabels[0] !== 'unknown'
    ? targetClassLabels.slice(0, 2).join(' / ') + (targetClassLabels.length > 2 ? ' ...' : '')
    : 'Entités';

  return {
    // Core identity
    id,
    type: 'aggregate',
    uri: id, // Use synthetic ID as URI for store compatibility

    // Aggregate metadata
    sourceUri,
    predicate,
    predicateLabel,
    targetClasses,
    targetClassLabels,
    count,
    direction,

    // Expansion state
    expanded,
    collapsed,
    children,
    loadingChildren,

    // LodNode-compatible fields for rendering
    label: `${count} ${primaryLabel}`,
    types: targetClasses,
    typeLabels: targetClassLabels,
    properties: {},
    temporal: { start: null, end: null, precision: null },
    geo: { lat: null, lon: null },
    sources: [],
    thumbnailUrl: null,
    externalIds: {},
    description: `${count} entités de types variés via ${predicateLabel || predicate}`,
    aliases: [],
  };
};
