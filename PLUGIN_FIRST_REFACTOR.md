# Refonte Plugin-First — Plan détaillé

> **But** : transformer Gexor d'une app monolithique avec un registry partiel de plugins en une **plateforme noyau (core) + plugins** où **toute l'UI, toute la scène 3D, et tout l'accès aux données** passent par des points d'extension contractuels. Le core ne connaît pas Wikidata, ne connaît pas les onglets « Propriétés/Associés/Wikipédia », ne connaît pas la minimap. Tout cela est branché.

---

## 1. Diagnostic — état actuel

### Ce qui marche déjà (à conserver)
- **`pluginRegistry.js`** ([src/plugins/pluginRegistry.js](src/plugins/pluginRegistry.js)) : Map singleton, `registerPlugin`, `getPluginsForMode`, `getLazyTabComponent`. Bonne base.
- **`tagRegistry.js`** ([src/plugins/tagRegistry.js](src/plugins/tagRegistry.js)) : pattern d'injection externe sans coupler à `TagsFormat`. À généraliser.
- **`loadPlugins.js`** ([src/plugins/loadPlugins.js](src/plugins/loadPlugins.js)) : auto-découverte via `import.meta.glob('./*/index.js')`. Simple et efficace.
- **`usePluginData`** ([src/hooks/usePluginData.js](src/hooks/usePluginData.js)) : amorce d'API stable pour les plugins (capabilities `properties`/`incoming`/`graph`/`shared`). À étendre en *Plugin Context API*.
- **Manifest minimal** : `{ id, label, icon, category, availableFor, tier, tab }`. À enrichir.

