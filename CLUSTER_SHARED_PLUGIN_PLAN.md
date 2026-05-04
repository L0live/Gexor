# Plan d'implémentation — Plugin `cluster-shared`

## Contexte

Le mécanisme `shared` existe déjà dans le store :
- `_fetchSharedNeighbors(uri)` dans `dataSlice.js` appelle `fetchSimilarByProperties` (SPARQL), crée des nœuds stub et des arêtes synthétiques avec `classification: 'shared'` dans `loadedRelations`.
- Les nœuds issus d'une expansion shared ont `nodeSettings[uri].isSharedNode === true`.
- `usePluginData` ne expose pas encore ces données — il gère uniquement `properties` et `incoming`.

**Ce que veut le plugin :**
- Section **"Dans le graphe"** — lecture pure du store, sans SPARQL : toutes les entités déjà chargées via shared pour ce nœud.
- Section **"Similaires"** — déclenchement de `_fetchSharedNeighbors` et affichage des résultats (comportement actuel).

---

## 1. Extension de `usePluginData`

**Fichier :** `src/hooks/usePluginData.js`

Ajouter une capability `shared` au retour du hook.

**Données nécessaires depuis le store :**
- `loadedRelations` (déjà lu)
- `loadedNodes` (déjà lu)
- `loadingUris` (déjà lu)

**Logique :**

```js
// Dans usePluginData, après buildConnectionMap

const sharedEdges = useMemo(() => {
  if (!nodeUri) return [];
  return Object.values(loadedRelations).filter(
    rel => rel.source === nodeUri && rel.classification === 'shared'
  );
}, [nodeUri, loadedRelations]);

const sharedNodes = useMemo(() =>
  sharedEdges
    .map(rel => {
      const n = loadedNodes[rel.target];
      if (!n) return null;
      return {
        uri: rel.target,
        label: n.label,
        description: n.description,
        sharedCount: rel.sharedCount ?? 1,
        isVisible: visibleNodeIds.has(rel.target),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.sharedCount - a.sharedCount),
[sharedEdges, loadedNodes, visibleNodeIds]);

const sharedIsLoaded = nodeUri ? get().incomingExpandedUris.has... // voir ci-dessous
```

**Déterminer si shared a déjà été chargé :**

Le store ne dispose pas d'un Set `sharedExpandedUris` dédié. Deux options :

**Option A (simple, sans modification du store) :** `sharedIsLoaded = sharedEdges.length > 0`. Si des arêtes synthétiques existent → considéré comme chargé.

**Option B (propre) :** Ajouter `sharedExpandedUris: new Set()` dans `dataSlice.js`, mis à jour à la fin de `_fetchSharedNeighbors`.

> **Recommandé : Option B** — permet de distinguer "0 résultats trouvés" de "jamais chargé".

**Retour final de `usePluginData` :**

```js
return {
  node,
  properties: { ... },
  incoming:   { ... },
  graph:      { ... },
  shared: {
    nodes:     sharedNodes,
    isLoaded:  sharedExpandedUris.has(nodeUri),
    isLoading: loadingUris.has(nodeUri),
    load:      () => useGraphStore.getState()._fetchSharedNeighbors(nodeUri),
  },
};
```

---

## 2. Ajout de `sharedExpandedUris` dans le store

**Fichier :** `src/store/slices/dataSlice.js`

```js
// État initial
sharedExpandedUris: new Set(),

// Dans _fetchSharedNeighbors, bloc finally (ou après set(...))
set(s => ({
  sharedExpandedUris: new Set([...s.sharedExpandedUris, uri])
}));
```

---

## 3. Structure du plugin

**Arborescence :**

```
src/plugins/cluster-shared/
├── index.js
├── ClusterSharedTab.jsx
└── InGraphSection.jsx       ← section pure store (pas de SPARQL)
```

### 3.1 `index.js`

```js
export default {
  id: 'cluster-shared',
  label: 'Similaires',
  icon: 'GitMerge',
  category: 'mvct',
  version: '1.0.0',
  availableFor: ['node'],
  tier: 'free',
  tags: [],
  tab: {
    component: () => import('./ClusterSharedTab'),
  },
};
```

### 3.2 `InGraphSection.jsx`

Composant **sans état asynchrone** : lit `shared.nodes` depuis `usePluginData`.

```
┌─ DANS LE GRAPHE (3) ─────────────────────────────────────────┐
│  [●] Marie Curie          ●●●  3 props communes              │
│  [●] Pierre Curie         ●●   2 props communes              │
│  [○] Irène Joliot-Curie   ●    1 prop commune  [+ Ajouter]   │
└──────────────────────────────────────────────────────────────┘
```

