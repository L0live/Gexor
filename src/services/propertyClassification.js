// ============================================================================
// Gexor — Property Classification Service
//
// Programmatic access to wikidata_properties.json classification.
// Determines which Wikidata properties appear as graph edges (primary),
// which are relegated to detail panels (secondary), and which are
// context-dependent (user-configurable).
// ============================================================================

// Classification data is loaded lazily from the backend API at app startup.
// This removes ~100KB from the initial JS bundle.
let classificationData = null;
let _loadPromise = null;

/**
 * Preload classification data from the backend.
 * Call once at app startup (in Gexor.jsx) so that classification is ready
 * before the first entity fetch.
 * @returns {Promise<void>}
 */
export const preloadClassificationData = () => {
  if (classificationData) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = fetch('/api/properties/classification')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      classificationData = data;
    })
    .catch(err => {
      console.error('[classification] Failed to load from API:', err);
      // Graceful degradation: empty object means all PIDs are 'unclassified'
      classificationData = {};
    });
  return _loadPromise;
};

// ── Cache (computed once on first call) ────────────────────────────────────

let _alwaysPrimaryPids = null;
let _allSecondaryPids = null;
let _secondaryPidsByGroup = null;
let _contextDependentPids = null;
let _filteredDatatypes = null;
let _redundancyGroups = null;
let _noiseGroups = null;
let _primaryPidGroups = null;
let _redundancyPidLookup = null;   // PID → { groupKey, label, hierarchy, keepAsPrimary, priority }
let _noisePidSet = null;            // Set<string> of all B-axis PIDs

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract PID keys from an object whose keys are P-numbers (e.g. "P22").
 * Filters out keys starting with '_' (metadata).
 */
