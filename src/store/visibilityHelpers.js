/**
 * visibilityHelpers — Pure helpers for node/edge visibility management.
 *
 * Single source of truth for:
 *  - Determining which nodes are visible (= keys of nodeSettings)
 *  - Cleaning orphaned edges when nodes are removed
 */

/**
 * Returns true if the node URI is currently visible in the graph.
 * A node is visible iff it is a key in nodeSettings.
 * @param {Object} nodeSettings - The nodeSettings map from dataSlice
 * @param {string} uri - Node URI to check
 * @returns {boolean}
 */
export function isNodeVisible(nodeSettings, uri) {
  return uri in nodeSettings;
}

/**
 * Returns a Set of all URIs currently visible in the graph.
 * @param {Object} nodeSettings - The nodeSettings map from dataSlice
 * @returns {Set<string>}
 */
export function getVisibleUris(nodeSettings) {
  return new Set(Object.keys(nodeSettings));
}

/**
 * Removes edges from loadedRelations whose source OR target is no longer
 * in the visible node set. Returns a new object (pure, no mutation).
 *
 * Call this whenever nodes are removed from nodeSettings to prevent
 * orphaned edges accumulating in the store.
 *
 * @param {Object} loadedRelations - Current edge map from dataSlice
 * @param {Set<string>} visibleUris - The currently visible node URIs
 * @returns {Object} Cleaned edge map
 */
export function cleanOrphanedEdges(loadedRelations, visibleUris) {
  const cleaned = {};
  for (const [id, edge] of Object.entries(loadedRelations)) {
    if (visibleUris.has(edge.source) && visibleUris.has(edge.target)) {
      cleaned[id] = edge;
    }
  }
  return cleaned;
}
