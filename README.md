# NexReecGraph

**Visualisation 3D interactive de graphes de connaissances REEC** — module externe/test de la plateforme NexReec.

NexReecGraph permet d'explorer visuellement des réseaux d'entités, événements et contextes (REECs) interconnectés dans un espace tridimensionnel, avec un moteur de layout physique basé sur WASM et un rendu WebGL performant via Three.js.

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
- **Système de pinning & groupes** — épinglez des REECs centraux et explorez leurs voisins par profondeur BFS configurable
- **Mode radial** — disposition radiale optionnelle autour des nœuds pinnés avec sphères visuelles décoratives
- **Filtrage avancé** — par type (Entity / Event / Context), confiance, tags, plage de dates, recherche textuelle
- **Contrôle d'opacité** — réglage indépendant de l'opacité par type de nœud et par relation
- **Panneau de détails** — informations complètes sur le nœud sélectionné (résumé, chronologie, géographie, tags)
- **REECs connectés** — exploration des REECs liés au nœud sélectionné avec ajout en un clic
- **Minimap** — vue miniature 2D du graphe pour la navigation rapide
- **Undo / Redo** — historique des actions avec snapshots de positions
- **Recherche** — barre de recherche par nom ou alias avec suggestion des REECs les plus connectés
- **Drag & drop** — déplacement de nœuds dans l'espace 3D avec prise en compte de la caméra
- **Level of Detail (LoD)** — bascule automatique entre labels texte et sphères instanciées selon la distance caméra
- **Fond décoratif** — grille perspective optionnelle avec image d'horizon

---

## Aperçu technique

```
┌─────────────────────────────────────────────────────────────┐
│                        NexReecGraph                          │
│                                                              │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │  Données  │──▶│  Store        │──▶│  Rendu 3D            │ │
│  │  JSON     │   │  Zustand      │   │  React Three Fiber   │ │
│  └──────────┘   │  (5 slices)   │   │  + Instanced Meshes  │ │
│                  └──────┬───────┘   └──────────────────────┘ │
│                         │                                    │
│                  ┌──────▼───────┐                            │
│                  │  Force Layout │                            │
│                  │  @antv/wasm   │                            │
│                  │  + SharedArray│                            │
│                  └──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Prérequis

- **Node.js** ≥ 18
- **npm** ou **yarn**
- Un navigateur supportant **SharedArrayBuffer** (Chrome, Edge, Firefox avec headers COOP/COEP)

> Les headers `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp` sont configurés automatiquement par le serveur Vite.

---

## Installation

```bash
git clone https://github.com/<votre-username>/NexReecGraph.git
cd NexReecGraph
npm install
```

---

## Lancement

### Développement

```bash
npm run dev
```

Le serveur Vite démarre sur [http://localhost:3000](http://localhost:3000) et ouvre automatiquement le navigateur.

### Build de production

```bash
npm run build
```

### Prévisualisation du build

```bash
npm run preview
```

---

## Format des données

NexReecGraph consomme un fichier JSON avec la structure suivante :

```json
{
  "reecs": [
    {
      "reec_id": "uuid-unique",
      "label": "Louis XIV",
      "type": "Entity",
      "subtype": "Personne",
      "category": "Monarque",
      "summary_short": "Roi de France (1643-1715)",
      "summary_detailed": "Description détaillée...",
      "temporal_start_date": "1638-09-05",
      "temporal_end_date": "1715-09-01",
      "temporal_precision": "jour",
      "spatial_locations": ["Versailles", "Paris"],
      "metadata_confiance": 0.95,
      "metadata_tags": ["monarchie", "absolutisme"],
      "aliases": ["Le Roi-Soleil"]
    }
  ],
  "relations": [
    {
      "source_reec_id": "uuid-source",
      "target_reec_id": "uuid-target",
      "relation_type": "participe_à",
      "description": "Description de la relation",
      "confiance": 0.9
    }
  ]
}
```

### Types de REECs

| Type | Couleur | Description |
|------|---------|-------------|
| **Entity** | 🔵 Bleu (`#3b82f6`) | Personnes, lieux, organisations, objets |
| **Event** | 🟢 Vert (`#10b981`) | Événements historiques, batailles, traités |
| **Context** | 🟣 Violet (`#8b5cf6`) | Concepts, périodes, mouvements |

Le fichier de données est importé dans `src/App.jsx` — modifiez l'import pour charger un jeu de données différent :

```jsx
import JSONfile from '../data/votre_fichier.json';
```

---

## Architecture du projet

