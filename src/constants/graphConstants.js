// ============================================================================
// Constantes partagées du graphe Gexor
// ============================================================================

// ── Dynamic category color ─────────────────────────────────────────────────
// Deterministic hash-based color for any arbitrary category string.
// Returns a pleasing HSL colour — same input always gives same output.
const _colorCache = {};

export const getCategoryColor = (category) => {
  if (!category || category === 'unknown') return '#64748b'; // slate
  if (_colorCache[category]) return _colorCache[category];

  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }

  const h = ((hash % 360) + 360) % 360;
  const s = 55 + (Math.abs(hash >> 8) % 20);  // 55-75%
  const l = 50 + (Math.abs(hash >> 16) % 15);  // 50-65%

  const color = `hsl(${h}, ${s}%, ${l}%)`;
  _colorCache[category] = color;
  return color;
};

/**
 * Same as getCategoryColor but returns hsla() with the given alpha (0–1).
 */
export const getCategoryColorAlpha = (category, alpha = 1) => {
  const hsl = getCategoryColor(category);
  const m = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!m) return `rgba(100, 116, 139, ${alpha})`;
  return `hsla(${m[1]}, ${m[2]}%, ${m[3]}%, ${alpha})`;
};

/**
 * Returns a very-dark hsla() sharing the category hue — useful for scene backgrounds.
 * Lightness is clamped to ~6% so the result is always near-black with a color tint.
 */
export const getCategoryColorDark = (category, alpha = 1) => {
  const hsl = getCategoryColor(category);
  const m = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!m) return `hsla(222, 47%, 6%, ${alpha})`;
  return `hsla(${m[1]}, ${m[2]}%, 6%, ${alpha})`;
};

// Géométrie
export const NODE_RADIUS = 8;
export const ARROW_SIZE = 3;

// Instanced meshes
export const MAX_INSTANCES = 5000;

// Direction d'exploration des voisins
export const EXPLORATION_DIRECTIONS = {
  OUTGOING: 'outgoing',   // Propriétés sortantes (comportement par défaut)
  INCOMING: 'incoming',   // Entités qui référencent le nœud sélectionné
  BOTH: 'both',           // Les deux directions
  SHARED: 'shared',       // NOUVEAU : similarité sémantique (arêtes synthétiques)
};
export const DEFAULT_EXPLORATION_DIRECTION = EXPLORATION_DIRECTIONS.INCOMING;

export const SHARED_NODE_OPACITY = 0.55;
export const SHARED_NODE_SCALE = 0.85;
export const SHARED_EDGE_OPACITY = 0.22;

// Radial layout plugin
export const DEFAULT_RADIAL_STRENGTH = 0;
export const DEFAULT_RADIAL_SPACING = 50;
export const DEFAULT_RADIAL_SPACING_MODE = 'proportional'; // 'fixed' | 'proportional'
export const RADIAL_RECALC_INTERVAL = 10; // frames between target recalculations

// Historique
export const MAX_HISTORY_SIZE = 50;

// ── Force layout (WASM) ────────────────────────────────────────────────────
export const BASE_REPULSION = 50;          // nodeStrength base (global, positive value, sign is applied internally)
export const FORCE_LAYOUT_DEFAULTS = {
  dimensions: 3,
  maxIteration: 500,
  minMovement: 0.01,
  distanceThresholdMode: 'max',
  gravity: 0,                             // attractive pull toward center
  nodeStrength: 100,                      // global repulsion (positive; library applies sign)
  edgeStrength: 100,
  linkDistance: 80,                          // PERF-3: was 30, raised to match NODE_RADIUS=8
  coulombDisScale: 0.005,
  damping: 0.9,                             // PERF-4: was 0.8, smoother convergence
  maxSpeed: 120,                            // PERF-4: was 500, avoids "big bang" on large graphs
  interval: 1/60, // 60fps
  factor: 1,
  preventOverlap: true,
  // center: [0, 0, 0],
};

// Aggregate node rendering
export const AGGREGATE_NODE_COLOR = '#8b5cf6';      // violet-500
export const AGGREGATE_NODE_COLOR_LOADING = '#6d28d9'; // violet-700 (while loading children)
export const AGGREGATE_NODE_MIN_SCALE = 1.2;
export const AGGREGATE_NODE_MAX_SCALE = 2.5;

/** Returns a size multiplier for an aggregate node based on its count */
export const getAggregateScale = (count) => {
  if (!count || count <= 1) return AGGREGATE_NODE_MIN_SCALE;
  const t = Math.min(Math.log2(count) / 10, 1); // 0..1 over range 1..1024
  return AGGREGATE_NODE_MIN_SCALE + t * (AGGREGATE_NODE_MAX_SCALE - AGGREGATE_NODE_MIN_SCALE);
};

// Highlight / selection colors
export const SELECTION_OUTLINE_COLOR = '#3b82f6';    // blue-500
export const ADDED_PULSE_COLOR = '#22c55e';          // green-500
export const ADDED_PULSE_DURATION = 1500;            // ms

// SharedArrayBuffer stride (x, y, z per node)
export const SAB_POSITION_STRIDE = 3;

/**
 * @typedef {Object} NodeSettings
 * @property {'incoming'|'outgoing'|'both'|'shared'|string} explorationDirection
 * @property {'force'|'radial'} renderMode
 * @property {number} radialStrength
 * @property {'fixed'|'proportional'} radialSpacingMode
 * @property {number} radialSpacing
 * @property {boolean} explored
 * @property {boolean} [isSharedNode]
 */

/**
 * Default per-node settings factory.
 * @param {Partial<NodeSettings>} [overrides]
 * @returns {NodeSettings}
 */
export const defaultNodeSettings = (overrides = {}) => ({
  explorationDirection: DEFAULT_EXPLORATION_DIRECTION,
  renderMode: 'force',
  radialStrength: DEFAULT_RADIAL_STRENGTH,
  radialSpacingMode: DEFAULT_RADIAL_SPACING_MODE,
  radialSpacing: DEFAULT_RADIAL_SPACING,
  explored: false,
  ...overrides,
});
