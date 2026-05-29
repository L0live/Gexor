# InfoPanel — Liste des Plugins à Implémenter

> **Version** : 1.0  
> **Statut** : Backlog implémentation — plugins à ajouter dans `src/plugins/` au fur et à mesure  
> **Dépendance** : Lire `INFOPANEL_RIGHTPANEL_IMPLEMENTATION.md` §7 avant d'implémenter quoi que ce soit ici  
> **Convention** : chaque plugin = un dossier `src/plugins/[id]/` avec `index.js` + composant Tab

---

## Récapitulatif

| ID | Label | Catégorie | Tier | Dépendances | Complexité | Priorité |
|---|---|---|---|---|---|---|
| `temporal` | Chronologie | mvct | free | P569/P570/P580/P582 dans props | Moyenne | P1 |
| `geographic` | Globe / Carte | mvct | free | P625 / P276 / P17 dans props | Haute | P1 |
| `radial` | Mode Radial | mvct | free | nœud exploré | Faible | P1 |
| `cluster-shared` | Similaires (cluster + brume) | mvct | free | direction `shared` chargée | Haute | P2 |
| `wikipedia-embed` | Wikipedia | basics | free | label du nœud | Faible | P1 |
| `kg-embeddings` | Similaires sémantiques | mvct | premium | Qdrant/pgvector live | Très haute | P3 |
| `parcours-panel` | Parcours | basics | free/premium | système Parcours live | Haute | P3 |
| `annotations-panel` | Annotations | basics | free | système Annotations live | Moyenne | P3 |
| `source-panel` | Sources & Provenance | basics | free | endpoints Tier 2 live | Moyenne | P2 |

---

## P1 — Implémentables maintenant

---

### `radial` — Mode Radial

**Catégorie** : mvct  
**Tier** : free  
**Disponible pour** : node  

**Quoi** : Les contrôles du mode radial actuellement dans `NodeSettingsSection`. Migration directe.

**Champs migrés depuis NodeSettingsSection :**
- Toggle Force / Radial (`setNodeRenderMode`)
- Slider Force radiale (`setNodeRadialStrength`)
- Spacing mode Proportionnel / Fixe (`setNodeRadialSpacingMode`)
- Slider Rayon (`setNodeRadialSpacing`)

**Condition d'activation du tab** : nœud exploré (`settings.explored === true`)  
**Condition du tag dans TagsFormat** : `inactif` si non exploré, `actif` si exploré + renderMode === 'radial'

**Fichiers :**
```
src/plugins/radial/
├── index.js
└── RadialTab.jsx    ← copie-colle de la section radiale de NodeSettingsSection
```

**Tag injecté :**
```javascript
{
  id: 'radial-mode',
  label: 'Mode Radial',
  icon: 'Circle',
  section: 'exploration',
  condition: ({ nodeSettings, nodeUri }) => {
    const s = nodeSettings?.[nodeUri]
    if (!s?.explored) return 'inactif'
    return s.renderMode === 'radial' ? 'actif' : 'inactif'
  }
}
```

---

### `wikipedia-embed` — Wikipedia

**Catégorie** : basics  
**Tier** : free  
**Disponible pour** : node, aggregate  

**Quoi** : iframe vers la version mobile de Wikipedia pour le nœud sélectionné.

