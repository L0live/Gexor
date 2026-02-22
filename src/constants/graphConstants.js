// ============================================================================
// Constantes partagées du graphe NexReec
// ============================================================================

// Couleurs par type de REEC
export const COLOR_MAP = {
  Entity: '#3b82f6',
  Event: '#10b981',
  Context: '#8b5cf6',
  Default: '#64748b'
};

// Géométrie
export const NODE_RADIUS = 8;
export const ARROW_SIZE = 3;

// Instanced meshes
export const MAX_INSTANCES = 5000;

// Profondeur max d'exploration
export const MAX_DEPTH = 10;

// Filtres par défaut
export const DEFAULT_FILTERS = {
  Entity: true,
  Event: true,
  Context: true,
  Relations: true,
  minConfiance: 0,
  dateRange: [null, null],
  selectedTags: new Set(),
  advancedSearch: ""
};

export const DEFAULT_FILTER_MODES = {
  Entity: 'opacity',
  Event: 'opacity',
  Context: 'opacity',
  Relations: 'opacity'
};

export const DEFAULT_OPACITY_LEVELS = {
  Entity: 1.0,
  Event: 1.0,
  Context: 1.0,
  Relations: 0.5
};

// Types de noeuds
export const NODE_TYPES = ['Entity', 'Event', 'Context'];

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
  minMovement: 0.4,
  distanceThresholdMode: 'mean',
  gravity: 10,                             // attractive pull toward center
  nodeStrength: 1000,                      // global repulsion (positive; library applies sign)
  edgeStrength: 200,
  linkDistance: 200,
  coulombDisScale: 0.005,
  damping: 0.9,
  maxSpeed: 500,
  interval: 0.02,
  factor: 1,
  preventOverlap: true,
  center: [0, 0, 0],
};

// SharedArrayBuffer stride (x, y, z per node)
export const SAB_POSITION_STRIDE = 3;
