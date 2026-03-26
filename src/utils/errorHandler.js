/**
 * errorHandler — Consistent error classification and logging.
 *
 * All store actions and API calls should use these helpers so that:
 *  - Error codes are machine-readable ('network', 'not_found', 'parse', 'unknown')
 *  - Console output is uniform (context prefix + code + message)
 *  - Frontend can distinguish transient vs. permanent failures
 */

/**
 * Classify an API error and log it consistently.
 *
 * @param {Error} err - The thrown error
 * @param {string} context - Human-readable context, e.g. 'fetchAndExpandNode Q517'
 * @returns {{ message: string, code: 'network'|'not_found'|'parse'|'unknown' }}
 */
export function handleApiError(err, context) {
  let code = 'unknown';

  if (err.name === 'AbortError') {
    code = 'network';
  } else if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
    code = 'network';
  } else if (err.message?.includes('404') || err.message?.toLowerCase().includes('not found')) {
    code = 'not_found';
  } else if (err instanceof SyntaxError || err.message?.includes('JSON')) {
    code = 'parse';
  }

  console.error(`[${context}] ${code}: ${err.message}`);
  return { message: err.message, code };
}

/**
 * Log a store action error consistently.
 *
 * @param {Error} err - The thrown error
 * @param {string} action - Action name, e.g. 'toggleNodePin'
 */
export function handleStoreError(err, action) {
  console.error(`[store:${action}]`, err);
}
