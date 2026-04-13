# CLAUDE.md — Gexor

## Project Overview

**Gexor** (Graph Exploration of RDFS) is an immersive 3D knowledge graph explorer for Wikidata Linked Open Data. Built with React 19, Three.js, WebAssembly-based force layout, and a Fastify backend.

## Commands

```bash
npm run dev          # Frontend (localhost:3000) + Backend (localhost:3001) in parallel
npm run dev:frontend # Frontend only
npm run dev:backend  # Backend only (requires PostgreSQL)
npm run build        # Production build (frontend)
npm run preview      # Preview production build
npm run start        # Start backend in production mode
npm run db:init      # Initialize PostgreSQL schema
```

> Requires Node.js ≥ 18 and PostgreSQL ≥ 16. No test suite currently.

### Docker

```bash
docker compose up -d --build   # Build & start all (frontend + backend + PostgreSQL)
docker compose down             # Stop all
docker compose logs -f          # Follow all logs
docker compose logs backend     # Backend logs only
```

App available at **http://localhost:3080**. Backend API at **http://localhost:3001**.

Docker files live in `docker/`:
- `docker/backend.Dockerfile` — Node.js 22 Alpine, runs Fastify
- `docker/frontend.Dockerfile` — Multi-stage: Vite build → nginx 1.27
- `docker/nginx.conf` — Serves SPA with COOP/COEP headers, proxies `/api/*` to backend
- `docker/postgres-init.sh` — Creates DB schema on first container start

### Database Setup (local dev)

```bash
sudo -u postgres createdb gexor -O $(whoami)
psql gexor < server/db/schema.sql
```

## Architecture

### Backend (Fastify + PostgreSQL)

The backend consolidates Wikidata API calls (reducing 6-10 client→Wikidata round-trips to 1 client→backend call), handles rate-limiting server-side, caches results in PostgreSQL, and proxies Wikimedia images to solve the COEP/SharedArrayBuffer conflict.

| Endpoint | Purpose |
|----------|---------|
| `GET /api/search?q=...&lang=fr` | Wikidata entity search |
| `GET /api/entity/:qid` | Full entity properties (LodNode) |
| `GET /api/entity/:qid/neighbors?direction=outgoing\|incoming\|both` | Neighbors |
| `GET /api/entity/:qid/expand?direction=both` | Entity + neighbors in one call || `GET /api/entity/:qid/incoming-aggregates?limit=100` | Grouped incoming refs (PID × P31 × count) |
| `GET /api/entity/:qid/aggregate-children?pid=...&type=...&limit=50` | Expand an aggregate into individual entities || `GET /api/image?url=...` | Wikimedia image proxy (COEP fix) |
| `POST /api/sparql` | Raw SPARQL proxy |
| `GET /api/health` | Health check |

#### Backend Key Files

| File | Role |
|------|------|
| [server/index.js](server/index.js) | Fastify entry point, plugin setup |
| [server/config.js](server/config.js) | Configuration (ports, DB, TTLs, Wikidata URLs) |
| [server/db/pool.js](server/db/pool.js) | PostgreSQL connection pool + schema init |
| [server/services/wikidataClient.js](server/services/wikidataClient.js) | Wikidata API logic (classify-first fetch, SPARQL aggregates, dedup, noise filter) |
| [server/services/labelResolver.js](server/services/labelResolver.js) | PID/QID label resolution with 3-tier cache (memory→PG→API) |
| [server/services/cacheService.js](server/services/cacheService.js) | PostgreSQL-backed cache (get/set/invalidate) |
| [server/routes/entity.js](server/routes/entity.js) | Entity & neighbor endpoints |
| [server/routes/search.js](server/routes/search.js) | Search endpoint |
| [server/routes/image.js](server/routes/image.js) | Image proxy |
| [server/routes/sparql.js](server/routes/sparql.js) | SPARQL proxy |

#### Caching Strategy (3 tiers)

1. **L1 — Frontend memory** (`src/services/cacheService.js`): in-session `Map`, 10-min TTL
2. **L2 — PostgreSQL `cache_entries`**: shared across sessions, 24h–30d TTL by domain
3. **L3 — Dedicated label tables** (`pid_labels`, `qid_labels`): 30-day TTL, batch-populated

### State Management (Zustand, 6 slices)

Entry point: [src/store/useGraphStore.js](src/store/useGraphStore.js)

