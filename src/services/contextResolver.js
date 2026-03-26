// ============================================================================
// Gexor — Context Resolver
//
// Pure function: given an entity's P31 types, returns the Set of PIDs
// that should be promoted from 'context-dependent' to 'primary'.
//
// Uses static contextRules.json (small lookup table of ~20 type families).
// Strategy: direct P31 match first, then single P279 hop if needed (covers 97.8%).
// ============================================================================

import contextRules from '../data/contextRules.json';

const { rules } = contextRules;

// Pre-build a flat Map: QID → Set<PID> for O(1) lookup
let _ruleMap = null;

const _buildRuleMap = () => {
  if (_ruleMap) return _ruleMap;
  _ruleMap = new Map();
  for (const [qid, rule] of Object.entries(rules)) {
    if (rule.promote && rule.promote.length > 0) {
      _ruleMap.set(qid, {
        pids: new Set(rule.promote),
        conditions: rule.conditions || {},
      });
    }
  }
  return _ruleMap;
};

/**
 * Resolve which context-dependent PIDs should be promoted for the given entity types.
 *
 * @param {string[]} types — P31 QIDs of the entity (e.g. ['Q5', 'Q36180'])
 * @param {Object} [entityProperties] — Optional: the entity's properties object,
 *   used for condition evaluation (e.g. "multi-valued-only" for P27)
 * @returns {Set<string>} — Set of PIDs to promote (e.g. {'P36', 'P37', 'P38'})
 */
export const resolveContext = (types, entityProperties = null) => {
  if (!types || types.length === 0) return new Set();

  const ruleMap = _buildRuleMap();
  const promoted = new Set();

  for (const typeQid of types) {
    const rule = ruleMap.get(typeQid);
    if (!rule) continue;

    for (const pid of rule.pids) {
      // Check conditions if applicable
      const condition = rule.conditions[pid];
      if (condition === 'multi-valued-only' && entityProperties) {
        // Only promote if the property has multiple values
        const prop = entityProperties[pid];
        if (!prop || !prop.values || prop.values.length <= 1) continue;
      }
      promoted.add(pid);
    }
  }

  return promoted;
};

export default { resolveContext };
