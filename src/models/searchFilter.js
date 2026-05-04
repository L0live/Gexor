// ============================================================================
// Search Filter Data Model
// ============================================================================

export const FILTER_TYPES = {
  TEXT:       'text',
  ENTITY:    'entity',
  PROPERTY:  'property',
  TYPE:      'type',
  HAS_VALUE: 'has_value',
};

export const FILTER_OPERATORS = { AND: 'and', OR: 'or', NOT: 'not' };

export const FILTER_COLORS = {
  text:       '#3b82f6',  // blue
  entity:     '#f59e0b',  // amber
  property:   '#8b5cf6',  // violet
  type:       '#ef4444',  // red
  has_value:  '#f97316',  // orange
};

/**
 * @param {string} type     — FILTER_TYPES.*
 * @param {string} value    — QID, PID, text, 'true', etc.
 * @param {string} label    — Human-readable label
 * @param {string} operator — 'and' | 'or' | 'not'
 * @param {Object} meta     — Optional data (typeLabel, propLabel, pid+qid for HAS_VALUE)
 * @param {string|null} groupId — Shared ID for OR-grouped filters (null = standalone)
 */
export function createFilter(type, value, label, operator = 'and', meta = {}, groupId = null) {
  return {
    id: `${type}-${value}-${Date.now()}`,
    type,
    operator,
    value,
    label,
    color: FILTER_COLORS[type] || '#6b7280',
    meta,
    groupId,
  };
}

/**
 * Creates a group of OR filters sharing a groupId.
 * @param {Array} filters — Array of filter objects to group
 * @returns {Array} — Filters with shared groupId and operator: 'or'
 */
export function createOrGroup(filters) {
  const groupId = `or-group-${Date.now()}`;
  return filters.map(f => ({ ...f, operator: 'or', groupId }));
}
