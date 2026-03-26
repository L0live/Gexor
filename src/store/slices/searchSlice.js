// ============================================================================
// searchSlice — Search state, filters, taxonomy, and search execution
// ============================================================================

import { FILTER_TYPES, FILTER_OPERATORS, createFilter } from '../../models/searchFilter';

const OPERATOR_CYCLE = [FILTER_OPERATORS.AND, FILTER_OPERATORS.OR, FILTER_OPERATORS.NOT];
const SEARCH_HISTORY_KEY = 'gexor_search_history';
const MAX_HISTORY = 10;

export const createSearchSlice = (set, get) => ({
  // ─── State ───
  searchFilters: [],
  searchResults: [],
  searchLoading: false,
  searchModalOpen: false,
  searchQuery: '',
  searchOffset: 0,
  searchHasMore: false,
  taxonomyLoaded: false,
  taxonomyClasses: {},
  propertyMatrixLoaded: false,
  propertyMatrix: {},

  // ─── New: Scope (replaces IN_GRAPH filter) ───
  searchScope: 'graph', // 'graph' | 'wikidata' | 'visible'

  // ─── New: Search history ───
  searchHistory: [],

  // ─── Node exploration mode ───
  searchExplorationUri: null,    // URI du nœud exploré (null = mode recherche normal)
  searchDisplayMode: 'outgoing', // 'outgoing' | 'incoming' | 'shared'

  // ─── Modal ───
  openSearchModal: (initialFilters = [], initialScope = null, explorationUri = null) => {
    const updates = {
      searchModalOpen: true,
      searchFilters: initialFilters,
      searchResults: [],
      searchOffset: 0,
      searchHasMore: false,
      searchExplorationUri: explorationUri,
      ...(explorationUri ? { searchDisplayMode: 'outgoing' } : {}),
    };
    if (initialScope) updates.searchScope = initialScope;
    set(updates);

    // Load search history from sessionStorage
    try {
      const stored = sessionStorage.getItem(SEARCH_HISTORY_KEY);
      if (stored) set({ searchHistory: JSON.parse(stored) });
    } catch { /* ignore */ }

    // Auto-load taxonomy on first open
    const { taxonomyLoaded, loadTaxonomy } = get();
    if (!taxonomyLoaded) loadTaxonomy();
  },

  closeSearchModal: () => set({ searchModalOpen: false, searchExplorationUri: null }),

  // ─── New: Scope ───
  setSearchScope: (scope) => set({ searchScope: scope }),

  setSearchDisplayMode: (mode) => set({ searchDisplayMode: mode }),

  // ─── New: History ───
  addToHistory: (entry) => {
    const { searchHistory } = get();
    const newHistory = [entry, ...searchHistory.filter(h => h.id !== entry.id)].slice(0, MAX_HISTORY);
    set({ searchHistory: newHistory });
    try { sessionStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory)); } catch { /* ignore */ }
  },

  restoreFromHistory: (entry) => {
    set({
      searchQuery: entry.query || '',
      searchFilters: entry.filters || [],
      searchScope: entry.scope || 'graph',
    });
    get().executeSearch();
  },

  // ─── Filters CRUD ───
  addFilter: (filter) => {
    const { searchFilters } = get();
    // Prevent duplicate in_graph toggles (legacy)
    if (filter.type === FILTER_TYPES.IN_GRAPH) {
      const existing = searchFilters.find(f => f.type === FILTER_TYPES.IN_GRAPH);
      if (existing) return;
    }
    set({ searchFilters: [...searchFilters, filter] });
  },

  removeFilter: (filterId) => {
    set({ searchFilters: get().searchFilters.filter(f => f.id !== filterId) });
  },

  clearFilters: () => set({ searchFilters: [], searchQuery: '', searchResults: [], searchOffset: 0, searchHasMore: false }),

  toggleFilterOperator: (filterId) => {
    set({
      searchFilters: get().searchFilters.map(f => {
        if (f.id !== filterId) return f;
        const idx = OPERATOR_CYCLE.indexOf(f.operator);
        const next = OPERATOR_CYCLE[(idx + 1) % OPERATOR_CYCLE.length];
        return { ...f, operator: next };
      }),
    });
  },

  // ─── Taxonomy ───
  loadTaxonomy: async () => {
    if (get().taxonomyLoaded) return;
    try {
      const resp = await fetch('/api/taxonomy/light');
      const data = await resp.json();
      set({ taxonomyClasses: data.classes, taxonomyLoaded: true });
    } catch (err) {
      console.error('[searchSlice] Failed to load taxonomy:', err);
    }
  },

  getTaxonomyAncestors: (qid) => {
    const { taxonomyClasses } = get();
    const path = [];
    let current = qid;
    const visited = new Set();
    while (current && !visited.has(current)) {
      visited.add(current);
      const cls = taxonomyClasses[current];
      if (!cls) break;
      const parent = cls.parents?.[0];
      if (!parent) break;
      path.push(parent);
      current = parent;
    }
    return path;
  },

  getTaxonomyChildren: (qid) => {
    const { taxonomyClasses } = get();
    const cls = taxonomyClasses[qid];
    return cls?.children || [];
  },

  getTaxonomyLabel: (qid, lang = 'fr') => {
    const { taxonomyClasses } = get();
    const cls = taxonomyClasses[qid];
    if (!cls?.labels) return qid;
    return cls.labels[lang] || cls.labels['en'] || qid;
  },

  // ─── Property Matrix ───
  loadPropertyMatrix: async () => {
    if (get().propertyMatrixLoaded) return;
    try {
      const resp = await fetch('/api/taxonomy/property-matrix');
      const data = await resp.json();
      set({ propertyMatrix: data.matrix, propertyMatrixLoaded: true });
    } catch (err) {
      console.error('[searchSlice] Failed to load property matrix:', err);
    }
  },

  getSuggestedProperties: (typeQid, limit = 20) => {
    const { propertyMatrix } = get();
    const entry = propertyMatrix?.[typeQid];
    if (!entry) return [];
    return Object.entries(entry.properties)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, limit)
      .map(([pid, stats]) => ({ pid, ...stats }));
  },

  // ─── Search execution ───
  setSearchQuery: (text) => set({ searchQuery: text }),

  executeSearch: async (loadMore = false) => {
    const { searchQuery, searchFilters, loadedNodes, searchScope, visibleNodeIds } = get();
    const text = searchQuery.trim();

    // Use scope instead of IN_GRAPH filter
    const isRemote = searchScope === 'wikidata';
    const isVisible = searchScope === 'visible';

    const typeFilters = searchFilters.filter(f => f.type === FILTER_TYPES.TYPE && f.operator !== FILTER_OPERATORS.NOT);
    const notTypeFilters = searchFilters.filter(f => f.type === FILTER_TYPES.TYPE && f.operator === FILTER_OPERATORS.NOT);
    const propFilters = searchFilters.filter(f => f.type === FILTER_TYPES.PROPERTY);
    const entityFilters = searchFilters.filter(f => f.type === FILTER_TYPES.ENTITY);
    const hvFilters = searchFilters.filter(f => f.type === FILTER_TYPES.HAS_VALUE);
    const REMOTE_LIMIT = 50;

    // Nothing to search
    if (!text && searchFilters.length === 0) {
      set({ searchResults: [], searchOffset: 0, searchHasMore: false });
      return;
    }

    const currentOffset = loadMore ? get().searchOffset : 0;
    set({ searchLoading: true });

    try {
      let pool = [];
      let remoteCount = 0;

      // Build local pool based on scope
      const allNodes = Object.values(loadedNodes);
      const localNodes = isVisible
        ? allNodes.filter(n => visibleNodeIds?.has(n.uri))
        : allNodes;

      const localPool = localNodes.map(n => ({
        uri: n.uri,
        label: n.label,
        description: n.description,
        types: n.types || [],
        typeLabels: n.typeLabels || [],
        inGraph: true,
        _raw: n,
      }));

      if (!isRemote) {
        // graph or visible scope: local only
        pool = localPool;
      } else {
        // wikidata scope: combine local + remote
        const hasStructuralFilters = typeFilters.length > 0 || propFilters.length > 0 || hvFilters.length > 0;

        let remoteResults = [];
        if (hasStructuralFilters) {
          try {
            const resp = await fetch('/api/search/filtered', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filters: searchFilters.filter(f =>
                  f.type === FILTER_TYPES.TYPE ||
                  f.type === FILTER_TYPES.PROPERTY ||
                  f.type === FILTER_TYPES.HAS_VALUE
                ),
                text: text || undefined,
                limit: REMOTE_LIMIT,
                offset: currentOffset,
                lang: 'fr',
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              const items = data.results || [];
              remoteCount = items.length;
              remoteResults = items.map(r => ({
                uri: r.uri,
                label: r.label,
                description: r.description,
                types: r.types || [],
                typeLabels: r.typeLabels || [],
                inGraph: false,
                _fromRemote: true,
              }));
            }
          } catch (err) {
            console.warn('[searchSlice] Filtered search failed, falling back to text only:', err);
          }
        } else if (text.length >= 2) {
          try {
            const resp = await fetch(`/api/search?q=${encodeURIComponent(text)}&lang=fr&limit=30`);
            if (resp.ok) {
              const results = await resp.json();
              remoteCount = results.length;
              remoteResults = (results || []).map(r => ({
                uri: r.uri,
                label: r.label,
                description: r.description,
                types: [],
                typeLabels: [],
                inGraph: false,
                _fromRemote: true,
              }));
            }
          } catch {
            // silently fail
          }
        }

        // Merge local + remote, dedup by URI
        const seen = new Set();
        pool = [];
        for (const item of localPool) {
          seen.add(item.uri);
          pool.push(item);
        }
        for (const item of remoteResults) {
          if (!seen.has(item.uri)) {
            seen.add(item.uri);
            pool.push(item);
          } else {
            const existing = pool.find(p => p.uri === item.uri);
            if (existing) existing.inGraph = true;
          }
        }
      }

      // ── Apply filters locally (post-filter) ──

      // Text filter
      if (text) {
        const lc = text.toLowerCase();
        pool = pool.filter(n =>
          n._fromRemote ||
          n.label?.toLowerCase().includes(lc) ||
          n.description?.toLowerCase().includes(lc) ||
          n.uri?.toLowerCase().includes(lc)
        );
      }

      // Entity filter
      if (entityFilters.length > 0) {
        const { loadedRelations } = get();
        const entityUris = new Set(entityFilters.map(f => f.value));
        const connectedUris = new Set();
        for (const rel of Object.values(loadedRelations)) {
          if (entityUris.has(rel.source)) connectedUris.add(rel.target);
          if (entityUris.has(rel.target)) connectedUris.add(rel.source);
        }
        for (const uri of entityUris) connectedUris.add(uri);
        pool = pool.filter(n => n._fromRemote || connectedUris.has(n.uri));
      }

      // Type filters (with P279 descendants)
      if (typeFilters.length > 0) {
        const { taxonomyClasses } = get();
        const andFilters = typeFilters.filter(f => f.operator !== FILTER_OPERATORS.OR);
        const orFilters = typeFilters.filter(f => f.operator === FILTER_OPERATORS.OR);

        for (const tf of andFilters) {
          const matchingQids = _getTypeAndDescendants(tf.value, taxonomyClasses);
          pool = pool.filter(n =>
            n._fromRemote || n.types?.some(t => {
              const qid = t.startsWith('http') ? t.split('/').pop() : t;
              return matchingQids.has(qid);
            })
          );
        }

        if (orFilters.length > 0) {
          const orQidSets = orFilters.map(f => _getTypeAndDescendants(f.value, taxonomyClasses));
          pool = pool.filter(n => {
            if (n._fromRemote) return true;
            return orQidSets.some(qidSet =>
              n.types?.some(t => {
                const qid = t.startsWith('http') ? t.split('/').pop() : t;
                return qidSet.has(qid);
              })
            );
          });
        }
      }

      // NOT type filters
      if (notTypeFilters.length > 0) {
        const { taxonomyClasses } = get();
        for (const ntf of notTypeFilters) {
          const matchingQids = _getTypeAndDescendants(ntf.value, taxonomyClasses);
          pool = pool.filter(n =>
            !n.types?.some(t => {
              const qid = t.startsWith('http') ? t.split('/').pop() : t;
              return matchingQids.has(qid);
            })
          );
        }
      }

      // Property filters
      for (const pf of propFilters) {
        if (pf.operator === FILTER_OPERATORS.NOT) {
          pool = pool.filter(n => n._fromRemote || !n._raw?.properties?.[pf.value]);
        } else {
          pool = pool.filter(n => n._fromRemote || n._raw?.properties?.[pf.value]);
        }
      }

      // HAS_VALUE filters
      for (const hv of hvFilters) {
        const { pid, qid } = hv.meta;
        pool = pool.filter(n => {
          if (n._fromRemote) return true;
          const prop = n._raw?.properties?.[pid];
          if (!prop) return false;
          return prop.values?.some(v => {
            const val = v.value?.startsWith?.('http') ? v.value.split('/').pop() : v.value;
            return val === qid;
          });
        });
      }

      // Clean internal fields
      const results = pool.map(({ _raw, _fromRemote, ...rest }) => rest);

      // Sort: in-graph first, then alphabetically
      results.sort((a, b) => {
        if (a.inGraph && !b.inGraph) return -1;
        if (!a.inGraph && b.inGraph) return 1;
        return (a.label || '').localeCompare(b.label || '');
      });

      const newOffset = currentOffset + remoteCount;
      const hasMore = remoteCount >= REMOTE_LIMIT;

      if (loadMore) {
        const existing = get().searchResults;
        const existingUris = new Set(existing.map(r => r.uri));
        const newResults = results.filter(r => !existingUris.has(r.uri));
        set({
          searchResults: [...existing, ...newResults],
          searchLoading: false,
          searchOffset: newOffset,
          searchHasMore: hasMore,
        });
      } else {
        const finalResults = results.slice(0, 200);
        set({
          searchResults: finalResults,
          searchLoading: false,
          searchOffset: newOffset,
          searchHasMore: hasMore,
        });

        // Save to history if we have meaningful search input
        if (text || searchFilters.length > 0) {
          get().addToHistory({
            id: `${text || ''}-${searchFilters.map(f => f.value).join(',')}`,
            query: text,
            filters: searchFilters.map(({ id, ...rest }) => rest),
            scope: searchScope,
            resultCount: finalResults.length,
            timestamp: Date.now(),
          });
        }
      }

    } catch (err) {
      console.error('[searchSlice] Search execution failed:', err);
      set({ searchResults: [], searchLoading: false, searchOffset: 0, searchHasMore: false });
    }
  },
});

// ── Helper: BFS descendants in taxonomy ──
function _getTypeAndDescendants(qid, taxonomyClasses) {
  const result = new Set([qid]);
  const queue = [qid];
  while (queue.length > 0) {
    const current = queue.shift();
    const cls = taxonomyClasses[current];
    if (!cls) continue;
    for (const child of (cls.children || [])) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}
