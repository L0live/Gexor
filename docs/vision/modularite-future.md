# Modularité future — Vision long-terme

> **But** : anticiper les besoins de modularité au-delà de la refonte plugin-first. Ce document décrit les **cas d'usage** réalistes des 12-24 prochains mois et **vérifie que l'architecture cible décrite dans [refonte-plugin-first.md](../architecture/refonte-plugin-first.md) les absorbe sans réécriture**.
> Si un cas d'usage casse les contrats, c'est qu'il manque un point d'extension dans la refonte — il faut l'ajouter en Phase 0/1.

---

## 1. Cas d'usage cibles

### 1.1 Minimap enrichie (priorité moyenne, **fort effet de levier**)

La minimap actuelle ([src/components/Graph/Minimap.jsx](src/components/Graph/Minimap.jsx)) est un SVG 150×150 figé : projection X/Z, tous les nœuds en cercles colorés, pas d'interaction au-delà du clic.

**Évolutions désirées** :
- **Layers superposables** (chaque layer = un plugin contribuant à `slot: minimap.layer`) :
  - `density` — heatmap (zones denses)
  - `temporal` — gradient de couleur selon date (P569/P570)
  - `community` — couleurs Louvain/Leiden auto-calculées
  - `paths` — surbrillance des chemins entre 2 nœuds sélectionnés
  - `viewport` — rectangle de la vue caméra projetée
  - `pinned-only` — masque tout sauf les épinglés
- **Interactions** :
  - drag sur la minimap = pan caméra
  - shift+drag = sélection rectangulaire qui se propage dans la scène 3D
  - molette = zoom minimap indépendant
- **Mode étendu** (clic « ⤢ ») : minimap remplit 1/3 de l'écran avec axes labellisés, comme un mini-graphe 2D.

**Vérification d'absorption par l'architecture** :
- ✅ La minimap devient un plugin `_core/minimap` enregistré sur slot `canvas.top-right`.
- ✅ Chaque layer = sous-plugin contribuant `slot: minimap.layer` (slot custom déclaré par le plugin minimap lui-même — pattern **slot dérivé**).
- ✅ Le plugin minimap expose **lui-même** une capability `minimap:layer` et un slot. C'est un plugin **conteneur** : il consomme et est consommé. **Le core ne sait pas ce qu'est une minimap.**
- 🔁 Décision à prendre : faut-il standardiser le concept de "plugin conteneur" (plugin qui crée des slots) ? **Recommandation** : autoriser dans le manifest `contributions.declaresSlots: [{ id, type, scope: 'plugin' }]` dès la Phase 1.

### 1.2 Création UI à la volée — "UI Builder" (priorité longue, fort potentiel produit)

Permettre à l'utilisateur (ou à un plugin marketplace) de **composer une UI sans code** :
- Ajouter un panneau qui affiche `propriétés.P31` filtrées par regex.
- Ajouter une carte au-dessus du canvas qui résume les stats du graphe.
- Sauvegarder cette composition comme "workspace".

**Implications d'archi** :
- **Composants paramétrables déclaratifs** : chaque plugin peut publier des "primitives" (PropertyList, EntityCard, StatBadge, MapView, TimelineRibbon, FilterChip…) sous forme de **composants à props sérialisables**.
- Un format **layout descriptor** (JSON) :
  ```json
  {
    "version": 1,
    "panels": [{
      "slot": "right.tab",
      "id": "user.custom-1",
      "label": "Mon onglet",
      "tree": {
        "type": "Stack",
        "children": [
          { "type": "EntityCard", "props": { "uri": "$selected" } },
          { "type": "PropertyList", "props": { "filter": "P5*" } }
        ]
      }
    }]
  }
  ```
- Un **runtime** côté core qui résout `tree` en composants : registry `componentRegistry.js` → `{ "EntityCard": EntityCardComponent, ... }`.
- Un **éditeur visuel** (drag-drop) ne fait que produire ce JSON.

**Vérification** :
- ✅ Si chaque plugin peut enregistrer ses primitives via une nouvelle contribution `contributions.uiPrimitives = [{ name, component, propsSchema }]`, la pièce manquante est **ce point de contribution + le runtime tree-resolver**.
- 🔁 Ajouter `uiPrimitives` au manifest dès la Phase 1 (sinon migration lourde plus tard).

### 1.3 Création d'éléments 2D/3D dans la scène — "Scene Composer"

Cas d'usage : l'utilisateur place un texte 3D, dessine un cercle de tag autour d'un cluster, ajoute une note sticky en `<Html>`, importe un GLB statique en repère.

**Pattern** :
- Plugin `scene-composer` qui :
  - Déclare `slot: scene.annotations` (slot dérivé propre).
  - Stocke les annotations dans son propre `storeSlice` (`composerSlice`).
  - Persiste dans `localStorage`/export JSON via une contribution `contributions.persistence` (nouveau).
  - Expose un mode "édition" (toolbar dans `slot: canvas.top-left`).
- Sous-plugins : `composer-text-3d`, `composer-shape-2d`, `composer-glb-import`, etc.