### Limites bloquantes
| # | Problème | Fichier(s) | Impact |
|---|----------|-----------|--------|
| 1 | Plugins lisent **directement** `useGraphStore` (31 occurrences sur 8 fichiers). | `src/plugins/**/*.jsx` | Impossible d'isoler / sandboxer / muter le contrat sans casser tous les plugins. |
| 2 | `Gexor.jsx` (422 lignes) hardcode SettingsPanel, InfoPanel, RightPanel, SearchModal, Minimap, Canvas, indicateurs SPARQL. | [src/Gexor.jsx](src/Gexor.jsx) | Aucun plugin ne peut ajouter un panneau, un overlay, un bandeau status. |
| 3 | `Scene.jsx` (466 lignes) hardcode `InstancedNodes`, `InstancedEdges`, `RadialSpheres`, `Node`, drag handlers. | [src/components/Graph/Scene.jsx](src/components/Graph/Scene.jsx) | Aucun plugin ne peut ajouter d'objet 3D (heatmap, ruban temporel, grille géo, annotations 3D). |
| 4 | `dataSlice.js` (1297 lignes) **importe en dur** `services/queries/wikidata.js`. | [src/store/slices/dataSlice.js](src/store/slices/dataSlice.js) | Impossible de brancher DBpedia, un endpoint privé, GraphQL, fichiers locaux, etc. |
| 5 | `SearchModal.jsx` = 1654 lignes hardcodées Wikidata + filtres. | [src/components/UI/SearchModal.jsx](src/components/UI/SearchModal.jsx) | Aucun moteur de recherche alternatif possible. |
| 6 | `settingsSlice` hardcode force/node/aggregate/edge/highlight params. | [src/store/slices/settingsSlice.js](src/store/slices/settingsSlice.js) | Plugins ne peuvent pas déclarer leurs propres settings. |
| 7 | `BasicsPluginsBar`/`RightPanel` ont un `ICON_MAP` figé en JS. | [src/components/UI/BasicsPluginsBar.jsx:8-10](src/components/UI/BasicsPluginsBar.jsx#L8) | Plugins doivent choisir parmi ~9 icônes Lucide pré-importées. |
| 8 | Aucun cycle de vie plugin (enable/disable, settings par plugin, dépendances inter-plugins). | — | Pas de marketplace, pas de tier 'paid', pas de permissions. |
| 9 | Aucun bus d'événements inter-plugins. | — | Impossible : « plugin temporel notifie plugin minimap d'un changement de filtre ». |
| 10 | Multi-plugin sur même slot non géré (ex. deux minimaps, deux timeline). | — | Forke obligatoire. |

### Communautés du graphe (extraites du graphify)
Le rapport graphify confirme les centres de gravité :
- **`get()` / `set()` du store** : 54+29 arêtes — point de couplage massif (god-store).
- **Community 9** (`pluginRegistry.js`, `loadPlugins`, `BasicsPluginsBar`) — embryon plugin layer.
- **Community 11** (`AllInGraphTab`, `AssociatesTab`, `ClusterSharedTab`, `PropertiesTab`, `usePluginData`) — plugins existants, communauté faible (cohésion 0.17), preuve qu'ils sont mal isolés du core.

---

## 2. Vision cible

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CORE (mince)                                │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Plugin Host │  │ Slot Layout  │  │ Scene Stage  │  │ Event Bus │  │
│  │ (lifecycle) │  │  (UI 2D)     │  │   (3D R3F)   │  │  (pub/sub)│  │
│  └─────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Graph Store │  │ Data Sources │  │ Layout Engine│  │ Settings  │  │
│  │ (CRUD pur)  │  │  (registry)  │  │  (registry)  │  │ Schema   │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
└──────────────────────────────────────────────────────────────────────┘
              ▲                              ▲
              │ contrats stables             │ contrats stables
              │                              │
┌─────────────┴──────────────────────────────┴─────────────────────────┐
│                            PLUGINS                                   │
│  wikidata-source   properties   associates   wikipedia   minimap     │
│  edge-detail   cluster-shared   aggregate-childs   force-layout      │
│  search-wikidata   selection-outline   radial-render   ...           │
└──────────────────────────────────────────────────────────────────────┘
```

**Principes directeurs**
- Le **core** n'a **aucune** connaissance de Wikidata, des onglets, de la minimap, ni des plugins existants.
- Les plugins **ne lisent jamais directement** le `useGraphStore` global. Ils consomment un `PluginContext` injecté.
- Tout point d'extension est **multi-instance** (plusieurs plugins peuvent occuper le même slot).
- Tout plugin **déclare** ce dont il a besoin (capabilities, dépendances, permissions). Le host vérifie avant `init()`.
- **Rétrocompatibilité progressive** : on garde `pluginRegistry.js` et le manifest existant comme tier inférieur, on l'étend.

---

## 3. Architecture cible — les 7 couches du core

### 3.1 Plugin Host (cycle de vie)
**Fichier nouveau** : `src/core/host/pluginHost.js`

Responsabilités :
- Charger les manifests (auto-discovery + manifests externes via URL/import dynamique).
- Résoudre l'ordre de chargement par dépendances topologiques.
- Appeler `init(ctx) → dispose` pour chaque plugin.
- Gérer enable/disable à chaud (sans reload).
- Conserver `Map<pluginId, PluginInstance>` avec état (`registered | enabled | initialized | failed | disabled`).
- Émettre des événements `plugin:enabled`, `plugin:disabled`, `plugin:error` sur l'event bus.

**API publique** :
```js
host.register(manifest)           // s'enregistre, statut = 'registered'
host.enable(pluginId)              // appelle init(ctx), statut = 'initialized'
host.disable(pluginId)             // appelle dispose(), retire les contributions
host.list({ status, slot, mode })  // requêtes
host.contextFor(pluginId)          // retourne le PluginContext sandboxé
```

### 3.2 Plugin Manifest (contrat enrichi)
**Fichier nouveau** : `src/core/host/manifestSchema.js` (validation Zod ou JSDoc + runtime checks)

```js
{
  // Identité
  id: 'properties',                 // unique, kebab-case
  version: '2.0.0',
  label: 'Propriétés',
  description: 'Affiche les propriétés Wikidata du nœud sélectionné.',
  icon: 'Info',                      // peut être string Lucide OU import dynamique
  category: 'inspector',             // inspector | layout | source | render | overlay | tool

  // Distribution
  tier: 'free' | 'pro' | 'experimental',
  author: 'Gexor core',
  permissions: ['network', 'graph:read', 'ui:slot'],

  // Dépendances
  requires: ['wikidata-source'],     // doivent être présents+enabled
  conflicts: [],                     // mutuellement exclusifs
  optional: ['minimap'],             // s'enrichit si présent

  // Contributions — TOUTES facultatives, tout plugin peut combiner plusieurs types
  contributions: {
    panels: [{                       // UI 2D — slot-layout
      slot: 'right.tab',
      id: 'properties.tab',
      label: 'Propriétés',
      icon: 'Info',
      modes: ['node'],
      component: () => import('./PropertiesTab'),
      order: 100,                    // tri dans le slot
    }],

    sceneObjects: [{                 // 3D — scene-stage
      id: 'properties.highlights',
      component: () => import('./PropertiesHighlight3D'),
      enableForModes: ['node'],
    }],

    overlays: [{                     // overlays UI flottants (HUD)
      slot: 'canvas.bottom-left',
      id: 'properties.miniHud',
      component: () => import('./PropertiesMiniHud'),
    }],

    storeSlices: [{                  // extension store
      key: 'propertiesPlugin',
      createSlice: (set, get) => ({ ... }),
    }],

    dataSources: [{                  // intégration data layer
      id: 'wikidata-properties',
      capability: 'fetchProperties',
      handler: (ctx, uri) => fetchEntityExpand(uri, 'outgoing', 50),
    }],

    layouts: [{                      // moteurs de layout
      id: 'force-wasm',
      label: 'Force-directed (WASM)',
      run: ({ nodes, edges, positions, params }) => layoutInstance,
    }],

    tags: [{                         // hérite de tagRegistry actuel
      id: 'tag-properties',
      provider: ({ nodeUri, nodeData }) => [...tags],
    }],

    shortcuts: [{
      key: 'p',
      modifiers: ['mod'],
      label: 'Ouvrir Propriétés',
      handler: (ctx) => ctx.ui.openPanel('right.tab', 'properties.tab'),
    }],

    settings: {                      // schéma de settings
      schema: { showRedundancyA: { type: 'boolean', default: true, label: '…' } },
      panel: () => import('./PropertiesSettings'),
    },

    commands: [{                     // command palette
      id: 'properties.refresh',
      label: 'Recharger les propriétés',
      run: (ctx) => ctx.data.invalidate('properties', ctx.ui.selectedNode?.id),
    }],

    contextMenu: [{                  // menus contextuels
      target: 'node',                // 'node' | 'edge' | 'aggregate' | 'canvas'
      label: 'Voir propriétés détaillées',
      run: (ctx, target) => ctx.ui.openPanel('right.tab', 'properties.tab'),
    }],
  },

  // Cycle de vie
  init: async (ctx) => { /* abonnements, prefetch, etc. */ return dispose; },
}
```

### 3.3 Plugin Context API (sandbox)
**Fichier nouveau** : `src/core/host/pluginContext.js`

Chaque plugin reçoit **uniquement** ce qu'il a déclaré dans `permissions`. Le contexte remplace l'accès direct à `useGraphStore`.

```js
// Surface stable, versionnée (ctx.apiVersion = 2)
ctx = {
  apiVersion: 2,
  manifest,                          // son propre manifest (lecture seule)

  // Données graphe — getters réactifs (hooks React utilisables dans plugin)
  graph: {
    useNodes(),                      // hook React
    useEdges(),
    useNode(uri),
    useSelectedNode(),
    useSelectedEdge(),
    selectNode(uri),
    addNodes(nodes),
    removeNode(uri),
    pin(uri), unpin(uri),
    // toutes les opérations métier passent par là
  },

  // Données externes (via DataSources registry)
  data: {
    fetch(capability, params),       // ex. ctx.data.fetch('expandEntity', { uri, dir })
    invalidate(capability, key),
    subscribe(capability, key, fn),
  },

  // UI
  ui: {
    openPanel(slotId, contributionId),
    closePanel(slotId),
    toast(message, level),
    confirm({ message }),
    selectedNode, selectedEdge,      // getter
  },

  // Settings du plugin uniquement
  settings: {
    get(key), set(key, value), watch(key, fn),
  },

  // Bus inter-plugins
  bus: {
    emit(topic, payload),
    on(topic, fn),                   // retourne unsubscribe
  },

  // Logger scopé au plugin
  log: { debug, info, warn, error },

  // Helpers de bas niveau (permissions requises)
  three: {                           // si permission 'scene:3d'
    useFrame(fn), useThree(),        // re-export depuis r3f
  },
}
```

**Sandbox** : si un plugin réclame `graph.removeNode` mais n'a pas `'graph:write'` dans `permissions`, le getter renvoie un proxy qui throw avec un message clair.

### 3.4 Slot Layout (UI 2D)
**Fichier nouveau** : `src/core/ui/SlotHost.jsx` + `src/core/ui/slots.js`

Le core déclare une grille de **slots nommés**. `Gexor.jsx` ne contient plus que `<SlotHost />`.

**Slots du core** (canoniques) :
| Slot ID | Position | Usage |
|---------|----------|-------|
| `canvas.top-left` | overlay 3D haut-gauche | toolbars, settings flottants |
| `canvas.top-right` | overlay 3D haut-droit | minimap, badges status |
| `canvas.bottom-left` | overlay 3D bas-gauche | actions globales (settings/undo/play) |
| `canvas.bottom-right` | overlay 3D bas-droit | InfoPanel par défaut |
| `right.tab` | RightPanel — onglets | tabs `properties`, `associates`, etc. |
| `info.section` | InfoPanel — sections | sections additionnelles dans InfoPanel |
| `info.tag` | TagsFormat | re-export du tagRegistry actuel |
| `info.action-bar` | barre d'actions par mode | boutons custom |
| `modal` | modale plein écran | SearchModal, ImportModal, etc. |
| `command-palette` | Cmd+K | commandes globales |
| `settings.section` | SettingsPanel | sections additionnelles |
| `status-bar.left` / `.right` | bandeau bas optionnel | indicateurs SPARQL, jobs |

Chaque slot a un type :
- **`single`** (un seul plugin actif à la fois — ex. `modal`)
- **`tabbed`** (multiple, ordonnés — ex. `right.tab`, `settings.section`)
- **`stacked`** (multiple empilés — ex. `canvas.top-left`, `info.tag`)
- **`replaced`** (le dernier plugin remplace les précédents — ex. `info.section.header`)

API React :
```jsx
<Slot id="right.tab" mode="tabbed" filter={{ modes: [currentMode] }} />
<Slot id="canvas.top-right" mode="stacked" />
```

### 3.5 Scene Stage (3D)
**Fichier nouveau** : `src/core/scene/SceneStage.jsx`

`Scene.jsx` actuel devient :
```jsx
<SceneStage>
  <SceneSlot id="scene.world" />        {/* fond, lumières, sphère radiale */}
  <SceneSlot id="scene.edges" />        {/* edges instanciés */}
  <SceneSlot id="scene.nodes" />        {/* nodes instanciés */}
  <SceneSlot id="scene.overlay" />      {/* sélection, pulse, drag, annotations */}
  <SceneSlot id="scene.hud-3d" />       {/* labels 3D, ribbons, gizmos */}
</SceneStage>
```

Chaque `<SceneSlot>` rend les `sceneObjects` enregistrés dans cet ordre, dans un seul `<group>` R3F.

**Plugins 3D peuvent** :
- ajouter des `<mesh>`, `<line>`, `<Html>` (drei).
- s'abonner à `useFrame` via `ctx.three.useFrame`.
- consommer `positions` via le `PluginContext` (qui ré-expose les SAB en lecture seule).
- ajouter des **post-process passes** (slot `scene.postprocess` — futur).

### 3.6 Data Sources (registry)
**Fichier nouveau** : `src/core/data/dataSourceRegistry.js`

Le `dataSlice.js` actuel doit être **scindé** :
- **`dataSlice.js` (core)** : structures pures (`loadedNodes`, `loadedRelations`, `nodeSettings`, etc.) + opérations CRUD pures (`addNode`, `mergeNodes`, `addEdge`, `setNodeProperties`). **Aucun fetch.**
- **`dataSourceRegistry.js`** : Map de `{ capability → handler }`. Capabilities standard :
  - `entity:expand` (récupérer nœud + voisins)
  - `entity:search` (recherche texte → liste de hits)
  - `entity:incoming-aggregates`
  - `entity:similar-by-properties`
  - `image:fetch`
  - `taxonomy:hierarchy`
- **`wikidata-source` plugin (interne)** : enregistre tous les handlers. C'est un **plugin de premier plan** mais désinstallable (et remplaçable par `dbpedia-source` / `custom-sparql-source`).

### 3.7 Event Bus + Settings Schema
**Fichiers nouveaux** :
- `src/core/bus/eventBus.js` — pub/sub typé minimal (tous les topics ont un namespace : `graph:*`, `ui:*`, `plugin:*`, `data:*`).
- `src/core/settings/settingsSchema.js` — agrège les schémas déclarés par chaque plugin et les expose dans SettingsPanel via `<Slot id="settings.section" />`.

---

## 4. Phases d'implémentation

> **Règle d'or** : le code doit toujours fonctionner. Chaque phase laisse l'app live, testable, sans régression visuelle.

### Phase 0 — Préparation (1-2j)
- Créer `src/core/` (sous-dossiers : `host/`, `ui/`, `scene/`, `data/`, `bus/`, `settings/`).
- Geler `pluginRegistry.js` actuel sous le nom `legacyPluginRegistry.js` (alias).
- Ajouter `tasks/lessons.md` à jour avec les invariants à préserver (pin = position uniquement, frameloop demand, SAB, etc.).
- Décider Zod vs JSDoc pour validation manifest. **Recommandation** : JSDoc + checks runtime simples (zéro dépendance).

### Phase 1 — Plugin Host + Manifest enrichi (3-5j)
- Implémenter `pluginHost.js`, `manifestSchema.js`.
- **Adapter shim** : ancien manifest `{ id, label, icon, availableFor, tab }` → nouveau `{ contributions: { panels: [...] } }` automatiquement.
- Brancher `loadPlugins.js` sur le nouveau host.
- Tous les plugins existants continuent de fonctionner sans modification.

### Phase 2 — Slot Layout (5-7j)
- Implémenter `SlotHost`, `Slot`, registre de slots.
- Refactor `Gexor.jsx` :
  - Enlever `InfoPanel`, `RightPanel`, `SearchModal`, `Minimap`, `SettingsPanel` du JSX.
  - Les ré-enregistrer comme plugins **internes** dans `src/plugins/_core/` :
    - `_core/info-panel/` → contribue `canvas.bottom-right` (single).
    - `_core/right-panel/` → contribue `canvas.right-fullheight` (single).
    - `_core/search-modal/` → contribue `modal` + commande `search.open`.
    - `_core/minimap/` → contribue `canvas.top-right` (stacked).
    - `_core/settings-panel/` → contribue `canvas.bottom-left` + slot `settings.section`.
- `Gexor.jsx` final ≈ 60 lignes (Canvas + SlotHost + Scene).

### Phase 3 — Plugin Context API + sandbox (4-6j)
- Implémenter `pluginContext.js`.
- Migrer **un plugin pilote** (`properties`) : remplacer `useGraphStore(s => ...)` par `ctx.graph.useNode(...)`.
- Mesurer la perte/gain de re-renders. Stabiliser.
- Migrer les autres plugins un par un. Pendant la transition, `useGraphStore` reste autorisé via permission `legacy:store-direct` (warn console).

### Phase 4 — Scene Stage (5-7j)
- Implémenter `SceneStage`, `SceneSlot`.
- Découper `Scene.jsx` :
  - `InstancedNodes`, `InstancedEdges` → plugins internes contributant `scene.nodes` / `scene.edges`.
  - `RadialSpheres` → plugin `radial-render`, contribue `scene.overlay`.
  - drag/select/pulse → plugin `selection-interaction`, contribue `scene.overlay` + `shortcuts`.
- Permet à un plugin externe d'ajouter une heatmap, un timeline-ribbon, etc.

### Phase 5 — Data Sources registry (5-8j)
- Découper `dataSlice.js` :
  - **Pure** : `coreDataSlice.js` (CRUD pur).
  - **Plugin** : `src/plugins/_core/wikidata-source/` qui enregistre les handlers.
- Toutes les actions de fetch deviennent : `ctx.data.fetch('entity:expand', { uri, dir })`.
- L'utilisateur peut alors désactiver `wikidata-source` et activer `dbpedia-source` (futur).

### Phase 6 — Settings Schema + Command Palette (3-5j)
- `SettingsPanel` lit le schéma agrégé : core + plugins → `<Slot id="settings.section" />`.
- Cmd+K : palette qui liste toutes les `commands` enregistrées.

### Phase 7 — Documentation & DX (2-4j)
- `docs/PLUGIN_AUTHORING.md` : tutoriel "Hello plugin".
- `docs/EXTENSION_POINTS.md` : référence de tous les slots, events, capabilities.
- Template `npx create-gexor-plugin` (futur, optionnel).

---

## 5. Migration des 7 plugins existants

| Plugin | Action |
|--------|--------|
| `properties` | Manifest étendu (`storeSlices` éventuel). Migrer `useGraphStore` → `ctx.graph`. |
| `associates` | Idem. Capability `entity:incoming-aggregates`. |
| `all-in-graph` | Idem. Pure consommateur. |
| `cluster-shared` | Capability `entity:similar-by-properties`. |
| `edge-detail` | Pure UI. Migration triviale. |
| `wikipedia` | Capability nouvelle : `wiki:summary`. Permission `network`. |
| `aggregate-childs` | Capability `aggregate:expand-children`. |
| `tagRegistry` (existant) | Devient `contributions.tags` du manifest. Bridge en Phase 1. |

---

## 6. Communication multi-plugins — patterns

### a) Invocation directe (préférable quand contractuel)
```js
// Dans plugin "minimap"
ctx.bus.on('selection:changed', ({ nodeId }) => updateMinimapHighlight(nodeId));
```

### b) Capability shared
```js
// Plugin "temporal" enregistre une capability
manifest.contributions.dataSources = [{
  capability: 'temporal:range', handler: (ctx, nodeIds) => computeRange(nodeIds)
}];

// Plugin "minimap" la consomme si dispo
const range = await ctx.data.fetch('temporal:range', selectedIds, { optional: true });
```

### c) Slot collaboratif
Plusieurs plugins contribuent au même slot avec un `order` — l'utilisateur les voit cohabiter.

---

## 7. Critères d'acceptation

- [ ] **Core ≤ 1500 lignes** au total (`src/core/` + `src/Gexor.jsx`). Aujourd'hui le seul `Gexor.jsx + Scene.jsx + dataSlice.js` = 2200 lignes.
- [ ] **Aucun import** de `services/queries/wikidata.js` en dehors du plugin `wikidata-source`.
- [ ] **Aucun import** de `useGraphStore` en dehors de `src/core/` et `src/plugins/_core/`.
- [ ] Désactiver `properties`, `associates`, `wikipedia` à chaud → l'app reste fonctionnelle (graphe visible, sélection, drag, layout).
- [ ] Désactiver `wikidata-source` → SearchModal affiche « aucune source de données activée », pas de crash.
- [ ] Ajouter un plugin externe **sans toucher au core** : créer `src/plugins/example-heatmap/` qui pose une `<mesh>` 3D + un onglet RightPanel — l'app le détecte et l'affiche.
- [ ] Tests fumée : ouvrir un nœud, expand, pin, undo, search, ajouter, supprimer, export → tout passe.
- [ ] `tasks/lessons.md` mis à jour (frameloop demand, SAB invariants, drag interaction model).

---

## 8. Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| Re-renders en cascade via `ctx.graph.useNode` | Sélecteurs Zustand fins + `useShallow`. Mesurer avec React DevTools Profiler avant/après. |
| Coût de bootstrapping (init asynchrone des plugins) | `host.enable` parallélisable (deps topo), splash écran masque le delta. |
| Sandbox runtime check coûteux | Activer en DEV uniquement (`if (import.meta.env.DEV)`). |
| Plugin tiers casse l'app | `try/catch` autour de `init()` et de chaque rendu de `<Slot>` (ErrorBoundary par plugin). |
| Perte d'invariants critiques (frameloop=demand, SAB) | Documenter dans `lessons.md` + tests visuels Playwright sur un scénario standard. |
| Régression performance scene | Phase 4 = atomique, mesurer FPS scène 200+ nodes avant/après. |

---

## 9. Décisions à valider avant de coder

1. **Validation manifest** : Zod (~10kB) ou JSDoc + asserts runtime ?
2. **Bus d'événements** : implémentation maison (50 lignes) ou `mitt` (~200 octets) ?
3. **Permissions** : strictes en prod (throw) ou warn + autoriser ?
4. **Persistance settings plugins** : localStorage par plugin id, ou un seul blob `pluginSettings` ?
5. **Compatibilité tier='paid'** : besoin réel pour cette refonte, ou repoussé ?

---

## 10. Hors-scope explicite

- ❌ Création d'une marketplace en ligne (vision long-terme — voir `MODULARITY_FUTURE.md`).
- ❌ Système de signature/permissions cryptographique.
- ❌ Version multi-utilisateur / collaboration temps réel.
- ❌ Internationalisation des manifests.
- ❌ Réécriture de `useForceLayout` ou du worker WASM (zéro modif noyau).

Toutes ces capacités **sont possibles plus tard sans refondre cette refonte** parce que les contrats (manifest + slots + capabilities + bus) sont prévus pour les absorber.