```
NexReecGraph/
├── index.html                    # Point d'entrée HTML
├── package.json                  # Dépendances & scripts
├── vite.config.js                # Config Vite (WASM, COOP/COEP)
├── tailwind.config.js            # Config Tailwind CSS
├── postcss.config.js             # Config PostCSS
├── data/                         # Jeux de données JSON
│   ├── reecs_ultra_massive_v2.json
│   ├── epoque_moderne_reecs.json
│   └── tests_reecs*.json
└── src/
    ├── main.jsx                  # Bootstrap React
    ├── App.jsx                   # Composant racine (chargement données)
    ├── NexReecGraph.jsx          # Composant principal (UI + Canvas)
    ├── index.css                 # Styles globaux (Tailwind)
    ├── components/
    │   ├── Graph/                # Composants 3D (Three.js / R3F)
    │   │   ├── Scene.jsx         # Scène 3D principale (drag, camera, radial)
    │   │   ├── InstancedNodes.jsx# Rendu instancié des nœuds
    │   │   ├── InstancedEdges.jsx# Rendu instancié des arêtes
    │   │   ├── Node.jsx          # Nœud LoD (label texte haute résolution)
    │   │   ├── Minimap.jsx       # Minimap 2D SVG
    │   │   ├── RadialSpheres.jsx # Sphères décoratives radiales
    │   │   └── DynamicTrackballControls.jsx # Contrôles caméra
    │   └── UI/                   # Composants d'interface 2D
    │       ├── SearchBar.jsx     # Barre de recherche
    │       ├── SettingsPanel.jsx # Panneau paramètres & filtres
    │       ├── NodeDetailPanel.jsx    # Détails du nœud sélectionné
    │       ├── GroupInfoPanel.jsx     # Infos & contrôles par groupe
    │       ├── ConnectedReecsPanel.jsx# REECs connectés au nœud
    │       ├── FloatingListPanel.jsx  # Liste flottante générique
    │       └── UnifiedFilterSection.jsx # Section de filtres unifiée
    ├── constants/
    │   └── graphConstants.js     # Couleurs, dimensions, defaults du layout
    ├── hooks/
    │   ├── useForceLayout.js     # Hook de gestion du layout WASM
    │   └── useKeyboardShortcuts.js # Raccourcis clavier globaux
    ├── store/
    │   ├── useGraphStore.js      # Store Zustand (composition des slices)
    │   ├── utils.js              # Mappers REEC → Node/Edge, utilitaires
    │   └── slices/
    │       ├── dataSlice.js      # Chargement données brutes, tags, dates
    │       ├── graphSlice.js     # Nœuds/arêtes visibles, filtrage, opacité
    │       ├── uiSlice.js        # Sélection, caméra, état simulation
    │       ├── historySlice.js   # Undo/redo avec snapshots
    │       └── pinSlice.js       # Système de pinning, groupes, drag
    ├── utils/
    │   ├── sharedPositions.js    # SharedArrayBuffer pour positions
    │   └── radialLayout.js       # Calcul des positions radiales
    └── workers/                  # (Réservé — layout WASM interne)
```

---

## Composants principaux

### NexReecGraph.jsx

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

Rendu performant des nœuds via `THREE.InstancedMesh`. Les nœuds sont regroupés par catégorie (Entity, Event, Context) avec couleurs et opacités distinctes. Mise à jour des positions chaque frame depuis le SharedArrayBuffer.

### InstancedEdges.jsx

Rendu des arêtes entre nœuds avec support des flèches directionnelles et de l'opacité par type de relation.

---

## Store Zustand

Le state management est organisé en **5 slices** composées dans un store unique :

| Slice | Responsabilité |
|-------|---------------|
| **dataSlice** | Chargement JSON, REECs disponibles, relations, tags, dates |
| **graphSlice** | Nœuds/arêtes visibles, BFS multi-sources, filtrage, opacité |
| **uiSlice** | Sélection, état du layout, caméra, simulation pause/play |
| **historySlice** | Snapshots pour undo/redo (max 50 entrées) |
| **pinSlice** | Système de pinning, profondeur d'exploration, mode radial, drag |

### Flux de données

1. `loadData(json)` → identifie le REEC le plus connecté, le pinne par défaut
2. `updateGraphData()` → BFS multi-sources depuis les nœuds pinnés selon leur profondeur
3. Les nœuds/arêtes résultants alimentent le layout force-directed
4. Les positions calculées sont écrites dans le SharedArrayBuffer
5. Les composants 3D lisent les positions en `useFrame()` sans allocation

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
| `gravity` | 10 | Force de gravité vers le centre |
| `nodeStrength` | 1000 | Répulsion entre nœuds |
| `edgeStrength` | 200 | Force des liens |
| `linkDistance` | 200 | Distance cible des liens |
| `damping` | 0.9 | Amortissement |
| `maxIteration` | 500 | Itérations max par batch |
| `dimensions` | 3 | Espace 3D |

---

## Interactions utilisateur

| Action | Effet |
|--------|-------|
| **Clic** sur un nœud | Sélectionne et affiche ses détails |
| **Double-clic** sur un REEC (recherche / liste) | Ajoute le REEC au graphe et initie un drag |
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

- **Couleurs** par type de REEC (`COLOR_MAP`)
- **Géométrie** : rayon des nœuds (`NODE_RADIUS = 8`), taille des flèches
- **Instancing** : max instances (`MAX_INSTANCES = 5000`)
- **Profondeur** d'exploration max (`MAX_DEPTH = 10`)
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