**Vérification** :
- ✅ `sceneObjects` dans le manifest couvre l'injection 3D.
- 🔁 Manque : **slot d'outil scène** (mode "draw", "select", "annotate"). Ajouter un slot canonique `scene.tool` (single, type 'mode') en Phase 4.
- 🔁 Manque : **contribution `persistence`** pour participer à export/import (`exportImport.js`). Ajouter dès la Phase 1 (ou Phase 5).

### 1.4 Layouts alternatifs (force-directed → autres)

Aujourd'hui un seul layout WASM ([src/hooks/useForceLayout.js](src/hooks/useForceLayout.js)).

**Cibles** :
- `layout-circular` (cercle par communauté)
- `layout-tree` (arbre selon P279 hierarchies)
- `layout-temporal-axis` (axe X = date, Y = importance)
- `layout-geographic` (X/Z = lat/long, Y = altitude/époque)
- `layout-parallel-coords` (vue analytique)

**Vérification** :
- ✅ Manifest `contributions.layouts` prévu.
- 🔁 Manque : un **layout switcher** UI (slot `canvas.top-left` ou settings). Plugin `layout-switcher` à prévoir.
- 🔁 Le store doit autoriser plusieurs layouts simultanés (sous-graphes différents) → au moins **un ID de layout par cluster/groupe**. Pas urgent, mais pas bloquant.

### 1.5 Sources de données alternatives

- `dbpedia-source` (autre SPARQL endpoint)
- `local-file-source` (charger un Turtle/JSON-LD local)
- `csv-import` (pour utilisateurs académiques)
- `neo4j-bolt-source` (graphes propriétaires)
- `gpt-source` (génération de relations par LLM, expérimental)

**Vérification** :
- ✅ `dataSourceRegistry.js` (Phase 5) absorbe.
- 🔁 Capability `entity:search` doit être **paginable + multi-source** : le SearchModal devrait pouvoir agréger les résultats de plusieurs sources actives. Prévoir `ctx.data.fetchAll(capability, params)` qui renvoie `Map<sourceId, results>`.

### 1.6 Annotations & parcours (storytelling)

Cas d'usage : créer un parcours guidé "tour des philosophes du XIXe", avec étapes, narration, captures d'écran.

**Plugin `tour-builder`** :
- Stocke des étapes `{ stepId, focusNode, cameraSnapshot, narration }` dans son slice.
- Contribue `slot: canvas.bottom-right` (lecteur de tour).
- Capability `camera:snapshot` (déjà à ajouter en Phase 4).
- Persistance via `contributions.persistence`.

### 1.7 Marketplace + tier paid

**Vision** :
- Repo central `gexor-plugins/` (npm scope ou repo Git).
- Manifest distant chargé via URL : `host.installFromUrl('https://...')`.
- Tier `paid` → plugin charge un token API au runtime, contribue uniquement si valide.

**Vérification** :
- ✅ Manifest a déjà `tier`, `permissions`, `author`.
- 🔁 Manque : **résolveur d'install** (téléchargement, vérif intégrité, isolation iframe ou Web Worker). **Recommandation** : pas avant 12 mois, mais garder le contrat manifest assez riche pour ne pas casser.

### 1.8 Collaboration & multi-utilisateur (très long terme)

CRDT sur le graph store + diffusion des opérations. Out of scope mais :
- L'event bus + storeSlices isolés posent les bases.
- Si chaque plugin émet ses mutations via `ctx.graph.*` (et non `set()` direct), une couche CRDT peut intercepter en transparent.

---

## 2. Tableau de couverture des extensions

| Cas d'usage futur | Slot(s) requis | Capabilities | Manifest fields | Lacune actuelle (refonte phase) |
|-------------------|---------------|--------------|-----------------|-------------------------------|
| Minimap layers | `minimap.layer` (dérivé) | — | `declaresSlots`, `panels` | Phase 1 : ajouter `declaresSlots` |
| UI Builder | tous + primitives | — | `uiPrimitives`, layout descriptor | Phase 1 : ajouter `uiPrimitives` ; runtime tree-resolver à designer |
| Scene Composer | `scene.tool`, `scene.annotations` | `camera:snapshot` | `persistence` | Phases 4+5 : ajouter `persistence` contribution + `scene.tool` slot |
| Layouts alternatifs | `canvas.top-left` (switcher) | `layout:run` | `layouts` (déjà prévu) | OK |
| Data sources | — | tous `entity:*` | `dataSources` (déjà prévu) | Phase 5 : valider `fetchAll` agrégé |
| Annotations/Parcours | `scene.annotations`, `canvas.bottom-right` | `camera:snapshot` | `persistence` | idem composer |
| Marketplace | — | — | (tout déjà prévu) | Long terme : resolver d'install |
| Collaboration | — | — | — | Aucune si plugins respectent ctx.graph.* |

---

## 3. Ajouts à intégrer **dès la refonte** pour éviter migration douloureuse plus tard

> Ces 5 ajouts coûtent peu en Phase 1 mais évitent une refonte de la refonte.

