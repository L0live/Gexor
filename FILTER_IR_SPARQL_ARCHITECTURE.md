# Architecture des filtres — Filter IR & Stratégie SPARQL

## 1. La question de départ

> *"Est-ce que tous les filtres — pour la recherche, la scène du graphe, et les plugins — pourraient être traités comme des requêtes SPARQL ?"*

**Réponse courte :** Oui pour les données distantes (scope Wikidata), non directement pour les données en mémoire (scope Graphe/Visible). La solution est une **représentation intermédiaire des filtres (Filter IR)** compilable vers deux cibles selon le contexte.

---

## 2. État actuel des filtres dans Gexor

### 2.1 Côté SearchModal

Les filtres sont des objets JS dans le store (`searchFilters`). Ils sont appliqués de deux manières selon le scope :

| Scope | Comportement actuel |
|-------|-------------------|
| `graph` | Filtrage JS in-memory sur `loadedNodes` |
| `wikidata` | Fetch SPARQL + filtrage JS sur les résultats |
| `visible` | Filtrage JS in-memory sur `visibleNodeIds` |

### 2.2 Côté plugins (properties, associates)

`usePluginData` lit depuis le store Zustand (données déjà chargées). Le filtrage de `buildConnectionMap` est entièrement JS in-memory. Les fetches déclenchés (`fetchOutgoingForDisplay`, `fetchAndExpandNode`) sont eux du SPARQL côté serveur — mais la couche de filtrage présentée au plugin ne l'est pas.

### 2.3 Le problème

L'UI de filtres et les plugins opèrent dans un monde JS. Les données Wikidata vivent dans un monde SPARQL. Il n'existe pas de pont structuré entre les deux : chaque point d'entrée (SearchModal, plugin, scène) réinvente son propre filtrage.

---

## 3. Le Filter IR — Représentation intermédiaire

### 3.1 Principe

Un **Filter IR** (Intermediate Representation) est un arbre de données JSON qui décrit un filtre indépendamment de son mode d'exécution. Il peut ensuite être **compilé** vers :

- Un **fragment SPARQL** pour les requêtes distantes (scope wikidata)
- Un **prédicat JS** `(node) => boolean` pour le filtrage en mémoire (scope graph/visible)

Un seul modèle de données, deux compilateurs.

### 3.2 Structure du Filter IR

```js
// Nœud feuille — filtre atomique
{
  type: 'TYPE',           // FILTER_TYPES existants
  value: 'Q5',
  operator: 'AND'        // 'AND' | 'OR' | 'NOT'
}

// Nœud feuille — valeur de propriété
{
  type: 'HAS_VALUE',
  pid: 'P27',
  value: 'Q142',
  operator: 'AND'
}

// Nœud feuille — plage temporelle
{
  type: 'DATE_RANGE',
  min: '1800-01-01',
  max: '1900-12-31',
  operator: 'AND'
}

// Nœud composite — groupe logique
{
  type: 'GROUP',
  logic: 'AND',          // 'AND' | 'OR'
  children: [FilterIR, FilterIR, ...]
}
```

### 3.3 Compilation vers SPARQL

```js
// compileSPARQL(filter) → string (fragment WHERE)

compileSPARQL({ type: 'TYPE', value: 'Q5' })
// → "?item wdt:P31/wdt:P279* wd:Q5 ."

compileSPARQL({ type: 'HAS_VALUE', pid: 'P27', value: 'Q142' })
// → "?item wdt:P27 wd:Q142 ."

compileSPARQL({ type: 'DATE_RANGE', min: '1800-01-01', max: '1900-12-31' })
// → "?item wdt:P569 ?birth . FILTER(?birth >= '1800-01-01'^^xsd:dateTime && ?birth <= '1900-12-31'^^xsd:dateTime)"

compileSPARQL({ type: 'GROUP', logic: 'OR', children: [filterA, filterB] })
// → "{ [fragmentA] } UNION { [fragmentB] }"

compileSPARQL({ type: 'TYPE', value: 'Q13442814', operator: 'NOT' })
// → "MINUS { ?item wdt:P31 wd:Q13442814 }"
```

### 3.4 Compilation vers prédicat JS