| Slice | File | Responsibility |
|-------|------|----------------|
| `dataSlice` | [src/store/slices/dataSlice.js](src/store/slices/dataSlice.js) | Backend API calls, L1 cache, raw data, aggregates, expand/collapse, **per-node settings** (`nodeSettings`), `addNodeToGraph`, `recentlyAddedNodes` |
| `graphSlice` | [src/store/slices/graphSlice.js](src/store/slices/graphSlice.js) | Processed nodes/edges, PID visibility, context-promoted PIDs, **per-node direction filtering** |
| `uiSlice` | [src/store/slices/uiSlice.js](src/store/slices/uiSlice.js) | Selection, layout state, simulation, on-demand outgoing fetch for display |
| `pinSlice` | [src/store/slices/pinSlice.js](src/store/slices/pinSlice.js) | **Position lock only** (pin/unpin), drag management. Per-node depth/direction/radial delegated to `dataSlice.nodeSettings` |
| `historySlice` | [src/store/slices/historySlice.js](src/store/slices/historySlice.js) | Undo/redo snapshots |
| `searchSlice` | [src/store/slices/searchSlice.js](src/store/slices/searchSlice.js) | Search state, filters (`searchFilters`), results, taxonomy (`taxonomyClasses`, `getTaxonomyLabel`), pagination, search history |

### Data Flow

```
Wikidata API ←→ Fastify Backend (cache PG) ←→ Frontend fetch ←→ dataSlice → graphSlice → useForceLayout (WASM) → Scene (Three.js)
```

**Per-node exploration direction:** Exploration direction is configured **per node** via `dataSlice.nodeSettings[uri].explorationDirection` (default: `'incoming'`). Each pinned/expanded node can independently fetch outgoing (Action API), incoming (SPARQL aggregates), or both. Direction is controlled by `ExplorationBar` inside `InfoPanel` ([Off] [Propriétés] [Associés] [Load ↻]). Constants in `graphConstants.js` (`EXPLORATION_DIRECTIONS`, `DEFAULT_EXPLORATION_DIRECTION = 'incoming'`). `graphSlice.isEdgeVisibleForDirection()` filters edges based on per-node direction.

**Per-node settings (`nodeSettings`):** `dataSlice.nodeSettings` is a `{ [uri]: settings }` map holding per-node `depth`, `explorationDirection`, `renderMode`, `radialStrength`, etc. Created via `defaultNodeSettings()` factory. BFS roots in `graphSlice` = union of `pinnedNodes` + `nodeSettings` keys with `depth > 0`.

**Incoming aggregation:** When direction includes incoming, `fetchIncomingAggregates` returns grouped (PID, P31 type, count) results. Counts ≤ 5 auto-expand to individual nodes; counts > 5 produce `AggregateNode` objects rendered as violet hexagons. Users can expand/collapse aggregates on click. Both operations call `saveToHistory()` for undo/redo support.

### Component Tree

```
App → Gexor (main UI)
  ├── Canvas (@react-three/fiber)
  │   └── Scene → InstancedNodes, InstancedEdges, Minimap, RadialSpheres
  └── UI panels: SearchModal, InfoPanel, RightPanel, AllPropertiesModal,
                 SettingsPanel, StartScreen, TypeHierarchyPanel
```

`NodeDetailPanel` has been replaced by a two-panel architecture:
- **InfoPanel** (left) — compact header + ExplorationBar + TagsFormat + BasicsPluginsBar
- **RightPanel** (right) — tabbed detail panel driven by the plugin registry

Per-node exploration direction is now controlled by `ExplorationBar` inside `InfoPanel`.

### Frontend Key Files