1. **`contributions.declaresSlots`** — un plugin peut publier ses propres slots, scopés à lui-même.
2. **`contributions.uiPrimitives`** — un plugin publie des composants paramétrables consommables par d'autres.
3. **`contributions.persistence`** — `{ key, serialize(state), deserialize(json) }` — participe à `exportImport.js`.
4. **Slot `scene.tool`** — single, sélectionne un mode d'interaction global (select / draw / annotate / measure).
5. **`ctx.camera`** — `getCameraState()`, `setCameraState(snapshot)`, `useCameraState()`.

Ces 5 points coûtent environ **+150 lignes** sur l'effort total de la refonte mais débloquent 6 cas d'usage majeurs.

---

## 4. Anti-patterns à éviter

1. **Slots monolithiques** : ne pas faire d'un slot un fourre-tout (`slot: 'misc'`). Chaque slot a un contrat sémantique clair.
2. **Plugin god** : un plugin qui contribue à 8 slots simultanés est un signe qu'il faut le scinder.
3. **Capability fuyante** : une capability dont les paramètres dépendent d'un format Wikidata-spécifique (`{ qid, pid }`) — préférer `{ uri, predicate }` URI-générique.
4. **Couplage par bus seul** : le bus n'est pas un substitut au contrat. Les flux fréquents (sélection, position) doivent passer par `ctx.graph` / `ctx.ui`, pas par `bus.emit('selection-changed')`.
5. **Plugin qui reach-around** (`window.useGraphStore` ou `import store directly`) : doit throw en DEV, warn en PROD.
6. **Manifest dynamique muté à runtime** : le manifest est gelé après `register`. Toute config = via `ctx.settings`.

---

## 5. Permissions — modèle suggéré

| Permission | Donne accès à |
|-----------|--------------|
| `graph:read` | `ctx.graph.useNodes`, `useEdges`, `useNode`, `useSelectedNode` |
| `graph:write` | `addNodes`, `removeNode`, `updateNode`, `pin`, `unpin` |
| `graph:select` | `selectNode`, `selectEdge` |
| `network` | `fetch` natif (proxy via `ctx.net.fetch` qui logge + rate-limit) |
| `data:fetch` | `ctx.data.fetch(capability, ...)` |
| `data:provide` | enregistrer une `dataSources` contribution |
| `ui:slot` | rendre dans n'importe quel slot UI |
| `ui:command` | enregistrer une commande globale |
| `scene:3d` | rendre dans `scene.*` slots, `useFrame` |
| `scene:camera` | `getCameraState`, `setCameraState` |
| `settings:read` | lire ses propres settings |
| `settings:write` | écrire ses propres settings |
| `bus:listen` | `ctx.bus.on` |
| `bus:emit` | `ctx.bus.emit` (autorisé par défaut) |
| `persistence` | participer à export/import |
| `legacy:store-direct` | accès brut à `useGraphStore` (DEPRECATED, warn console) |

Strategy : permissions **opt-in** par manifest, pas opt-out. Plugin sans permissions = lecture seule de son contexte plus rien.

---

## 6. DX & outillage à prévoir (non bloquant pour la refonte)

- **`pnpm gexor:lint-plugin <path>`** — vérifie le manifest, les permissions, les slots utilisés, les composants.
- **`pnpm gexor:dev-plugin <path>`** — hot-reload d'un plugin externe pendant le dev.
- **Inspector intégré** (Cmd+Shift+I) : liste des plugins enabled, leurs contributions, leur état, leur consommation événements/data — intégré comme plugin `_core/devtools`.
- **Docs** : MDX pour chaque slot avec exemple visuel.

---

## 7. Décisions à valider quand la refonte sera en cours

1. Stratégie de versionning des manifests (`apiVersion: 2` → quand on bumpera ?). Politique semver.
2. Plugin tiers : isolation iframe/Worker (perf, sécurité) vs même contexte (DX). **Recommandation initiale** : même contexte + ErrorBoundary, isoler plus tard si nécessaire.
3. Compatibilité backward : combien de versions d'API simultanément supportées ? **Recommandation** : N et N-1, casse au N+1.
4. Politique de naming : `scope/plugin-id` (ex. `gexor/properties`, `tiers/temporal`) pour éviter collisions au moment marketplace.

---

## 8. Take-aways

1. La refonte plugin-first décrite dans [refonte-plugin-first.md](../architecture/refonte-plugin-first.md) **absorbe 7 cas d'usage majeurs sur 8** sans modification du contrat principal.
2. **5 ajouts mineurs en Phase 1** (`declaresSlots`, `uiPrimitives`, `persistence`, slot `scene.tool`, `ctx.camera`) débloquent les cas d'usage les plus ambitieux (Scene Composer, UI Builder, parcours).
3. Les seuls cas hors-portée court terme sont **marketplace en ligne** (résolveur d'install) et **collaboration temps réel** — mais le bus + storeSlices isolés posent déjà les bases.
4. La minimap actuelle, sans valeur stratégique aujourd'hui, devient une **vitrine du système plugin** une fois plugin-ifiée (layers superposables, ouverte aux extensions).