```js
// compilePredicate(filter) → (node: LodNode) => boolean

compilePredicate({ type: 'TYPE', value: 'Q5' })
// → (node) => node.types?.includes('Q5') || node.typeLabels?.some(...)

compilePredicate({ type: 'HAS_VALUE', pid: 'P27', value: 'Q142' })
// → (node) => node.properties?.P27?.values?.some(v => v.value === WD + 'Q142')

compilePredicate({ type: 'DATE_RANGE', min: '1800-01-01', max: '1900-12-31' })
// → (node) => node.temporal?.start >= '1800-01-01' && node.temporal?.start <= '1900-12-31'

compilePredicate({ type: 'GROUP', logic: 'AND', children: [fA, fB] })
// → (node) => compilePredicate(fA)(node) && compilePredicate(fB)(node)
```

---

## 4. Ce qui ne peut PAS devenir du SPARQL

### 4.1 `visibleNodeIds`

Le filtre "scope Visible" repose sur `visibleNodeIds` — l'ensemble des nœuds actuellement affichés dans la scène Three.js. C'est une donnée de session locale. WDQS ne peut pas connaître l'état de la caméra d'un utilisateur.

**Conséquence :** Le scope `visible` sera toujours compilé vers un prédicat JS, jamais vers SPARQL.

### 4.2 Données de graphe synthétiques

Les arêtes `classification: 'shared'` sont créées localement par Gexor (ne viennent pas de Wikidata). Elles ne sont pas requêtables via SPARQL.

### 4.3 Données de session et annotations

Tout ce qui est propre à la session Gexor (parcours, annotations, nœuds ajoutés manuellement) ne vit pas dans WDQS.

---

## 5. Architecture cible

```
┌─────────────────────────────────────────────────────────────────┐
│                     COUCHE UI / PLUGINS                         │
│   SearchModal  ·  FilterBar  ·  plugin conditions              │
│                           ↓                                     │
│                    [Filter IR Builder]                          │
│              API unifiée de construction de filtres             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │   Compiler (scope ?)    │
              └────────────┬────────────┘
                           │
          ┌────────────────┴────────────────┐
          │                                 │
          ▼                                 ▼
 scope: wikidata                   scope: graph / visible
 [SPARQL Assembler]                [JS Predicate Compiler]
          │                                 │
          ▼                                 ▼
 Requête WDQS distante             filter(loadedNodes)
 (via /api/sparql)                 (in-memory, synchrone)
```

### 5.1 Flux pour le SearchModal

```
Utilisateur ajoute un filtre TYPE "être humain"
  → store: searchFilters.push({ type: 'TYPE', value: 'Q5' })
  → executeSearch() lit le scope

  Si scope === 'wikidata':
    filterIR = buildFilterIR(searchFilters)
    sparqlFragment = compileSPARQL(filterIR)
    query = assembleSPARQLQuery(searchQuery, sparqlFragment)
    → POST /api/sparql

  Si scope === 'graph' ou 'visible':
    filterIR = buildFilterIR(searchFilters)
    predicate = compilePredicate(filterIR)
    pool = scope === 'visible' ? visibleNodes : loadedNodes
    → pool.filter(predicate)
```

### 5.2 Flux pour les plugins

Les plugins qui contribuent des **critères de filtrage** (ex: un plugin futur "Filtres domaine") exposent leur filtre sous forme de Filter IR :

```js
// Dans un plugin hypothétique
filterFragment: ({ nodeData }) => ({
  type: 'HAS_VALUE',
  pid: 'P21',             // sexe
  value: 'Q6581072',      // féminin
  operator: 'AND'
})
```

Ce fragment est assemblé avec les filtres utilisateur avant compilation. Le plugin ne sait pas s'il sera compilé en SPARQL ou en prédicat.

---

## 6. Gardes contre les timeouts SPARQL

### 6.1 Le problème fondamental

WDQS a un timeout dur de **60 secondes**. Un filtre assemblé naïvement peut générer une requête qui évalue des millions de triplets. Les causes principales :

| Cause | Exemple | Cardinalité |
|-------|---------|-------------|
| PID type (P31) sans restriction de sous-classe | `?item wdt:P31 wd:Q5` | ~10M résultats |
| PID localisation (P131) | `?item wdt:P131 wd:Q90` | ~500K résultats |
| PID pays (P17) | `?item wdt:P17 wd:Q142` | ~2M résultats |
| PID sous-classe (P279) en chaîne | `?item wdt:P31/wdt:P279* wd:Q35120` | ∞ théorique |

### 6.2 Garde 1 — Blacklist de PIDs à haute cardinalité

Avant toute compilation SPARQL d'un filtre `HAS_VALUE`, le compilateur vérifie une blacklist :