**Implémentation Tab :**
```jsx
// WikipediaTab.jsx
const WikipediaTab = ({ nodeLabel, nodeLang = 'fr' }) => {
  const url = `https://${nodeLang}.m.wikipedia.org/wiki/${encodeURIComponent(nodeLabel)}`
  return (
    <iframe
      src={url}
      className="w-full h-full border-0 rounded-b-xl"
      title={`Wikipedia: ${nodeLabel}`}
      sandbox="allow-scripts allow-same-origin"
    />
  )
}
```

**Fallback** : si Wikipedia retourne 404 ou erreur (intercepté via `onError` sur l'iframe), afficher un lien externe + message "Article non trouvé".

**Langue** : détecter depuis `navigator.language` ou préférence utilisateur. Fallback FR → EN.

**Tag injecté :**
```javascript
{
  id: 'wikipedia',
  label: 'Wikipedia',
  icon: 'BookOpen',
  section: 'exploration',
  condition: () => 'actif',   // toujours actif
  score: () => 1,
}
```

**Note CSP** : les headers `Content-Security-Policy: frame-src` du serveur doivent autoriser `*.wikipedia.org`. À ajouter dans la config Fastify.

---

### `temporal` — Chronologie

**Catégorie** : mvct  
**Tier** : free  
**Disponible pour** : node, aggregate  

**Quoi** : Vue timeline des propriétés temporelles du nœud (naissance/mort, début/fin d'activité, événements datés). Rendu dans l'onglet RightPanel, pas dans le canvas 3D — c'est une vue de données, pas un mode de visualisation du graphe entier.

> Note : le mode Temporel de GEXOR_IMPLEMENTATION.md §6 (repositionnement des nœuds sur axe temps dans le canvas 3D) est une feature séparée, plus complexe. Ce plugin-ci est l'interface de consultation temporelle d'un nœud isolé.

**Données nécessaires** : PIDs temporels dans `selectedNode.properties`
- P569 (naissance), P570 (décès)
- P580 (début), P582 (fin)
- P571 (date de fondation), P576 (date de dissolution)
- P585 (point dans le temps)
- Qualifiers temporels sur les edges si disponibles

**Rendu Tab :**
- Timeline SVG horizontale ou verticale avec les événements datés
- Chaque événement = point cliquable → sélectionne le nœud lié si applicable
- Affichage de la durée de vie / période d'activité
- Gestion des dates incertaines (Wikidata a des précisions de type "siècle", "décennie")

**Condition d'activation du tag :**
```javascript
condition: ({ properties }) => {
  const temporalPids = ['P569','P570','P580','P582','P571','P576','P585']
  const hasAny = temporalPids.some(pid => properties?.[pid])
  return hasAny ? 'actif' : 'inactif'
}
```

**Dépendance bug à corriger d'abord** : P569 et P580 écrivent tous les deux dans `temporal.start` (GEXOR_AUDIT_LOGIC_DRIFT.md — silent data overwrite). Ce bug doit être corrigé avant d'implémenter ce plugin pour avoir des données fiables.

---

### `geographic` — Globe / Carte

**Catégorie** : mvct  
**Tier** : free  
**Disponible pour** : node, aggregate  

**Quoi** : Affichage géographique du nœud sur une carte 2D ou un globe 3D minimal dans l'onglet RightPanel.

**Données nécessaires** :
- P625 (coordonnées géographiques) sur le nœud
- P276 (lieu) ou P17 (pays) si P625 absent — requête supplémentaire pour récupérer les coordonnées de l'entité liée

**Rendu Tab (deux options, à choisir) :**

Option A — Carte 2D (Leaflet.js) :
```
npm install leaflet react-leaflet
```
Simple, léger, tiles OpenStreetMap (gratuit). Marqueur sur la position. Fonctionne sans backend.

Option B — Globe 3D (Three.js réutilisé) :
Sphère avec texture carte du monde, marqueur. Plus spectaculaire mais plus lourd. Cohérent avec l'esthétique 3D de Gexor.

**Recommandation** : Option A pour commencer (simplicité), Option B comme upgrade visuel en P2.

**Condition d'activation du tag :**
```javascript
condition: ({ properties }) => {
  const geoProps = ['P625', 'P276', 'P17', 'P131', 'P159']
  return geoProps.some(pid => properties?.[pid]) ? 'actif' : 'inactif'
}
```

---

## P2 — Implémentables après stabilisation du core

---

### `cluster-shared` — Similaires (cluster + brume)

**Catégorie** : mvct  
**Tier** : free  
**Disponible pour** : node  

**Quoi** : Visualisation des entités similaires par paires de propriétés-valeurs partagées. C'est la direction `shared` actuelle, mais présentée comme un mode visuel avec configuration.

**Ce que le plugin gère :**
1. Déclencher la requête `shared` (actuellement dans `fetchAndExpandNode` avec direction `'shared'`)
2. Afficher la configuration dans l'onglet : seuil de similarité, PIDs à inclure/exclure
3. Config visuelle : intensité de la "brume" reliant les clusters, couleur des arêtes synthétiques
4. Bouton "Calculer les similaires" → déclenche la direction `shared` + re-run layout

**Rappel bug à corriger avant** : le filtre `D_always_primary` sur les PIDs dans la clause `VALUES` de la requête shared. Exclure P131, P31 pour éviter les timeouts. Voir notes architecturales.

**Rendu Tab :**
- Liste des entités similaires trouvées avec le score de similarité
- Pour chaque entité : les PIDs partagés qui ont créé la similarité
- Sliders de configuration
- Bouton pour recalculer

---

### `source-panel` — Sources & Provenance

**Catégorie** : basics  
**Tier** : free  
**Disponible pour** : node, edge  

**Quoi** : Affichage des sources Wikidata et des endpoints enrichissants pour ce nœud/edge. Point d'entrée pour le sourçage atomique prévu dans GEXOR_IMPLEMENTATION.md §8.

**Données :**
- Sources Wikidata : `claim.references` dans les statements (actuellement ignorés dans `wikidataClient.js`)
- Endpoints Tier 2 actifs pour ce nœud
- Liens vers les pages source externes

**Rendu Tab :**
- Pastilles par propriété avec source
- Liste des endpoints qui ont contribué des données
- Liens externes vers les ressources originales

**Priorité** : après l'implémentation des endpoints Tier 2.

---

## P3 — Features futures, plugins préparés

---

### `kg-embeddings` — Similaires sémantiques

**Catégorie** : mvct  
**Tier** : premium  
**Disponible pour** : node  

**Quoi** : Similaires par distance vectorielle (RotatE KG embeddings), distinct du `cluster-shared` qui est structurel.

**Dépendances** :
- Qdrant ou pgvector déployé
- Pipeline RotatE (PyKEEN) entraîné sur les sessions Gexor
- Endpoint backend `/api/similar/:qid`

**Tag injecté :**
```javascript
{
  id: 'kg-embeddings',
  label: 'Similaires sémantiques',
  icon: 'Sparkles',
  section: 'exploration',
  tier: 'premium',
  condition: () => 'actif',   // toujours affiché, tier bloque si non premium
}
```

---

### `parcours-panel` — Parcours

**Catégorie** : basics  
**Tier** : free (consultation) / premium (création)  
**Disponible pour** : node  

**Quoi** : Affichage des parcours passant par ce nœud, et création de parcours depuis ce nœud.

**Dépendances** : Système Parcours (Phase 4 de GEXOR_IMPLEMENTATION.md). Ce plugin est préparé architecturalement via `tagRegistry.js` mais le Tab restera vide (`// TODO: Phase 4`) jusqu'à l'implémentation.

