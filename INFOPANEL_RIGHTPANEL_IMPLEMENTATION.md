# InfoPanel + RightPanel — Spécification d'Implémentation

> **Version** : 1.0  
> **Statut** : Spec pré-implémentation — à lire avant tout travail sur NodeDetailPanel  
> **Remplace** : NodeDetailPanel.jsx (variant Node, Relation, Aggregate)  
> **Nouveaux composants** : `InfoPanel`, `RightPanel`, `TagsFormat`, `ExplorationBar`, `PluginSystem`

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [InfoPanel](#2-infopanel)
3. [ExplorationBar](#3-explorationbar)
4. [TagsFormat](#4-tagsformat)
5. [RightPanel](#5-rightpanel)
6. [Basics/Plugins — Architecture Onglets](#6-basicsplugins--architecture-onglets)
7. [Plugin System](#7-plugin-system)
8. [Interactions et états mutuels](#8-interactions-et-états-mutuels)
9. [Migrations depuis NodeDetailPanel](#9-migrations-depuis-nodedetailpanel)
10. [Structure de fichiers](#10-structure-de-fichiers)

---

## 1. Vue d'ensemble

### Remplacement de NodeDetailPanel

`NodeDetailPanel` est supprimé. Trois variants existants (`Node`, `Relation`, `Aggregate`) deviennent un seul composant `InfoPanel` avec trois modes internes.

### Deux panneaux complémentaires et exclusifs

```
┌─────────────────────────────────────────────────────────┐
│  Canvas 3D                          │   RightPanel       │
│  (pleine largeur si InfoPanel)      │   (si ouvert)      │
│  (carré h-screen si RightPanel)     │                    │
│                                     │  Header 30%        │
│                          ┌──────┐   │  ─────────────     │
│                          │ <-> │   │  Basics/Plugins    │
│                     ┌────┴─────┴───┤  70%               │
│                     │  InfoPanel   │                    │
│                     │  ...         └────────────────────┘
│                     └──────────────┘
```

**Règle d'exclusivité** : InfoPanel et RightPanel ne peuvent pas être ouverts simultanément. Ouvrir l'un ferme l'autre. Le bouton `<->` sur l'InfoPanel est le seul point de bascule.

### Ce qui disparaît

- `NodeSettingsSection` (entier)
- Render mode toggle (Force/Radial) dans l'InfoPanel
- Sections Direction (Entrants/Sortants/Shared) dans l'InfoPanel
- Bouton "Explorer / Réexplorer" dans l'InfoPanel
- Badges "sortants/entrants chargés" dans l'InfoPanel
- Grid Connexions + Type en bas de l'InfoPanel
- `PropertiesGrouped` dans l'InfoPanel (migré vers sesr Propriétés dans RightPanel)

---

## 2. InfoPanel

### Positionnement et dimensions

```
position: absolute, bottom-4 right-4
width: 500px
max-height: 800px
z-index: 30
```

Quand le RightPanel est ouvert : InfoPanel se ferme. Le bouton `<->` flottant persiste au-dessus du canvas.

### Structure visuelle (pour les 3 modes)

```
┌─────────────────────────────────────────────┐
│  [<->]  ← bouton étendre flottant, hors flow │
├─────────────────────────────────────────────┤
│  HEADER                                     │
│  type badge | label | actions (focus/pin/×) │
│  description italique                       │
├─────────────────────────────────────────────┤
│  EXPLORATION BAR (mode Node + Aggregate)    │
│  [Off] [Propriétés] [Associés]   [Load ↻]  │
├─────────────────────────────────────────────┤
│  TAGS FORMAT                                │
│  ── Exploration ──                          │
│  [tag] [tag] [tag]                          │
│  ── Action ──                               │
│  [tag] [tag]                                │
├─────────────────────────────────────────────┤
│  BASICS/PLUGINS BAR (bottom, full-width)    │
│  icônes → sections du RightPanel            │
└─────────────────────────────────────────────┘
```

### Bouton étendre `<->`

- Positionné **au-dessus** du panel, centré horizontalement, légèrement incliné (rotate-45 ou badge pill incliné)
- Click → ferme InfoPanel, ouvre RightPanel avec le même nœud/edge sélectionné
- Si RightPanel déjà ouvert → referme RightPanel, rouvre InfoPanel
- État store : `rightPanelOpen: boolean` dans `uiSlice`

### Mode Node

**Header :**
- Badge type (cliquable : naviguer vers le type | right-click : filtre type)
- Label h2 (cliquable : openSearchModal avec filtre entité)
- Actions : Focus, Pin, Trash, séparateur, ×
- Gradient de fond : `getCategoryColorAlpha(type, 0.45)`

**Contenu :**
1. `ExplorationBar`
2. `TagsFormat`
3. `BasicsPluginsBar` (bottom)

### Mode Relation (Edge)

**Header :**
- Badge "Relation"
- Label de la propriété (h2)
- Source → Target (boutons cliquables)
- Actions : ×

**Contenu :**
1. Description si disponible
2. Qualifiers si présents (rendu depuis `edge.qualifiers`) — affichage simple key/value
3. `TagsFormat` (section Exploration : Filtrer par PID, PID sur Wikidata | section Action : Filtrer, Parcours)
4. `BasicsPluginsBar`

> Note : les qualifiers sont déjà dans les payloads `wbgetentities` (`claim.qualifiers`), actuellement silencieusement ignorés dans `wikidataClient.js`. Aucune requête supplémentaire nécessaire pour les afficher.

### Mode Aggregate

**Header :**
- Badge "Agrégat" + icône Layers
- Label : `N × [predicateLabel]`
- Types cibles si connus
- Actions : Focus, ×

**Contenu :**
1. Phrase descriptive réarrangée : `N entités reliées par [prop] parmi les types [types].`
2. Deux boutons horizontaux :
   - **Split** (ancien "Développer") : expand aggregate → remplace le nœud agrégat par les nœuds enfants dans le graphe
   - **Étendre** : garde le nœud agrégat en tant que hub parent, ajoute les enfants autour. Requiert modification `graphSlice` — voir §9.
3. `AggregateEntityList` (liste scrollable, inchangée fonctionnellement)
4. `TagsFormat`
5. `BasicsPluginsBar`

---

## 3. ExplorationBar

### Composant : `ExplorationBar.jsx`

```
Props: { nodeUri: string }
```

### Rendu

```
┌─────────────────────────────────────────────┐
│  [Off]  [Propriétés]  [Associés]    [Load ↻] │
└─────────────────────────────────────────────┘
```

Ligne horizontale full-width, positionnée après le header/description.

### Logique

**[Off]** : `explorationDirection = ''` → nœud visible mais non exploré. État par défaut.

**[Propriétés]** : `explorationDirection` inclut `'outgoing'`. Sortants = les propriétés du nœud pointant vers d'autres entités.

**[Associés]** : `explorationDirection` inclut `'incoming'`. Entrants = entités qui pointent vers ce nœud.

Les trois boutons sont **toggleables indépendamment** (multi-select possible). [Off] est mutuellement exclusif : si activé, désactive les autres. Si Propriétés ou Associés activé, désactive Off.

**Indicateurs d'état** sur les boutons (pas de badges séparés) :
- Dot coloré sous le bouton si la direction est déjà chargée (`expandedUris` / `incomingExpandedUris`)
- Spinner inline si en cours de chargement

**[Load ↻]** : déclenche `fetchAndExpandNode(nodeUri, { force: true })` avec les directions actives. Désactivé si Off actif ou si loading.

### Note sur "Similaires" (shared)

La direction `shared` est retirée de l'ExplorationBar. Elle est accessible uniquement via le Plugin **Cluster (shared property-value)** dans le RightPanel. Le store continue de supporter `explorationDirection = 'shared'` mais l'UI d'entrée change de lieu.

---

## 4. TagsFormat

### Composant : `TagsFormat.jsx`

```
Props: {
  nodeUri?: string,       // mode Node
  edgeData?: object,      // mode Relation
  aggregateId?: string,   // mode Aggregate
  mode: 'node' | 'edge' | 'aggregate'
}
```

### Structure visuelle

```
── Exploration ──────────────────────────────
[🔍 Propriétés (14)]  [👥 Associés (7)]  [🌐 Wikipedia]
[📅 Chronologie]  [🗺 Globe 3D]

── Action ───────────────────────────────────
[📌 Sauvegarder seed]  [✏️ Annoter]  [＋ Ajouter à un parcours]
```

Deux sections distinctes avec séparateur label. Les sections sont compactes (pas de scroll, 1-2 lignes de wrapping max).

### Contrat d'un tag

```typescript
type Tagétat = 'actif' | 'inactif' | 'locked' | 'marketplace' | 'loading'

interface ExplorationTag {
  id: string
  label: string
  icon?: string          // lucide icon name
  action: () => void     // ce qui se passe au clic
  état: TagState
  score?: number         // pour tri par pertinence
  source: 'structural' | 'context-resolver' | 'dynamic' | 'relational'
}

interface ActionTag {
  id: string
  label: string
  icon?: string
  action: () => void
  disponible: boolean
}
```

**États visuels :**
- `actif` : tag coloré plein (bg-color/20 text-color border-color/30)
- `inactif` : tag gris (bg-slate-800/40 text-slate-500)
- `locked` : tag gris avec icône cadenas — premium, click → upsell
- `marketplace` : tag gris avec icône store — plugin non installé, click → marketplace (ou dossier plugins en attendant)
- `loading` : tag avec spinner inline

### Architecture de génération — 4 couches

#### Couche 1 — Structurelle (toujours présente)

Générée depuis la simple existence du nœud sélectionné. Indépendante du contenu chargé.

**Mode Node :**
- `Propriétés (N)` → ouvre onglet sesr Propriétés dans RightPanel. N = `Object.keys(selectedNode.properties).length` si chargé, `?` sinon.
- `Associés (N)` → ouvre onglet sesr Associés dans RightPanel.
- `Wikipedia` → ouvre onglet Wikipedia dans RightPanel.

**Mode Aggregate :**
- `Contenu (N)` → ouvre onglet sesr Aggregate-childs dans RightPanel.

**Mode Relation :**
- `[PID] sur Wikidata` → lien externe vers `https://www.wikidata.org/wiki/Property:[PID]`
- `Filtrer par [label]` → `addFilter(createFilter(FILTER_TYPES.HAS_VALUE, ...))`

#### Couche 2 — Context Resolver (mapping statique P31-type → tags)

Fichier : `src/data/contextResolver.json`

```json
{
  "Q5": {
    "label": "être humain",
    "explorationTags": [
      { "id": "chronologie", "label": "Chronologie", "plugin": "temporal", "icon": "Calendar" },
      { "id": "localisation", "label": "Localisation", "plugin": "geographic", "icon": "MapPin" },
      { "id": "contemporains", "label": "Contemporains", "plugin": "cluster-shared", "icon": "Users" }
    ]
  },
  "Q43229": {
    "label": "organisation",
    "explorationTags": [
      { "id": "membres", "label": "Membres", "pid": "P463", "icon": "Users" },
      { "id": "siege", "label": "Siège", "plugin": "geographic", "icon": "Building" }
    ]
  },
  "Q2221906": {
    "label": "lieu géographique",
    "explorationTags": [
      { "id": "globe", "label": "Globe 3D", "plugin": "geographic", "icon": "Globe" },
      { "id": "contenu-territorial", "label": "Territoire", "plugin": "cluster-shared", "icon": "Layers" }
    ]
  }
}
```

Chaque entrée peut pointer vers :
- un `plugin` (id de plugin → ouvre le plugin dans RightPanel)
- un `pid` (PID Wikidata → ouvre sesr filtré sur ce PID)
- une `action` nommée

La résolution se fait sur `selectedNode.types[0]` (P31 principal). Si le type n'est pas dans le resolver, la couche 2 ne génère rien — pas d'erreur.

#### Couche 3 — Dynamique sur propriétés chargées

Activée uniquement si `selectedNode.properties` est non-vide.

Détection par PID :
- P569 ou P570 présents → tag `Chronologie` (si pas déjà généré par couche 2)
- P625 présent → tag `Géographique`
- P18 présent → tag `Image`
- PID à valeur unique pointant vers entité à haute cardinalité → tag `Cluster: [label du PID]`

Logique de déduplication : si un tag avec le même `plugin` ou le même `pid` a déjà été généré par couche 1 ou 2, la couche 3 ne le recrée pas. Elle peut upgrader l'état `inactif` → `actif` si les données confirment la pertinence.

#### Couche 4 — Relationnelle (si arêtes chargées)

Activée si `expandedUris.has(nodeUri)` ou `incomingExpandedUris.has(nodeUri)`.

- Si plusieurs voisins partagent un PID dominant → tag `Similaires` (shared plugin)
- Si un PID est très présent dans le voisinage (>30% des arêtes) → tag `Cluster: [label]` plus spécifique

#### Couches futures (enregistrement à la demande)

Quand ces features existent, elles s'enregistrent elles-mêmes dans le resolver :
- **Parcours** : `Parcours (N)` si des parcours passent par ce QID
- **Annotations** : `Annotations (N)` si des annotations existent sur ce QID
- **KG Embeddings** : `Similaires sémantiques` (distinct de shared structurel)

Mécanisme d'enregistrement dans `tagRegistry.js` (voir §7).

### Section Action — tags disponibles

Les actions sont définies statiquement et filtrées selon l'état de la feature :

| Tag | Condition d'affichage | Action |
|---|---|---|
| Sauvegarder seed | toujours | `saveAsSeed(nodeUri)` |
| Annoter | feature annotations active | `openAnnotationEditor(nodeUri)` |
| Ajouter à un parcours | feature parcours active | `addNodeToParcours(nodeUri)` |
| Filtrer par ce type | mode Node, types disponibles | `addFilter(TYPE, ...)` |
| Partager | toujours | `copyShareLink(nodeUri)` |

Les features inactives : tag avec état `locked` (premium) ou simplement absent selon la politique.

### Volume et scoring

Maximum affiché : **4 tags Exploration + 3 tags Action**. Au-delà, bouton `+ N` collapse le surplus.

Score Exploration = `(présence données confirmée ? +2 : 0) + (couche 1 ? +3 : couche 2 ? +2 : couche 3 ? +1 : 0) + (utilisé récemment par l'user ? +1 : 0)`

---

## 5. RightPanel

### Composant : `RightPanel.jsx`

Nouveau composant. Créé de zéro.

### Positionnement et dimensions

```
position: fixed, right-0, top-0
height: 100vh
width: 420px (ou configurable)
z-index: 40
```

Quand le RightPanel est ouvert :
- Le canvas Three.js reçoit la contrainte `width: 100vh` (carré) au lieu de `flex-1`
- Implémentation : `Gexor.jsx` lit `rightPanelOpen` depuis le store et applique la classe CSS au wrapper canvas

> **Resize canvas** : R3F gère ça nativement via un `ResizeObserver` interne qui appelle `gl.setSize()` automatiquement quand le container DOM change de dimensions. Aucun code supplémentaire nécessaire — contraindre la div wrapper suffit.

### Structure interne

```
┌─────────────────────────────────────────┐
│  HEADER (30% hauteur)                   │
│  Même contenu que InfoPanel header,     │
│  mais avec plus d'espace :              │
│  - label en grand                       │
│  - type + description visibles          │
│  - actions conservées                   │
│  - bouton [×] ferme RightPanel          │
│    et rouvre InfoPanel                  │
├─────────────────────────────────────────┤
│  BASICS/PLUGINS (70% hauteur)           │
│  ┌────────────────────────────────────┐ │
│  │ [Propriétés] [Associés] [Wiki] ... │ │  ← onglets
│  ├────────────────────────────────────┤ │
│  │                                    │ │
│  │  Contenu de l'onglet actif         │ │
│  │                                    │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Navigation onglets

Les onglets sont définis par les plugins enregistrés (voir §7). L'onglet actif au moment de l'ouverture dépend du tag cliqué dans TagsFormat — chaque tag encode l'onglet-cible dans son `action`.

Exemple : click sur tag `Propriétés` → `openRightPanel({ tab: 'properties' })`

L'onglet actif est stocké dans le store : `rightPanelActiveTab: string`.

---

## 6. Basics/Plugins — Architecture Onglets

### BasicsPluginsBar (dans InfoPanel)

Composant horizontal full-width en bas de l'InfoPanel. Icônes des onglets disponibles pour la sélection actuelle. Click → ouvre RightPanel sur l'onglet correspondant.

```jsx
// Rendu
<div className="flex items-center justify-around border-t border-slate-700/30 pt-2 pb-1">
  {availableTabs.map(tab => (
    <button key={tab.id} onClick={() => openRightPanel({ tab: tab.id })} title={tab.label}>
      <tab.Icon className="w-4 h-4" />
    </button>
  ))}
</div>
```

`availableTabs` = onglets dont `availableFor` correspond au mode courant (node/edge/aggregate).

### Onglets Basics (toujours disponibles si applicables)

#### `properties` — sesr Propriétés

- **Disponible pour** : Node
- **Contenu** : `PropertiesGrouped` (migré depuis InfoPanel) + barre de recherche/filtre inline
- **sesr** = embedded search result : la barre de filtre permet de chercher dans les propriétés chargées, ou de déclencher un fetch supplémentaire
- Bouton "Charger les propriétés sortantes" intégré ici (migré depuis l'actuel bouton Eye dans PropertiesGrouped)

#### `associates` — sesr Associés

- **Disponible pour** : Node
- **Contenu** : liste des nœuds entrants (actuellement dans le modal SearchModal/graph mode). Format cartes compactes avec type + label + relation label. Barre de filtre inline.
- Tri : primary > context-dependent > unclassified > secondary (logique actuelle de `connectedNodes`)

#### `aggregate-childs` — sesr Contenu Agrégat

- **Disponible pour** : Aggregate
- **Contenu** : `AggregateEntityList` migré + barre de filtre + bouton "Tout ajouter au graphe"

#### `wikipedia` — Wikipedia mobile embedded

Plugin à part entière (`src/plugins/wikipedia/`). Voir `INFOPANEL_PLUGINS_LIST.md`.
- **Disponible pour** : Node, Aggregate
- S'enregistre comme les autres plugins via `pluginRegistry.js`

### Onglets Plugins (voir fichier séparé `INFOPANEL_PLUGINS_LIST.md`)

Chargés dynamiquement depuis `src/plugins/`. Chaque plugin est un module qui s'enregistre dans le `PluginRegistry`.

---

## 7. Plugin System

### PluginRegistry

Fichier : `src/plugins/pluginRegistry.js`

```javascript
// Singleton registry
const registry = new Map() // pluginId → PluginDefinition

export const registerPlugin = (plugin) => {
  validatePlugin(plugin)
  registry.set(plugin.id, plugin)
}

export const getPlugin = (id) => registry.get(id)
export const getAllPlugins = () => Array.from(registry.values())
export const getPluginsForMode = (mode) =>
  getAllPlugins().filter(p => p.availableFor.includes(mode))
```

### Structure d'un plugin

```javascript
// src/plugins/[pluginId]/index.js
export default {
  // Identité
  id: 'temporal',                    // unique, snake_case
  label: 'Chronologie',
  icon: 'Calendar',                  // nom icône lucide-react
  category: 'mvct',                  // 'basics' | 'mvct'
  version: '1.0.0',

  // Disponibilité
  availableFor: ['node', 'aggregate'],   // modes InfoPanel où l'onglet est visible
  tier: 'free',                          // 'free' | 'premium' | 'marketplace'

  // Tags à injecter dans TagsFormat
  tags: [
    {
      id: 'open-temporal',
      label: 'Chronologie',
      icon: 'Calendar',
      section: 'exploration',
      // Condition d'activation : retourne TagState
      condition: ({ nodeData, properties }) => {
        const hasTemporal = properties?.P569 || properties?.P570 ||
                            properties?.P580 || properties?.P582
        return hasTemporal ? 'actif' : 'inactif'
      },
      score: ({ nodeData }) => nodeData?.types?.includes('Q5') ? 3 : 1,
    }
  ],

  // Onglet RightPanel
  tab: {
    component: () => import('./TemporalTab'),  // lazy import
    defaultQuery: null,       // query SPARQL optionnelle à lancer à l'ouverture
  },

  // Enregistrement dans TagsFormat pour features futures (optionnel)
  // Un plugin peut injecter des tags dans d'autres plugins
  injectTags: null,
}
```

### Chargement des plugins

Dans `main.jsx` (ou un fichier `src/plugins/loadPlugins.js` appelé au démarrage) :

```javascript
// Auto-découverte : importe tous les index.js dans src/plugins/
const pluginModules = import.meta.glob('./plugins/*/index.js', { eager: true })

Object.values(pluginModules).forEach(module => {
  if (module.default) registerPlugin(module.default)
})
```

Pas de marketplace pour l'instant : les plugins sont des dossiers dans `src/plugins/`. Ajouter un plugin = créer `src/plugins/[id]/index.js` + `src/plugins/[id]/[Tab].jsx`.

### TagRegistry — enregistrement par features externes

Fichier : `src/plugins/tagRegistry.js`

Permet aux features non-plugin (parcours, annotations, KG embeddings) d'injecter des tags dans TagsFormat sans coupler directement les composants.

```javascript
const tagRegistry = new Map() // nodeUri|'*' → Tag[]

export const registerTagProvider = (id, provider) => {
  // provider: ({ nodeUri, nodeData }) => Tag[]
  tagProviders.set(id, provider)
}

export const resolveTagsForNode = (nodeUri, nodeData) => {
  const tags = []
  for (const provider of tagProviders.values()) {
    tags.push(...provider({ nodeUri, nodeData }))
  }
  return tags
}
```

Exemple d'usage par le système Parcours quand il sera implémenté :
```javascript
registerTagProvider('parcours', ({ nodeUri }) => {
  const count = getParcoursByNode(nodeUri).length
  if (count === 0) return []
  return [{
    id: 'parcours',
    label: `Parcours (${count})`,
    icon: 'Route',
    section: 'exploration',
    état: 'actif',
    action: () => openRightPanel({ tab: 'parcours', nodeUri }),
    score: 2,
  }]
})
```

### Store — nouveaux champs dans `uiSlice`

À ajouter dans `createUiSlice` (`src/store/slices/uiSlice.js`). Pas de nouveau slice nécessaire.

```javascript
// Ajouts dans uiSlice ou slice dédié
rightPanelOpen: false,
rightPanelActiveTab: null,      // string | null
rightPanelNodeUri: null,        // suivi le selectedNode automatiquement

openRightPanel: ({ tab } = {}) => set({
  rightPanelOpen: true,
  rightPanelActiveTab: tab ?? state.rightPanelActiveTab ?? 'properties',
}),
closeRightPanel: () => set({ rightPanelOpen: false }),
toggleRightPanel: () => ...,
setRightPanelTab: (tab) => set({ rightPanelActiveTab: tab }),
```

---

## 8. Interactions et états mutuels

### Sélection d'un nouveau nœud quand RightPanel est ouvert

Le RightPanel suit automatiquement `selectedNode`. Le header se met à jour, l'onglet actif reste sur le même tab (comportement naturel — l'user veut voir la même info pour le nouveau nœud).

Exception : si l'onglet actif n'est pas `availableFor` le nouveau type de sélection (ex : onglet Aggregate sur un Node), revenir au premier onglet disponible.

### Fermeture de la sélection

Si `clearSelectedNode()` est appelé :
- InfoPanel se ferme
- RightPanel se ferme
- Les deux états `rightPanelOpen` et `selectedNode` reviennent à null

### Aggregate : bouton Étendre

Requiert modifications dans `graphSlice` :

```javascript
// Nouveau comportement dans expandAggregate
extendAggregate: (aggregateId) => {
  // 1. Fetch les children (comme aujourd'hui)
  // 2. Ajouter les children nodes au graphe
  // 3. Créer des edges entre aggregateNode et chaque child
  //    (edge type: 'aggregate-parent', non-traversable)
  // 4. Garder le nœud agrégat dans le graphe (ne pas le supprimer)
  // 5. Mettre à jour le layout (re-run simulation)
  // Ne PAS appeler clearSelectedNode — l'agrégat reste sélectionnable
}
```

Le nœud agrégat garde son rendu visuel (Layers icon, couleur violet) mais son label change en `[predicateLabel] (hub)` pour signaler son rôle parent.

---

## 9. Migrations depuis NodeDetailPanel

### Composants conservés (déplacés)

| Actuel | Destination |
|---|---|
| `PropertiesGrouped` | Onglet sesr `properties` dans RightPanel |
| `AggregateEntityList` | Onglet sesr `aggregate-childs` dans RightPanel |
| `RedundancyMiniSection` | Inchangé, utilisé dans `properties` tab |
| `PropertyValue` | Inchangé |
| `EntityLink` | Inchangé |
| `CollapsibleSection` | Inchangé, utilisé dans `properties` tab |

### Composants supprimés

| Actuel | Raison |
|---|---|
| `NodeSettingsSection` | Remplacé par ExplorationBar + Plugins |
| Grid Connexions/Type (bas InfoPanel) | Remplacé par TagsFormat + sesr Associés |
| Bouton "Explorer les relations" dans PropertiesGrouped | Remplacé par tag Associés |

### Composants nouveaux

| Nouveau | Fichier |
|---|---|
| `InfoPanel` | `src/components/UI/InfoPanel.jsx` |
| `ExplorationBar` | `src/components/UI/ExplorationBar.jsx` |
| `TagsFormat` | `src/components/UI/TagsFormat.jsx` |
| `BasicsPluginsBar` | `src/components/UI/BasicsPluginsBar.jsx` |
| `RightPanel` | `src/components/UI/RightPanel.jsx` |
| `PluginRegistry` | `src/plugins/pluginRegistry.js` |
| `TagRegistry` | `src/plugins/tagRegistry.js` |
| `contextResolver.json` | `src/data/contextResolver.json` |

### Modifications Gexor.jsx

- Remplacer `<NodeDetailPanel .../>` par `<InfoPanel />` + `<RightPanel />`
- Lire `rightPanelOpen` depuis le store pour conditionner la classe CSS du canvas wrapper
- Résoudre le resize Three.js : ajouter `ResizeObserver` sur le canvas container

---

## 10. Structure de fichiers

```
src/
├── components/UI/
│   ├── InfoPanel.jsx              ← nouveau (remplace NodeDetailPanel)
│   ├── ExplorationBar.jsx         ← nouveau
│   ├── TagsFormat.jsx             ← nouveau
│   ├── BasicsPluginsBar.jsx       ← nouveau
│   ├── RightPanel.jsx             ← nouveau
│   ├── NodeDetailPanel.jsx        ← à supprimer après migration
│   ├── ClickableProperty.jsx      ← inchangé
│   ├── FilterBadge.jsx            ← inchangé
│   └── ...
├── plugins/
│   ├── pluginRegistry.js          ← nouveau
│   ├── tagRegistry.js             ← nouveau
│   ├── loadPlugins.js             ← nouveau (auto-découverte)
│   ├── temporal/
│   │   ├── index.js
│   │   └── TemporalTab.jsx
│   ├── geographic/
│   │   ├── index.js
│   │   └── GeographicTab.jsx
│   ├── radial/
│   │   ├── index.js
│   │   └── RadialTab.jsx
│   └── cluster-shared/
│       ├── index.js
│       └── ClusterSharedTab.jsx
└── data/
    └── contextResolver.json       ← nouveau
```

---

*Spec vivante — à mettre à jour à chaque décision d'implémentation.*  
*Pour la liste des plugins à implémenter : voir `INFOPANEL_PLUGINS_LIST.md`*