| File | Role |
|------|------|
| [src/Gexor.jsx](src/Gexor.jsx) | Primary UI component (all panels + canvas) |
| [src/components/Graph/Scene.jsx](src/components/Graph/Scene.jsx) | Three.js canvas + camera |
| [src/components/Graph/InstancedNodes.jsx](src/components/Graph/InstancedNodes.jsx) | InstancedMesh node rendering + pulse animation for recently-added nodes |
| [src/components/Graph/Node.jsx](src/components/Graph/Node.jsx) | LoD node with selection outline (blue) + added pulse (green) |
| [src/components/UI/InfoPanel.jsx](src/components/UI/InfoPanel.jsx) | Left panel: node/edge/aggregate header, ExplorationBar, TagsFormat, BasicsPluginsBar |
| [src/components/UI/RightPanel.jsx](src/components/UI/RightPanel.jsx) | Right panel: tabbed detail view driven by pluginRegistry; renders plugin tab components |
| [src/components/UI/ExplorationBar.jsx](src/components/UI/ExplorationBar.jsx) | Direction d'exploration per-node: [Off] [Propriétés] [Associés] [Load ↻] |
| [src/components/UI/BasicsPluginsBar.jsx](src/components/UI/BasicsPluginsBar.jsx) | Icon bar at bottom of InfoPanel; each icon opens a RightPanel tab via `openRightPanel` |
| [src/components/UI/TagsFormat.jsx](src/components/UI/TagsFormat.jsx) | Exploration tags injected by `tagRegistry` based on P31 type (`contextResolver.json`) |
| [src/components/UI/PropertiesGrouped.jsx](src/components/UI/PropertiesGrouped.jsx) | Shared property display components (`EntityLink`, qualifier display) reused by plugins |
| [src/components/UI/AllPropertiesModal.jsx](src/components/UI/AllPropertiesModal.jsx) | All properties modal with clickable entity references |
| [src/components/UI/SearchModal.jsx](src/components/UI/SearchModal.jsx) | Advanced search modal with filter badges, taxonomy hierarchy, paginated results |
| [src/components/UI/TypeHierarchyPanel.jsx](src/components/UI/TypeHierarchyPanel.jsx) | P31 type parent/child hierarchy navigator (uses `taxonomyClasses` from searchSlice) |
| [src/components/UI/ClickableProperty.jsx](src/components/UI/ClickableProperty.jsx) | Clickable PID badge: left-click opens SearchModal with property filter, right-click adds OR filter |
| [src/components/UI/FilterBadge.jsx](src/components/UI/FilterBadge.jsx) | Colored badge for a search filter (operator toggle, remove, hierarchy popover) |
| [src/components/UI/StartScreen.jsx](src/components/UI/StartScreen.jsx) | Initial landing screen shown before any search |
| [src/hooks/useForceLayout.js](src/hooks/useForceLayout.js) | WASM force layout hook |
| [src/hooks/useConnectedNodes.js](src/hooks/useConnectedNodes.js) | Computes connected nodes for a given `nodeUri`; merges `loadedRelations` + `outgoingDisplayRelations`, filters by visibility |
| [src/plugins/pluginRegistry.js](src/plugins/pluginRegistry.js) | Singleton registry: `registerPlugin`, `getPlugin`, `getTabsForMode(mode)` |
| [src/plugins/tagRegistry.js](src/plugins/tagRegistry.js) | Tag provider registry: `registerTagProvider(id, fn)` — allows future features (parcours, annotations) to inject tags into TagsFormat |
| [src/plugins/loadPlugins.js](src/plugins/loadPlugins.js) | Registers all built-in plugins into pluginRegistry on app startup |
| [src/plugins/properties/](src/plugins/properties/) | Built-in plugin: Propriétés tab (node mode) — lazy-loaded `PropertiesTab` |
| [src/plugins/associates/](src/plugins/associates/) | Built-in plugin: Associés tab (node mode) — connected nodes list |
| [src/plugins/wikipedia/](src/plugins/wikipedia/) | Built-in plugin: Wikipedia tab (node + aggregate mode) |
| [src/plugins/aggregate-childs/](src/plugins/aggregate-childs/) | Built-in plugin: Contenu tab (aggregate mode) — list of aggregate children |
| [src/services/queries/wikidata.js](src/services/queries/wikidata.js) | Thin API client (calls `/api/*` endpoints) |
| [src/services/cacheService.js](src/services/cacheService.js) | L1 in-memory cache |
| [src/services/contextResolver.js](src/services/contextResolver.js) | Context-dependent PID promotion based on P31 types |
| [src/services/propertyClassification.js](src/services/propertyClassification.js) | O(1) classification lookups, redundancy dedup, noise detection |
| [src/services/prefetchQueue.js](src/services/prefetchQueue.js) | Background pre-loading of neighbor node properties; `prioritizeAndFetch(uri)` moves a node to front on selection |
| [src/services/validators.js](src/services/validators.js) | Non-throwing structural validation of API responses at system boundaries |
| [src/store/visibilityHelpers.js](src/store/visibilityHelpers.js) | Pure helpers: `isNodeVisible`, orphan edge cleanup — single source of truth for visibility logic |
| [src/utils/errorHandler.js](src/utils/errorHandler.js) | Consistent error classification (`network`, `not_found`, `parse`, `unknown`) and logging |
| [src/utils/exportImport.js](src/utils/exportImport.js) | Export/import graph state to JSON (strips heavy fields, captures 3D positions via `readAllPositions`) |
| [src/data/contextRules.json](src/data/contextRules.json) | Static rules for 20 type families (human, country, film…) → PID promotions via `contextResolver.js` |
| [src/data/contextResolver.json](src/data/contextResolver.json) | Maps QID P31 types to exploration tags (chronologie, contemporains, globe…) consumed by `TagsFormat` |
| [src/models/lodNode.js](src/models/lodNode.js) | LOD node/edge/aggregate data models |
| [src/models/searchFilter.js](src/models/searchFilter.js) | Search filter model: `FILTER_TYPES` (text, entity, property, type, in_graph, has_value), `FILTER_OPERATORS` (and/or/not) |
| [src/constants/graphConstants.js](src/constants/graphConstants.js) | Layout/color/geometry/aggregate constants |

