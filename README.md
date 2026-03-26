# Gexor

**Explorateur 3D immersif de graphes de connaissances Wikidata** — navigation en temps réel dans le Linked Open Data.

Gexor permet d'explorer visuellement le graphe Wikidata dans un espace tridimensionnel, avec un backend Fastify (cache PostgreSQL, consolidation d'appels API), un moteur de layout force-directed WASM et un rendu WebGL performant via Three.js.

---

## Table des matières

- [Fonctionnalités](#fonctionnalités)
- [Aperçu technique](#aperçu-technique)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Lancement](#lancement)
- [Format des données](#format-des-données)
- [Architecture du projet](#architecture-du-projet)
- [Composants principaux](#composants-principaux)
- [Store Zustand](#store-zustand)
- [Moteur de layout](#moteur-de-layout)
- [Interactions utilisateur](#interactions-utilisateur)
- [Raccourcis clavier](#raccourcis-clavier)
- [Configuration](#configuration)
- [Technologies utilisées](#technologies-utilisées)
- [Licence](#licence)

---

## Fonctionnalités

- **Graphe 3D interactif** — navigation orbitale, zoom, pan et rotation via TrackballControls
- **Layout force-directed WASM** — calcul haute performance via `@antv/layout-wasm` (ForceLayout) avec SharedArrayBuffer
- **Instanced rendering** — rendu optimisé de milliers de nœuds/arêtes via `THREE.InstancedMesh`
- **Système de pinning & groupes** — épinglez des nœuds centraux et explorez leurs voisins par profondeur BFS configurable
- **Mode radial** — disposition radiale optionnelle autour des nœuds pinnés avec sphères visuelles décoratives
- **Backend Fastify + PostgreSQL** — consolidation des appels Wikidata (1 round-trip au lieu de 6-10), cache 3 tiers (mémoire → PostgreSQL → API), proxy image COEP
- **Classification intelligente (classify-first)** — chaque PID classifié avant fetch (primary/secondary/context-dependent), budgets par tier, déduplication des groupes de redondance A-axis
- **Context Resolver** — promotion automatique des PIDs context-dependent selon le type P31 de l'entité (20 familles : humain, pays, film…)
- **Nœuds agrégateurs** — références entrantes groupées par SPARQL (PID × P31 type × count), rendus en hexagones violets, expandables au clic
- **Filtre Wikimedia** — exclusion de 7 types internes Wikidata (catégories, disambig, templates…)
- **Filtrage avancé** — par type de relation (P-IDs), classification automatique des propriétés Wikidata
- **Panneau de détails** — informations complètes sur le nœud sélectionné (résumé, chronologie, géographie, tags)
- **Nœuds connectés** — exploration des nœuds liés au nœud sélectionné avec ajout en un clic
- **Minimap** — vue miniature 2D du graphe pour la navigation rapide
- **Undo / Redo** — historique des actions avec snapshots de positions
- **Recherche** — barre de recherche par nom ou alias avec suggestion des nœuds les plus connectés
- **Drag & drop** — déplacement de nœuds dans l'espace 3D avec prise en compte de la caméra
- **Level of Detail (LoD)** — bascule automatique entre labels texte et sphères instanciées selon la distance caméra
- **Fond décoratif** — grille perspective optionnelle avec image d'horizon

---

## Aperçu technique

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Gexor                                      │
│                                                                          │
│  ┌──────────────┐   ┌───────────────────┐   ┌──────────────────────────┐ │
│  │  Wikidata API │   │  Backend Fastify   │   │  Frontend React 19       │ │
│  │  (Action +    │◀─▶│  Cache PostgreSQL  │◀─▶│                          │ │
│  │   SPARQL)     │   │  Proxy image COEP  │   │  Store Zustand (5 slices)│ │
│  └──────────────┘   └───────────────────┘   │  + Force Layout WASM     │ │
│                                              │  + Three.js instanced    │ │
│                                              └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

  Wikidata API ←→ Fastify Backend (cache PG) ←→ Frontend fetch
    ←→ dataSlice → graphSlice → useForceLayout (WASM) → Scene (Three.js)
```

---

## Prérequis

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 16
- **npm** ou **yarn**
- Un navigateur supportant **SharedArrayBuffer** (Chrome, Edge, Firefox avec headers COOP/COEP)

> Les headers `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp` sont configurés automatiquement par le serveur Vite.

---

## Installation

```bash
git clone https://github.com/<votre-username>/Gexor.git
cd Gexor
npm install
```

### Base de données

```bash
sudo -u postgres createdb gexor -O $(whoami)
psql gexor < server/db/schema.sql
```

---

## Lancement

### Développement

```bash
npm run dev          # Frontend (localhost:3000) + Backend (localhost:3001) en parallèle
npm run dev:frontend # Frontend uniquement
npm run dev:backend  # Backend uniquement (nécessite PostgreSQL)
```

Le serveur Vite démarre sur [http://localhost:3000](http://localhost:3000). Le backend Fastify écoute sur [http://localhost:3001](http://localhost:3001). Le dev server Vite proxie `/api/*` vers le backend.

### Build de production

```bash
npm run build        # Build frontend
npm run start        # Démarre le backend en production
```

### Docker

```bash
docker compose up -d --build   # Build & démarre tout (frontend + backend + PostgreSQL)
docker compose down             # Stoppe tout
```

App disponible sur **http://localhost:3080**. Backend API sur **http://localhost:3001**.

### Prévisualisation du build

```bash
npm run preview
```

---

## Source de données

Gexor interroge le **graphe Wikidata** en temps réel via un backend Fastify qui consolide les appels API et met en cache les résultats dans PostgreSQL.

### Pipeline de données

1. **Recherche** — `GET /api/search?q=...&lang=fr` → Wikidata Action API
2. **Expansion** — `GET /api/entity/:qid/expand?direction=both` → entité + voisins en 1 appel
3. **Agrégation entrante** — `GET /api/entity/:qid/incoming-aggregates` → SPARQL groupé (PID × P31 type × count)
4. **Expansion d'agrégat** — `GET /api/entity/:qid/aggregate-children?pid=...&type=...` → entités individuelles
5. **Image proxy** — `GET /api/image?url=...` → proxy Wikimedia Commons (fixe conflit COEP)

### Modèle classify-first

Le backend classifie chaque propriété Wikidata **avant** de récupérer les voisins :
- **D (primary)** — toujours incluses (P31, P279, P361, P527…)
- **C promoted** — promues par le Context Resolver selon le type P31
- **Unclassified** — budget de 20 propriétés max
- **A (redundancy)** — une seule PID par groupe de redondance (la plus spécifique)
- **B (secondary)** — exclues par défaut

### Types de nœuds

| Type | Couleur | Description |
|------|---------|-------------|
| **Standard** | 🔵 Hash dynamique | Entités Wikidata (Q-items), couleur selon `getCategoryColor()` |
| **Agrégateur** | 🟣 Violet hexagonal | Groupe de N entités entrantes (ex: « 47 articles scientifiques ») |

Les nœuds agrégateurs avec count ≤ 5 sont auto-expandés en nœuds individuels. Les agrégateurs avec count > 5 sont affichés comme hexagones violets cliquables.

---

## Architecture du projet

```
Gexor/
├── index.html                    # Point d'entrée HTML
├── package.json                  # Dépendances & scripts
├── vite.config.js                # Config Vite (WASM, COOP/COEP, proxy /api)
├── tailwind.config.js            # Config Tailwind CSS
├── postcss.config.js             # Config PostCSS
├── docker-compose.yml            # Orchestration Docker (frontend + backend + PG)
├── wikidata_properties.json       # Classification O(1) des PIDs Wikidata
├── docker/                       # Dockerfiles & config nginx
├── server/                       # Backend Fastify
│   ├── index.js                  # Entry point Fastify, plugins, CORS
│   ├── config.js                 # Configuration (ports, DB, TTLs)
│   ├── db/
│   │   ├── pool.js               # Connexion PostgreSQL + init schema
│   │   └── schema.sql            # Schéma cache_entries, pid_labels, qid_labels
│   ├── routes/
│   │   ├── entity.js             # /api/entity/:qid, neighbors, expand, aggregates
│   │   ├── search.js             # /api/search
│   │   ├── image.js              # /api/image (proxy Wikimedia COEP)
│   │   └── sparql.js             # /api/sparql (proxy SPARQL)
│   └── services/
│       ├── wikidataClient.js     # Logique Wikidata (classify-first, SPARQL agreg.)
│       ├── labelResolver.js      # Résolution labels 3 tiers (mem → PG → API)
│       └── cacheService.js       # Cache PostgreSQL (get/set/invalidate)
└── src/
    ├── main.jsx                  # Bootstrap React
    ├── App.jsx                   # Composant racine
    ├── Gexor.jsx                 # Composant principal (UI + Canvas, ~520 lignes)
    ├── index.css                 # Styles globaux (Tailwind)
    ├── components/
    │   ├── Graph/                # Composants 3D (Three.js / R3F)
    │   │   ├── Scene.jsx         # Scène 3D principale (drag, camera, radial)
    │   │   ├── InstancedNodes.jsx# Rendu instancié des nœuds + hexagones agrégateurs
    │   │   ├── InstancedEdges.jsx# Rendu instancié des arêtes
    │   │   ├── Node.jsx          # Nœud LoD (label texte haute résolution)
    │   │   ├── Minimap.jsx       # Minimap 2D SVG
    │   │   ├── RadialSpheres.jsx # Sphères décoratives radiales
    │   │   └── DynamicTrackballControls.jsx # Contrôles caméra
    │   └── UI/                   # Composants d'interface 2D
    │       ├── SettingsPanel.jsx # Panneau paramètres & filtres
    │       ├── NodeDetailPanel.jsx    # Détails du nœud / agrégat sélectionné
    │       ├── AllPropertiesModal.jsx # Modale toutes propriétés
    │       ├── GroupInfoPanel.jsx     # Infos & contrôles par groupe
    │       ├── ConnectedNodesPanel.jsx# Nœuds connectés au nœud
    │       └── StartScreen.jsx       # Écran d'accueil Wikidata
    ├── constants/
    │   └── graphConstants.js     # Couleurs, dimensions, budgets, agrégats
    ├── data/
    │   └── contextRules.json    # Règles Context Resolver (20 familles P31)
    ├── hooks/
    │   ├── useForceLayout.js     # Hook de gestion du layout WASM
    │   └── useKeyboardShortcuts.js # Raccourcis clavier globaux
    ├── models/
    │   └── lodNode.js            # Modèles LodNode, LodEdge, AggregateNode
    ├── services/
    │   ├── cacheService.js       # Cache L1 mémoire (Map, 10-min TTL)
    │   ├── contextResolver.js    # Context Resolver (promotion PIDs selon P31)
    │   ├── propertyClassification.js # Classification O(1), dedup, noise filter
    │   ├── prefetchQueue.js      # File d'attente pré-chargement
    │   ├── sparqlClient.js       # Client SPARQL
    │   └── queries/
    │       └── wikidata.js       # Thin API client (/api/* endpoints)
    ├── store/
    │   ├── useGraphStore.js      # Store Zustand (composition des slices)
    │   ├── utils.js              # Mappers LOD Node/Edge, utilitaires
    │   └── slices/
    │       ├── dataSlice.js      # Données brutes, agrégats, expand/collapse, nodeSettings par nœud
    │       ├── graphSlice.js     # Nœuds/arêtes visibles, classify-first, context, filtrage direction par nœud
    │       ├── uiSlice.js        # Sélection, caméra, état simulation, fetch sortant à la demande
    │       ├── historySlice.js   # Undo/redo avec snapshots
    │       └── pinSlice.js       # Verrouillage de position (pin), drag
    └── utils/
        ├── sharedPositions.js    # SharedArrayBuffer pour positions
        └── radialLayout.js       # Calcul des positions radiales
```

---

## Composants principaux

### Gexor.jsx

Composant orchestrateur principal. Gère :
- L'initialisation des données et du layout
- L'interface utilisateur (toolbar, panneaux, recherche)
- Le Canvas Three.js via React Three Fiber
- La coordination entre UI 2D et scène 3D

### Scene.jsx

Scène 3D contenant :
- Les nœuds instanciés (`InstancedNodes`) et individuels LoD (`Node`)
- Les arêtes instanciées (`InstancedEdges`)
- Les sphères radiales décoratives (`RadialSpheres`)
- La gestion du drag 3D avec projection écran → monde
- Les contrôles caméra (`DynamicTrackballControls`)

### InstancedNodes.jsx

Rendu performant des nœuds via `THREE.InstancedMesh`. Couleurs dynamiques via `getCategoryColor()` (hash de l’URI). Les nœuds agrégateurs sont rendus en **hexagones violets** avec taille proportionnelle à `log₂(count)`. Les nœuds récemment ajoutés au graphe via `addNodeToGraph` reçoivent une **animation pulse verte** (`ADDED_PULSE_COLOR`, 1500ms). Mise à jour des positions chaque frame depuis le SharedArrayBuffer.

### InstancedEdges.jsx

Rendu des arêtes entre nœuds avec support des flèches directionnelles et de l'opacité par type de relation.

---

## Store Zustand

Le state management est organisé en **5 slices** composées dans un store unique :

| Slice | Responsabilité |
|-------|---------------|
| **dataSlice** | Appels API backend, cache L1, données brutes, agrégats, expand/collapse, **nodeSettings par nœud**, `addNodeToGraph`, `recentlyAddedNodes` |
| **graphSlice** | Nœuds/arêtes visibles, classify-first PID filtering, PIDs context-promoted, BFS, **filtrage direction par nœud** |
| **uiSlice** | Sélection, état du layout, caméra, simulation pause/play, fetch sortant à la demande |
| **historySlice** | Snapshots pour undo/redo (max 50 entrées) |
| **pinSlice** | **Verrouillage de position** (pin/unpin), drag. Profondeur/direction/radial délégués à `dataSlice.nodeSettings` |

### Flux de données

1. `searchWikidata(q)` ou `initFromEntity(qid)` → appel backend `/api/*`
2. `fetchAndExpandNode(qid)` → récupère entité + voisins + agrégats entrants
3. Context Resolver promeut les PIDs context-dependent selon les types P31
4. `updateGraphData()` → BFS multi-sources, filtrage classify-first
5. Les nœuds/arêtes résultants alimentent le layout force-directed WASM
6. Les positions calculées sont écrites dans le SharedArrayBuffer
7. Les composants 3D lisent les positions en `useFrame()` sans allocation

---

## Moteur de layout

Le layout utilise **@antv/layout-wasm** (ForceLayout) compilé en WebAssembly pour des performances optimales :

- **Force-directed** en 3D avec répulsion, gravité et liens élastiques
- Exécution par **batchs** (100 itérations) pour feedback de progression
- **SharedArrayBuffer** pour communication zero-copy avec le thread de rendu
- Les nœuds **pinnés** et **draggés** conservent leur position pendant le calcul
- Support du **mode radial** : interpolation entre positions physiques et positions radiales

### Paramètres du layout

| Paramètre | Valeur par défaut | Description |
|-----------|-------------------|-------------|
| `gravity` | 0 | Force de gravité vers le centre |
| `nodeStrength` | 100 | Répulsion entre nœuds |
| `edgeStrength` | 100 | Force des liens |
| `linkDistance` | 30 | Distance cible des liens |
| `damping` | 0.8 | Amortissement |
| `maxIteration` | 500 | Itérations max par batch |
| `dimensions` | 3 | Espace 3D |

---

## Interactions utilisateur

| Action | Effet |
|--------|-------|
| **Clic** sur un nœud | Sélectionne et affiche ses détails |
| **Double-clic** sur un nœud (recherche / liste) | Ajoute le nœud au graphe et initie un drag |
| **Drag** d'un nœud | Déplace le nœud dans l'espace 3D |
| **Molette** | Zoom avant/arrière |
| **Clic droit + Drag** | Rotation de la caméra |
| **Clic milieu + Drag** | Pan de la caméra |
| **Pin** (📌) | Épingle un nœud comme centre d'exploration |
| **Profondeur** | Contrôle le nombre de couches BFS autour d'un nœud pinné |
| **Focus** (🎯) | Centre la caméra sur le nœud sélectionné |
| **Play / Pause** | Contrôle la simulation physique |
| **Step Forward** | Lance un calcul de stabilisation du layout |

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `P` | Pin / Unpin le nœud sélectionné |
| `Ctrl + Z` | Annuler (Undo) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Refaire (Redo) |

---

## Configuration

### Constantes du graphe

Les paramètres par défaut sont centralisés dans `src/constants/graphConstants.js` :

- **Couleurs** dynamiques par hash d'URI (`getCategoryColor()`)
- **Géométrie** : rayon des nœuds (`NODE_RADIUS = 8`), taille des flèches
- **Agrégats** : `AGGREGATE_NODE_COLOR` (violet), échelle min/max, `getAggregateScale(count)`
- **Instancing** : max instances (`MAX_INSTANCES = 5000`)
- **Profondeur** d’exploration max (`MAX_DEPTH = 5`)
- **Directions** d’exploration : `EXPLORATION_DIRECTIONS` (outgoing, incoming, both), défaut `'incoming'`
- **Mise en évidence** : `SELECTION_OUTLINE_COLOR` (bleu), `ADDED_PULSE_COLOR` (vert), `ADDED_PULSE_DURATION` (1500ms)
- **nodeSettings** : `defaultNodeSettings()` factory (depth, direction, renderMode, radialStrength)
- **Filtres** par défaut, niveaux d'opacité
- **Layout** force-directed (gravité, répulsion, distance des liens, etc.)
- **Historique** : taille max des snapshots (`MAX_HISTORY_SIZE = 50`)

### Vite

Le fichier `vite.config.js` configure :
- Les plugins **WASM** et **top-level await** pour `@antv/layout-wasm`
- Les **headers COOP/COEP** requis pour SharedArrayBuffer
- L'exclusion de `@antv/layout-wasm` de l'optimisation des dépendances
- Le format ES pour les workers

---

## Technologies utilisées

| Technologie | Version | Rôle |
|-------------|---------|------|
| [React](https://react.dev) | 19.x | Framework UI |
| [Fastify](https://fastify.dev) | 5.x | Backend API (cache, consolidation, proxy) |
| [PostgreSQL](https://www.postgresql.org) | ≥ 16 | Cache L2, labels, sessions |
| [Three.js](https://threejs.org) | 0.182 | Rendu 3D WebGL |
| [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) | 9.x | Intégration React + Three.js |
| [@react-three/drei](https://github.com/pmndrs/drei) | 10.x | Helpers R3F (Text, Html, etc.) |
| [Zustand](https://zustand-demo.pmnd.rs/) | 5.x | State management |
| [@antv/layout-wasm](https://github.com/antvis/layout) | 1.x | Layout force-directed WASM |
| [Vite](https://vitejs.dev) | 7.x | Bundler & dev server |
| [Tailwind CSS](https://tailwindcss.com) | 4.x | Styling utilitaire |
| [Lucide React](https://lucide.dev) | 0.561 | Icônes |

---

## Licence

ISC