```js
const HIGH_CARDINALITY_PIDS = new Set([
  'P31',   // instance de
  'P131',  // localisation administrative
  'P17',   // pays
  'P30',   // continent
  'P279',  // sous-classe de
  'P21',   // sexe/genre (si seul filtre actif)
]);

compileSPARQL(filter) {
  if (filter.type === 'HAS_VALUE' && HIGH_CARDINALITY_PIDS.has(filter.pid)) {
    // Option A : refus silencieux (filtre ignoré côté SPARQL, appliqué en JS post-fetch)
    // Option B : warning à l'UI + suggestion de combiner avec d'autres filtres
    return null; // pas de fragment SPARQL pour ce filtre
  }
  // ...
}
```

**Note :** Un filtre `P31 = Q5` (être humain) en combinaison avec `P569 = [1867]` (naissance en 1867) est acceptable — c'est la combinaison qui restreint la cardinalité. L'heuristique doit donc prendre en compte le contexte du groupe de filtres, pas juste le PID isolé. Une règle simple : P31 seul → refus ; P31 combiné avec un filtre de date ou de valeur unique → accepté.

### 6.3 Garde 2 — Budget de complexité de la requête

Avant d'envoyer la requête assemblée, estimer sa complexité :

```js
const estimateComplexity = (filterIR) => {
  // Chaque fragment SPARQL a un coût estimé
  const costs = {
    TYPE:       2,    // wdt:P31/wdt:P279* → transitive, coûteux
    HAS_VALUE:  1,    // index direct, rapide
    DATE_RANGE: 3,    // filtre sur littéral, scan large
    GROUP_OR:   4,    // UNION doublé les résultats intermédiaires
    GROUP_AND:  0,    // AND réduit, gratuit
  };
  // Somme récursive
  return computeRecursive(filterIR, costs);
};

if (estimateComplexity(filterIR) > COMPLEXITY_THRESHOLD) {
  // Timeout probable → préférer le fallback in-memory
  // ou avertir l'utilisateur
}
```

### 6.4 Garde 3 — Timeout watchdog côté serveur

Dans `/api/sparql` (route Fastify), un timeout de 50s (10s de marge avant WDQS) :

```js
// Déjà partiellement en place via defaultTimeout dans wikidataClient.js
// À standardiser : chaque requête assemblée par le Filter IR reçoit
// un timeout proportionnel à son estimateComplexity()
const timeout = Math.min(10000 + estimateComplexity(filterIR) * 2000, 50000);
```

### 6.5 Garde 4 — Dégradation gracieuse

Si la requête SPARQL assemblée timeout ou échoue :

```js
// Strategy pattern dans executeSearch()
try {
  results = await fetchSPARQL(assembledQuery);
} catch (err) {
  if (err.isTimeout) {
    // Fallback : chercher dans loadedNodes uniquement
    results = filterInMemory(loadedNodes, compilePredicate(filterIR));
    setSearchWarning('Résultats limités au graphe courant (timeout WDQS)');
  }
}
```

---

## 7. Implémentation — Fichiers à créer/modifier

### Nouveaux fichiers

```
src/services/filters/
├── filterIR.js          — types et builders de Filter IR
├── compileSPARQL.js     — compilateur Filter IR → fragment SPARQL
├── compilePredicate.js  — compilateur Filter IR → prédicat JS
└── complexityEstimator.js — estimateur de coût de requête
```

### Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `src/store/slices/searchSlice.js` | `searchFilters` devient un tableau de Filter IR (migration depuis le format actuel) |
| `src/services/queries/wikidata.js` | `searchEntities` et `fetchSimilarByProperties` acceptent un Filter IR compilé en plus du texte |
| `src/hooks/usePluginData.js` | Les plugins peuvent contribuer un Filter IR via une interface optionnelle |
| `src/plugins/*/index.js` | Champ `filterFragment` optionnel pour les plugins qui contribuent des filtres |

---

## 8. Priorités

Ce système est une **refonte en profondeur** du modèle de filtres. Il ne doit pas bloquer les features de lancement. Ordre de priorité :

**Court terme (pré-lancement) :**
- Gardes 1 et 3 dans `fetchSimilarByProperties` (déjà partiellement là)
- Garde 1 dans tout nouveau filtre SPARQL assemblé

**Moyen terme (post-lancement v1) :**
- `filterIR.js` + `compileSPARQL.js` + `compilePredicate.js`
- Migration de `searchFilters` vers Filter IR
- Compilation duale dans `executeSearch()`

**Long terme :**
- Contribution de Filter IR par les plugins
- Budget de complexité (garde 2)
- Dégradation gracieuse avec fallback in-memory (garde 4)
