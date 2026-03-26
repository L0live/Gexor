/**
 * validators — Lightweight structural validation for API responses.
 *
 * Non-throwing: logs warnings but never blocks data flow (graceful degradation).
 * Call at system boundaries (after response.json()) to catch schema drift early.
 */

/**
 * Validate a LodNode response from the backend.
 * @param {any} data - The parsed JSON response
 * @param {string} [context] - Context for error messages
 * @returns {boolean} true if valid
 */
export function validateLodNode(data, context = '') {
  const pfx = context ? `[validate:LodNode:${context}]` : '[validate:LodNode]';

  if (!data || typeof data !== 'object') {
    console.warn(`${pfx} not an object`);
    return false;
  }
  if (typeof data.uri !== 'string' || !data.uri) {
    console.warn(`${pfx} missing or invalid uri`);
    return false;
  }
  if (typeof data.label !== 'string') {
    console.warn(`${pfx} label is not a string`);
    return false;
  }
  if (!Array.isArray(data.types)) {
    console.warn(`${pfx} types is not an array`);
    return false;
  }
  if (!data.properties || typeof data.properties !== 'object') {
    console.warn(`${pfx} properties is not an object`);
    return false;
  }
  return true;
}

/**
 * Validate a LodEdge response from the backend.
 * @param {any} data - The parsed JSON response
 * @param {string} [context] - Context for error messages
 * @returns {boolean} true if valid
 */
export function validateLodEdge(data, context = '') {
  const pfx = context ? `[validate:LodEdge:${context}]` : '[validate:LodEdge]';

  if (!data || typeof data !== 'object') {
    console.warn(`${pfx} not an object`);
    return false;
  }
  if (typeof data.source !== 'string' || !data.source) {
    console.warn(`${pfx} missing or invalid source`);
    return false;
  }
  if (typeof data.target !== 'string' || !data.target) {
    console.warn(`${pfx} missing or invalid target`);
    return false;
  }
  if (typeof data.predicate !== 'string') {
    console.warn(`${pfx} predicate is not a string`);
    return false;
  }
  return true;
}
