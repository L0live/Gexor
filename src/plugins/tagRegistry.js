/**
 * TagRegistry — Allows external features (parcours, annotations, KG embeddings)
 * to inject tags into TagsFormat without coupling to the component directly.
 */

const tagProviders = new Map();

export const registerTagProvider = (id, provider) => {
  tagProviders.set(id, provider);
};

export const unregisterTagProvider = (id) => {
  tagProviders.delete(id);
};

/**
 * Resolve tags from all registered providers for a given node.
 * @param {string} nodeUri
 * @param {object} nodeData - LodNode data
 * @returns {Array<ExplorationTag|ActionTag>}
 */
export const resolveTagsForNode = (nodeUri, nodeData) => {
  const tags = [];
  for (const provider of tagProviders.values()) {
    try {
      const result = provider({ nodeUri, nodeData });
      if (Array.isArray(result)) tags.push(...result);
    } catch (e) {
      console.warn('[tagRegistry] provider error:', e);
    }
  }
  return tags;
};