**Enregistrement anticipé dans tagRegistry :**
```javascript
// À activer quand le système Parcours est live
registerTagProvider('parcours', ({ nodeUri }) => {
  const count = getParcoursByNode(nodeUri).length
  if (count === 0) return []
  return [{
    id: 'parcours',
    label: `Parcours (${count})`,
    icon: 'Route',
    section: 'exploration',
    état: 'actif',
    action: () => openRightPanel({ tab: 'parcours' }),
    score: 2,
  }]
})
```

---

### `annotations-panel` — Annotations

**Catégorie** : basics  
**Tier** : free  
**Disponible pour** : node, edge  

**Quoi** : Affichage et création d'annotations 3D ancrées à ce nœud/edge.

**Dépendances** : Système Annotations (Phase 5 de GEXOR_IMPLEMENTATION.md).

---

## Convention d'implémentation d'un plugin

Pour ajouter un plugin dans `src/plugins/[id]/` :

### 1. `index.js` — définition

```javascript
import { Calendar } from 'lucide-react'

export default {
  id: 'mon-plugin',
  label: 'Mon Plugin',
  icon: 'Calendar',           // string, pas le composant React
  category: 'mvct',           // 'basics' | 'mvct'
  version: '1.0.0',
  tier: 'free',               // 'free' | 'premium' | 'marketplace'
  availableFor: ['node'],

  tags: [
    {
      id: 'mon-tag',
      label: 'Mon Tag',
      icon: 'Calendar',
      section: 'exploration',  // 'exploration' | 'action'
      condition: ({ nodeData, properties, nodeSettings, nodeUri }) => 'actif',
      score: ({ nodeData }) => 1,
    }
  ],

  tab: {
    component: () => import('./MonPluginTab'),
  },
}
```

### 2. `MonPluginTab.jsx` — rendu

```jsx
import React from 'react'
import useGraphStore from '../../store/useGraphStore'

const MonPluginTab = () => {
  const selectedNode = useGraphStore(s => s.selectedNode)
  // ...
  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* contenu */}
    </div>
  )
}

export default MonPluginTab
```

### 3. Auto-enregistrement

Rien à faire — `loadPlugins.js` importe automatiquement tous les `src/plugins/*/index.js` via `import.meta.glob`.

---

*Pour l'architecture du système de plugins : voir `INFOPANEL_RIGHTPANEL_IMPLEMENTATION.md` §7*
