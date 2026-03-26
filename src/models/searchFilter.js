// ============================================================================
// Search Filter Data Model
// ============================================================================

export const FILTER_TYPES = {
  TEXT:       'text',
  IN_GRAPH:  'in_graph',
  ENTITY:    'entity',
  PROPERTY:  'property',
  TYPE:      'type',
  HAS_VALUE: 'has_value',
};

export const FILTER_OPERATORS = { AND: 'and', OR: 'or', NOT: 'not' };

export const FILTER_COLORS = {
  text:       '#3b82f6',  // blue
  in_graph:   '#f97316',  // orange (Hors du graphe)
  entity:     '#f59e0b',  // amber
  property:   '#8b5cf6',  // violet
  type:       '#ef4444',  // red
  has_value:  '#f97316',  // orange
};

/**
 * @param {string} type     — FILTER_TYPES.*
 * @param {string} value    — QID, PID, text, 'true', etc.
 * @param {string} label    — Human-readable badge label
 * @param {string} operator — 'and' | 'or' | 'not'
 * @param {Object} meta     — Optional data (typeLabel, propLabel, pid+qid for HAS_VALUE)
 */
export function createFilter(type, value, label, operator = 'and', meta = {}) {
  return {
    id: `${type}-${value}-${Date.now()}`,
    type,
    operator,
    value,
    label,
    color: FILTER_COLORS[type] || '#6b7280',
    meta,
  };
}