## Tech Stack

- **React 19** + **Vite 7** — frontend
- **Fastify** + **PostgreSQL** (`pg`) — backend
- **Three.js** + **@react-three/fiber** + **@react-three/drei** — 3D rendering
- **@antv/layout-wasm** — WebAssembly force-directed layout (internally uses Comlink Worker)
- **Zustand 5** — state management
- **Tailwind CSS 4** — styling
- **SharedArrayBuffer** — zero-copy position sharing between layout and renderer

## Critical Vite Config Notes

[vite.config.js](vite.config.js) sets CORS headers required for SharedArrayBuffer:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Do not remove these headers — they are required for `SharedArrayBuffer` to work.

The Vite dev server proxies `/api/*` to `http://localhost:3001` (Fastify backend).

## Key Patterns

- **Instanced rendering**: `InstancedMesh` for up to 5000 nodes/edges (see `MAX_INSTANCES` in constants)
- **No custom Web Worker**: @antv/layout-wasm manages threading internally
- **On-demand BFS loading**: neighbors are fetched only when a node is expanded
- **3-tier cache**: frontend memory (L1) → PostgreSQL (L2) → Wikidata API (L3)
- **Backend call consolidation**: `fetchEntityExpand()` fetches entity + neighbors in 1 round-trip
- **Image proxy**: `/api/image` proxies Wikimedia Commons images with CORP headers (fixes COEP conflict)
- **Property classification**: Wikidata properties are auto-classified (primary/secondary/context-dependent) via `wikidata_properties.json` — loaded both server-side and client-side
- **Classify-first fetch**: `fetchOutgoingNeighbors` iterates ALL claims, classifies each PID, deduplicates redundancy groups, then applies per-tier budgets (D→all, C promoted→all, C non-promoted→excluded, unclassified→20, A→survivor, B→excluded)
- **Incoming neighbors asymmetry** (intentional): `fetchIncomingNeighbors` applies only ExternalId filtering (via SPARQL `MINUS`) and label resolution — no classification, no redundancy dedup, no budget. Incoming edges are "received" (not "chosen"), and their volume is managed by the aggregate system rather than per-edge filtering
- **Context Resolver**: `contextRules.json` maps 20 P31 type families to context-dependent PID promotions (e.g. P36 for countries, P407 for literary works)
- **Redundancy dedup**: A-axis groups (A1 location, A2 biography…) keep only the most specific PID per group
- **Wikimedia noise filter**: 7 Wikimedia internal types (categories, disambiguation pages, templates…) are excluded from graph
- **Aggregate nodes**: Incoming references grouped by (PID, P31 type, count). Rendered as violet hexagons with count badge. Expandable on click. Expand/collapse are undoable (saveToHistory)
- **Per-node settings**: Each node has independent `depth`, `explorationDirection`, `renderMode`, `radialStrength` via `nodeSettings` map in `dataSlice`. Default direction is `'incoming'`
- **Highlight system**: Selected node gets blue outline (`SELECTION_OUTLINE_COLOR`). Recently-added nodes get green pulse animation (`ADDED_PULSE_COLOR`, `ADDED_PULSE_DURATION = 1500ms`)
- **InfoPanel + RightPanel**: `NodeDetailPanel` replaced by a two-panel system. `InfoPanel` (left) = compact header + `ExplorationBar` + `TagsFormat` + `BasicsPluginsBar`. `RightPanel` (right) = tabbed detail driven by `pluginRegistry`. Tabs are lazy-loaded React components registered by plugins.
- **Plugin system**: `pluginRegistry.js` — a singleton `Map` of plugins. Each plugin declares `{ id, label, icon, availableFor, tier, tab: { component } }`. `getTabsForMode(mode)` returns tabs for 'node' | 'edge' | 'aggregate'. Built-in plugins: `properties`, `associates`, `wikipedia`, `aggregate-childs`. External plugins register at startup via `loadPlugins.js`.
- **Tag system**: `tagRegistry.js` — a `Map` of tag providers injected into `TagsFormat`. Each provider returns an array of `ExplorationTag | ActionTag` based on node data. `contextResolver.json` maps P31 QIDs to exploration tags (future plugins like `temporal`, `geographic`, `cluster-shared` will activate via these tags).
- **Qualifier support**: `wikidataClient.js` parses `claim.qualifiers` for 9 target PIDs (`QUALIFIER_PIDS`: P580, P582, P585, P571, P576, P453, P794, P3831, P1932). Qualifiers are resolved with the same batch label pipeline as properties/edges. `properties[pid].values[].qualifiers` and `edges[].qualifiers` are now populated.
- **Add to graph**: `addNodeToGraph(uri)` in `dataSlice` — loads, pins, and triggers pulse animation. Available from SearchModal and AllPropertiesModal
- **Search filters**: `searchSlice` holds a `searchFilters` array of `SearchFilter` objects (type, value, label, operator, color). Composable with AND/OR/NOT operators. `ClickableProperty` creates property filters inline; `TypeHierarchyPanel` creates type filters
- **Taxonomy**: `searchSlice.taxonomyClasses` holds a QID→`{parents, children, totalInstances}` map loaded lazily from the backend. `getTaxonomyLabel(qid, lang)` resolves labels. `TypeHierarchyPanel` navigates this hierarchy
- **Prefetch queue**: `prefetchQueue.js` pre-fetches neighbor node properties in the background. `prioritizeAndFetch(uri)` returns a Promise resolving to a LodNode — the detail panel calls this on node selection for instant display
- **Error handling**: `errorHandler.js` provides `handleApiError(err, context)` returning `{ message, code }`. All store async actions should call this instead of ad-hoc try/catch logging
- **Export/Import**: `exportImport.js` serializes the full graph state (nodes, edges, positions, nodeSettings, pinnedNodes) to JSON for save/restore. Positions are read from the SharedArrayBuffer via `readAllPositions()`