const _extractPids = (obj) => {
  if (!obj) return [];
  return Object.keys(obj).filter(k => /^P\d+$/.test(k));
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get PIDs that should ALWAYS be graph edges (D_always_primary).
 * @returns {Set<string>}
 */
export const getAlwaysPrimaryPids = () => {
  if (_alwaysPrimaryPids) return _alwaysPrimaryPids;
  if (!classificationData) return new Set();
  const props = classificationData.D_always_primary?.properties || {};
  _alwaysPrimaryPids = new Set(_extractPids(props));
  return _alwaysPrimaryPids;
};

/**
 * Get all secondary PIDs (union of redundancy groups A + noise groups B).
 * These should NOT appear as graph edges by default.
 * @returns {Set<string>}
 */
export const getAllSecondaryPids = () => {
  if (_allSecondaryPids) return _allSecondaryPids;
  if (!classificationData) return new Set();
  const result = new Set();
  
  // A — Redundancy groups
  const aGroups = classificationData.A_redundancy_groups || {};
  for (const [groupKey, group] of Object.entries(aGroups)) {
    if (groupKey.startsWith('_')) continue;
    const props = group.properties || {};
    _extractPids(props).forEach(pid => result.add(pid));
  }
  
  // B — Noise groups
  const bGroups = classificationData.B_noise_compact_ui || {};
  for (const [groupKey, group] of Object.entries(bGroups)) {
    if (groupKey.startsWith('_')) continue;
    const props = group.properties || {};
    _extractPids(props).forEach(pid => result.add(pid));
    // Also handle special cases like B1 which uses "exemples_canoniques"
    if (group.exemples_canoniques) {
      _extractPids(group.exemples_canoniques).forEach(pid => result.add(pid));
    }
  }
  
  _allSecondaryPids = result;
  return _allSecondaryPids;
};

/**
 * Get secondary PIDs organized by group key.
 * @returns {Map<string, {label: string, rationale: string, pids: Set<string>}>}
 */
export const getSecondaryPidsByGroup = () => {
  if (_secondaryPidsByGroup) return _secondaryPidsByGroup;
  if (!classificationData) return new Map();
  const result = new Map();
  
  // A — Redundancy groups
  const aGroups = classificationData.A_redundancy_groups || {};
  for (const [groupKey, group] of Object.entries(aGroups)) {
    if (groupKey.startsWith('_')) continue;
    const pids = new Set(_extractPids(group.properties || {}));
    result.set(groupKey, {
      label: group._label || groupKey,
      rationale: group._rationale || '',
      pids,
    });
  }
  
  // B — Noise groups
  const bGroups = classificationData.B_noise_compact_ui || {};
  for (const [groupKey, group] of Object.entries(bGroups)) {
    if (groupKey.startsWith('_')) continue;
    const pids = new Set(_extractPids(group.properties || {}));
    if (group.exemples_canoniques) {
      _extractPids(group.exemples_canoniques).forEach(pid => pids.add(pid));
    }
    result.set(groupKey, {
      label: group._label || groupKey,
      rationale: group._rationale || '',
      pids,
    });
  }
  
  _secondaryPidsByGroup = result;
  return _secondaryPidsByGroup;
};

/**
 * Get context-dependent PIDs with metadata.
 * @returns {Map<string, {label: string, default: string, primaryIf: string}>}
 */
export const getContextDependentPids = () => {
  if (_contextDependentPids) return _contextDependentPids;
  if (!classificationData) return new Map();
  const result = new Map();
  const props = classificationData.C_context_dependent?.properties || {};
  for (const [pid, meta] of Object.entries(props)) {
    if (!pid.startsWith('P')) continue;
    result.set(pid, {
      label: meta.label || pid,
      default: meta.default || 'secondary',
      primaryIf: meta.primary_if || '',
    });
  }
  _contextDependentPids = result;
  return _contextDependentPids;
};

/**
 * Get Wikidata datatypes that should be auto-filtered (never graph edges).
 * @returns {Set<string>}
 */
export const getFilteredDatatypes = () => {
  if (_filteredDatatypes) return _filteredDatatypes;
  if (!classificationData) return new Set();
  const coverage = classificationData.couverture_automatique_par_datatype || {};
  _filteredDatatypes = new Set(
    Object.keys(coverage).filter(k => !k.startsWith('_'))
  );
  return _filteredDatatypes;
};

/**
 * Get redundancy group metadata (A-axis) for UI display.
 * @returns {Array<{key: string, label: string, rationale: string, hierarchy: string, keepAsPrimary: string, pids: Object}>}
 */
export const getRedundancyGroups = () => {
  if (_redundancyGroups) return _redundancyGroups;
  if (!classificationData) return [];
  const aGroups = classificationData.A_redundancy_groups || {};
  _redundancyGroups = [];
  for (const [key, group] of Object.entries(aGroups)) {
    if (key.startsWith('_')) continue;
    _redundancyGroups.push({
      key,
      label: group._label || key,
      rationale: group._rationale || '',
      hierarchy: group._hierarchy || '',
      keepAsPrimary: group._keep_as_primary || '',
      pids: group.properties || {},
    });
  }
  return _redundancyGroups;
};

/**
 * Get noise group metadata (B-axis) for UI display.
 * @returns {Array<{key: string, label: string, rationale: string, pids: Object}>}
 */
export const getNoiseGroups = () => {
  if (_noiseGroups) return _noiseGroups;
  if (!classificationData) return [];
  const bGroups = classificationData.B_noise_compact_ui || {};
  _noiseGroups = [];
  for (const [key, group] of Object.entries(bGroups)) {
    if (key.startsWith('_')) continue;
    _noiseGroups.push({
      key,
      label: group._label || key,
      rationale: group._rationale || '',
      pids: group.properties || {},
    });
  }
  return _noiseGroups;
};

/**
 * Get D_always_primary PIDs organized by semantic category for UI.
 * Categories are inferred from adjacency in the JSON structure.
 * @returns {Array<{category: string, pids: Array<{pid: string, label: string}>}>}
 */
export const getPrimaryPidGroups = () => {
  if (_primaryPidGroups) return _primaryPidGroups;
  if (!classificationData) return [];
  const props = classificationData.D_always_primary?.properties || {};
  
  // Group by semantic category based on the JSON comments/notes
  const categories = {
    'Famille': ['P22', 'P25', 'P26', 'P40'],
    'Biographie': ['P19', 'P20', 'P69', 'P106', 'P108', 'P39', 'P102', 'P166'],
    'Création': ['P50', 'P57', 'P86', 'P170', 'P175', 'P161', 'P264', 'P272'],
    'Structure': ['P361', 'P527', 'P131', 'P179', 'P195'],
    'Thématique': ['P136', 'P135', 'P921', 'P101', 'P144', 'P629', 'P737', 'P800'],
    'Chronologie': ['P155', 'P156'],  // not in D_always_primary but was in DEFAULT
    'Production': ['P176', 'P186', 'P449', 'P495'],
    'Académique': ['P1066', 'P185', 'P61'],
    'Taxonomie': ['P171'],
  };
  
  _primaryPidGroups = [];
  const usedPids = new Set();
  
  for (const [category, pids] of Object.entries(categories)) {
    const items = pids
      .filter(pid => props[pid] || pid === 'P155' || pid === 'P156') // include chronological even if not in D_always
      .map(pid => ({
        pid,
        label: props[pid]?.label || pid,
      }));
    if (items.length > 0) {
      _primaryPidGroups.push({ category, pids: items });
      items.forEach(i => usedPids.add(i.pid));
    }
  }
  
  // Catch any uncategorized primary PIDs
  const uncategorized = _extractPids(props)
    .filter(pid => !usedPids.has(pid))
    .map(pid => ({ pid, label: props[pid]?.label || pid }));
  if (uncategorized.length > 0) {
    _primaryPidGroups.push({ category: 'Autres', pids: uncategorized });
  }
  
  return _primaryPidGroups;
};

// ── A-axis inverse lookup (PID → redundancy group metadata) ────────────

/**
 * Build a lookup from PID → redundancy group info.
 * Priority is assigned based on the `_hierarchy` field order (first = most specific = lowest number).
 * PIDs not listed in _hierarchy get priority 99.
 */
const _buildRedundancyPidLookup = () => {
  if (_redundancyPidLookup) return _redundancyPidLookup;
  _redundancyPidLookup = new Map();
  if (!classificationData) return _redundancyPidLookup;
  const aGroups = classificationData.A_redundancy_groups || {};
  for (const [groupKey, group] of Object.entries(aGroups)) {
    if (groupKey.startsWith('_')) continue;

    // Parse the hierarchy string to extract PID order (most specific first)
    // Format: "P625 (coordonnées) → P670/P6375 (adresse) → P131 (entité admin.) → P17 (pays) → P30 (continent)"
    const hierarchyPids = [];
    if (group._hierarchy) {
      const parts = group._hierarchy.split('→').map(s => s.trim());
      for (const part of parts) {
        // Extract PIDs like P131, or P670/P6375
        const pids = part.match(/P\d+/g);
        if (pids) hierarchyPids.push(...pids);
      }
    }

    // Parse _keep_as_primary to extract the "preferred" PIDs 
    const keepPids = new Set();
    if (group._keep_as_primary) {
      const found = group._keep_as_primary.match(/P\d+/g);
      if (found) found.forEach(p => keepPids.add(p));
    }

    const props = group.properties || {};
    for (const pid of _extractPids(props)) {
      const hIndex = hierarchyPids.indexOf(pid);
      _redundancyPidLookup.set(pid, {
        groupKey,
        label: group._label || groupKey,
        hierarchy: group._hierarchy || '',
        keepAsPrimary: group._keep_as_primary || '',
        isPreferred: keepPids.has(pid),
        priority: hIndex >= 0 ? hIndex : 99,
      });
    }
  }
  return _redundancyPidLookup;
};

/**
 * Get redundancy group info for a specific PID (A-axis inverse lookup).
 * @param {string} pid
 * @returns {{ groupKey: string, label: string, hierarchy: string, keepAsPrimary: string, isPreferred: boolean, priority: number } | null}
 */
export const getRedundancyGroupForPid = (pid) => {
  return _buildRedundancyPidLookup().get(pid) || null;
};

// ── B-axis noise lookup ────────────────────────────────────────────────────

/**
 * Build the Set of all B-axis (noise) PIDs.
 */
const _buildNoisePidSet = () => {
  if (_noisePidSet) return _noisePidSet;
  _noisePidSet = new Set();
  if (!classificationData) return _noisePidSet;
  const bGroups = classificationData.B_noise_compact_ui || {};
  for (const [key, group] of Object.entries(bGroups)) {
    if (key.startsWith('_')) continue;
    _extractPids(group.properties || {}).forEach(pid => _noisePidSet.add(pid));
    if (group.exemples_canoniques) {
      _extractPids(group.exemples_canoniques).forEach(pid => _noisePidSet.add(pid));
    }
  }
  return _noisePidSet;
};

/**
 * Check if a PID belongs to a B-axis noise group.
 * @param {string} pid
 * @returns {boolean}
 */
export const isNoisePid = (pid) => _buildNoisePidSet().has(pid);

/**
 * Check if a PID belongs to an A-axis redundancy group.
 * @param {string} pid
 * @returns {boolean}
 */
export const isRedundancyPid = (pid) => _buildRedundancyPidLookup().has(pid);

/**
 * Deduplicate PIDs within redundancy groups (A-axis).
 * For each group with multiple PIDs present, keep only the most specific one.
 *
 * @param {Set<string>} pidSet — PIDs present in the entity's claims
 * @param {Set<string>} promotedPids — PIDs force-promoted by the Context Resolver
 * @returns {{ survivorsByGroup: Map<string, string>, demotedPids: Set<string> }}
 */
export const deduplicateRedundancyGroup = (pidSet, promotedPids = new Set()) => {
  const lookup = _buildRedundancyPidLookup();
  // Group present PIDs by their redundancy group
  const groupPids = new Map(); // groupKey → [{ pid, priority, isPreferred }]
  for (const pid of pidSet) {
    const info = lookup.get(pid);
    if (!info) continue;
    if (!groupPids.has(info.groupKey)) groupPids.set(info.groupKey, []);
    groupPids.get(info.groupKey).push({ pid, priority: info.priority, isPreferred: info.isPreferred });
  }

  const survivorsByGroup = new Map();
  const demotedPids = new Set();

  for (const [groupKey, pids] of groupPids) {
    if (pids.length <= 1) {
      if (pids.length === 1) survivorsByGroup.set(groupKey, pids[0].pid);
      continue;
    }
    // Sort: isPreferred first, then by priority ascending (most specific first)
    pids.sort((a, b) => {
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      return a.priority - b.priority;
    });
    survivorsByGroup.set(groupKey, pids[0].pid);
    for (let i = 1; i < pids.length; i++) {
      // If promoted by Context Resolver, keep as primary
      if (!promotedPids.has(pids[i].pid)) {
        demotedPids.add(pids[i].pid);
      }
    }
  }

  return { survivorsByGroup, demotedPids };
};

// ── Wikimedia noise types ──────────────────────────────────────────────────

export const WIKIMEDIA_NOISE_TYPES = new Set([
  'Q4167836',   // Wikimedia category page
  'Q4167410',   // Wikimedia disambiguation page
  'Q11266439',  // Wikimedia template
  'Q13406463',  // Wikimedia list article
  'Q17442446',  // Wikimedia internal item
  'Q15184295',  // Wikimedia module
  'Q17633526',  // Wikinews article
]);

/**
 * Check if a set of P31 types contains only Wikimedia noise types.
 * @param {string[]} types — P31 QIDs
 * @returns {boolean}
 */
export const isWikimediaNoise = (types) => {
  if (!types || types.length === 0) return false;
  return types.every(t => WIKIMEDIA_NOISE_TYPES.has(t));
};

// ── Classification lookup ──────────────────────────────────────────────────

/**
 * Classify a single PID.
 * @param {string} pid — Property ID (e.g. "P22")
 * @returns {'primary' | 'secondary' | 'context-dependent'}
 */
export const classifyPid = (pid) => {
  if (getAlwaysPrimaryPids().has(pid)) return 'primary';
  if (getContextDependentPids().has(pid)) return 'context-dependent';
  if (getAllSecondaryPids().has(pid)) return 'secondary';
  // Unknown PIDs default to unclassified (treated as potential primary)
  return 'unclassified';
};

/**
 * Get the secondary group key a PID belongs to (if any).
 * @param {string} pid
 * @returns {string|null} — Group key (e.g. "A1_localisation_geographique") or null
 */
export const getSecondaryGroupForPid = (pid) => {
  for (const [groupKey, groupData] of getSecondaryPidsByGroup()) {
    if (groupData.pids.has(pid)) return groupKey;
  }
  return null;
};

/**
 * Get property label from the classification JSON.
 * Returns null if the property is not in the classification.
 * @param {string} pid
 * @returns {string|null}
 */
export const getClassificationLabel = (pid) => {
  if (!classificationData) return null;
  // Check D_always_primary
  const primary = classificationData.D_always_primary?.properties?.[pid];
  if (primary?.label) return primary.label;
  
  // Check C_context_dependent
  const ctx = classificationData.C_context_dependent?.properties?.[pid];
  if (ctx?.label) return ctx.label;
  
  // Check A groups
  const aGroups = classificationData.A_redundancy_groups || {};
  for (const [key, group] of Object.entries(aGroups)) {
    if (key.startsWith('_')) continue;
    if (group.properties?.[pid]?.label) return group.properties[pid].label;
  }
  
  // Check B groups
  const bGroups = classificationData.B_noise_compact_ui || {};
  for (const [key, group] of Object.entries(bGroups)) {
    if (key.startsWith('_')) continue;
    if (group.properties?.[pid]?.label) return group.properties[pid].label;
  }
  
  return null;
};