- `●` plein = nœud visible dans la scène | `○` = chargé mais hors vue
- `●●●` = score visuel du `sharedCount` (max 3 dots = 3+)
- Clic sur une ligne → `selectNode(uri)`
- Bouton `[+ Ajouter]` visible uniquement si `!isVisible` → `addNodeToGraph(uri)`
- Si `shared.isLoaded && shared.nodes.length === 0` → message "Aucun similaire dans le graphe."
- Si `!shared.isLoaded` → section masquée (elle s'affichera après le premier chargement)

### 3.3 `ClusterSharedTab.jsx`

Deux sections verticales :

```
┌─ DANS LE GRAPHE ─────────────────────────────────────────────┐
│  InGraphSection (voir 3.2)                                    │
└──────────────────────────────────────────────────────────────┘

┌─ SIMILAIRES ─────────────────────────────────────────────────┐
│  [Bouton "Calculer les similaires"]                           │
│  ── ou, si isLoading ──                                       │
│  [Spinner] Recherche en cours…                               │
│  ── ou, si isLoaded ──                                        │
│  Liste des résultats (voir §3.4)                             │
└──────────────────────────────────────────────────────────────┘
```

**Logique du bouton :**
- Texte : `"Calculer les similaires"` si `!isLoaded`
- Texte : `"Recalculer"` si `isLoaded` (déjà chargé)
- Désactivé si `isLoading`
- `onClick` → `shared.load()`

### 3.4 Section "Similaires" — liste des résultats

Reprend `shared.nodes` mais affiche **tous** les résultats (y compris ceux déjà dans le graphe), avec badge distinctif :

```
[●] Dmitri Mendeleïev    ●●●  3 props communes  [→ Dans le graphe]
[○] Niels Bohr           ●●   2 props communes  [+ Ajouter]
[○] Werner Heisenberg    ●    1 prop commune    [+ Ajouter]
```

- `[→ Dans le graphe]` : badge non-cliquable si déjà visible (`isVisible`)
- `[+ Ajouter]` : `addNodeToGraph(uri)` si `!isVisible`

---

## 4. Enregistrement du plugin

**Fichier :** `src/plugins/loadPlugins.js`

Le système `import.meta.glob` charge automatiquement les plugins via `*/index.js`. Aucune modification manuelle requise si la convention de nommage est respectée.

---

## 5. Gardes contre les timeouts SPARQL

Le timeout est un risque réel dans `fetchSimilarByProperties`. Le plan actuel le gère déjà correctement (une requête par PID, whitelist `D_always_primary`), mais deux gardes supplémentaires sont souhaitables :

### 5.1 Exclusion explicite des PIDs à haute cardinalité

Dans `fetchSimilarByProperties` (`src/services/queries/wikidata.js`), avant la boucle de construction des `pidGroups`, ajouter une blacklist explicite :

```js
const HIGH_CARDINALITY_PIDS = new Set(['P31', 'P131', 'P17', 'P30', 'P279']);

for (const [pid, prop] of Object.entries(properties || {})) {
  if (!alwaysPrimary.has(pid)) continue;
  if (HIGH_CARDINALITY_PIDS.has(pid)) continue; // ← garde explicite
  // ... reste de la logique
}
```

**Pourquoi cette garde est nécessaire :** La whitelist `D_always_primary` est construite à partir de `wikidata_properties.json`. Si un PID à haute cardinalité s'y retrouve par erreur (ou si le fichier est mis à jour), la garde explicite absorbe le risque sans dépendre de la cohérence du JSON.

### 5.2 Cap sur le nombre de PIDs simultanés

Un nœud très riche peut avoir 10+ PIDs `D_always_primary`, ce qui génère 10+ requêtes parallèles vers WDQS — risque de rate-limiting ou de comportement erratique.

```js
const MAX_PIDS = 5;
const pids = Object.keys(pidGroups).slice(0, MAX_PIDS);
```

Les PIDs les plus discriminants (ceux avec une seule valeur QID) sont en général plus utiles. Tri optionnel avant le slice : `pids.sort((a, b) => pidGroups[a].length - pidGroups[b].length)` (PIDs avec moins de valeurs = plus sélectifs = moins de résultats = moins de risque de timeout).

### 5.3 Timeout individuel par requête

Le timeout de 15000ms dans `fetchSimilarByProperties` est correct. Le `Promise.allSettled` garantit qu'une requête qui timeout ne bloque pas les autres. Pas de modification nécessaire ici.

---

## 6. Ordre d'implémentation

| Étape | Fichier | Tâche |
|-------|---------|-------|
| 1 | `dataSlice.js` | Ajouter `sharedExpandedUris` + mise à jour dans `_fetchSharedNeighbors` |
| 2 | `usePluginData.js` | Ajouter capability `shared` |
| 3 | `wikidata.js` | Ajouter garde `HIGH_CARDINALITY_PIDS` + cap `MAX_PIDS` |
| 4 | `cluster-shared/index.js` | Scaffold du plugin |
| 5 | `cluster-shared/InGraphSection.jsx` | Section store-only |
| 6 | `cluster-shared/ClusterSharedTab.jsx` | Tab complet avec les deux sections |

---

## 7. Ce qui n'est PAS dans ce plan

- Filtres sur la section "Dans le graphe" (hors scope de la demande)
- Configuration du seuil de similarité (post-launch)
- Visualisation en "brume" des clusters (post-launch)
- La section "Dans le graphe" est **read-only** : elle ne déclenche jamais de fetch SPARQL