## Data Models

**LOD Node** ([src/models/lodNode.js](src/models/lodNode.js)):
```js
{ uri, label, types, typeLabels, properties, temporal, geo, sources, thumbnailUrl, externalIds, description, aliases }
```

**LOD Edge**:
```js
{ id, source, target, predicate, label, classification, rank, referenceCount, redundancyGroup,
  tier, direction, contextPromoted, weight, redundancyRank, aggregateCount,
  qualifiers: { [pid: string]: Array<{value, label, isEntity, datatype}> } | null }
```

**Aggregate Node** ([src/models/lodNode.js](src/models/lodNode.js)):
```js
{ id, type: 'aggregate', sourceUri, predicate, predicateLabel, targetClass, targetClassLabel,
  count, direction, expanded, collapsed, children, loadingChildren }
```

## Domain Vocabulary

- **Node** — a node/entity in the graph (Wikidata Q-item)
- **PID** — Wikidata property ID (e.g., `P31`, `P40`)
- **LOD** — Linked Open Data
- **BFS** — Breadth-First Search used for neighbor expansion
- **Pinning** — position-locking nodes in 3D space. Pin is now purely positional; per-node depth/direction/radial are in `nodeSettings`
- **nodeSettings** — per-node configuration map: `{ depth, explorationDirection, renderMode, radialStrength, ... }`. Authoritative source for BFS depth and direction
- **Aggregate Node** — synthetic node representing N grouped incoming entities (e.g. "47 scholarly articles")
- **Context Resolver** — rule engine that promotes context-dependent PIDs based on entity P31 types
- **Redundancy Group** — set of A-axis PIDs where only the most specific survives (e.g. P131 > P17 > P30)
- **Tier** — edge classification tier: `primary`, `secondary`, `hidden`, or `aggregate`
- **Wikimedia Noise** — internal Wikidata types (categories, disambig pages…) filtered from graph

## WorkfLow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ Steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents Liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review Lessons at session start for relevant project

### 4.Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself:"Would a staff engineer approve this?"
- Run tests, check Logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky:"Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes - don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at Logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan Firstok**: Write plan to `tasks/todo.md` with checkable item
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after correction

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.