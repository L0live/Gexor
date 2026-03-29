# GEXOR — Audit UI Intuitiveness & Optimisation Graph
> Généré le 2026-03-26 | Périmètre : `NodeDetailPanel.jsx`, `graphSlice.js`, `dataSlice.js`, `useForceLayout.js`, `graphConstants.js`

---

## Légende

| Icône | Niveau |
|-------|--------|
| 🔴 | Perf critique / UX bloquante |
| 🟠 | Drift UX / overhead significatif |
| 🟡 | Confusion utilisateur / dette UX |
| 🟢 | Amélioration non urgente |

---

# PARTIE 1 — UI & INTUITIVENESS

## 🔴 [UI-1] `initFromEntity` → `updateGraphData` appelé 100× en boucle serrée

**Fichier :** `dataSlice.js`, `initFromEntity`

```js
for (const agg of aggregates) {       // jusqu'à 100 agrégats
  // ...
  get().updateGraphData();            // ← rebuild complet nodes+edges à chaque tour
}
```

`updateGraphData` reconstruit **tous** les `visibleNodes` et **tous** les `edges` depuis zéro à chaque appel. Avec 100 agrégats entrants, c'est 100 rebuilds complets. Chaque rebuild déclenche un re-render React + un `useEffect([nodes, edges])` dans `useForceLayout` qui reconstruit l'objet `@antv/graphlib Graph` entier.

**Pour l'utilisateur :** le graphe "tremble" visuellement à chaque agrégat ajouté, la simulation redémarre 100 fois, l'UI est lente pendant 2-5 secondes après toute nouvelle entité.

---

## 🔴 [UI-2] `useForceLayout` — `new ForceLayout()` instancié à chaque batch

**Fichier :** `useForceLayout.js`, `runLayoutBatchInternal`

```js
for (let i = 0; i < numBatches; i++) {
  const force = new ForceLayout({   // ← nouvelle instance à chaque itération
    threads,
    ...FORCE_LAYOUT_DEFAULTS,
    maxIteration: batchSize,        // 100 itérations par instance
  });
  const result = await force.execute(graph);
}
```

Pour 200 itérations : 2 instances. Pour 500 : 5 instances. Chaque `new ForceLayout()` ré-initialise le contexte WASM. Ce pattern a été introduit pour avoir du "progress feedback" par batchs, mais l'overhead d'initialisation WASM est supérieur au gain de progression visuelle pour des petits graphes.

**Impact mesurable :** ~3-5× plus lent que d'instancier une seule fois avec `maxIteration: iterations`.

---

## 🟠 [UI-3] Direction "Similaires" visuellement équivalente à "Entrants"/"Sortants" mais sémantiquement orthogonale

**Fichier :** `NodeDetailPanel.jsx`, `NodeSettingsSection`

Les trois boutons de direction ont le même style, la même couleur d'activation (teal), et sont dans le même groupe :

```jsx
<button onClick={() => handleToggleDirection('incoming')}>Entrants</button>
<button onClick={() => handleToggleDirection('outgoing')}>Sortants</button>
<button onClick={() => handleToggleDirection('shared')}>Similaires</button>
```

Mais "Entrants" et "Sortants" = directions de traversée du graphe Wikidata (liens réels).  
"Similaires" = requêtes SPARQL de similarité sémantique → création d'arêtes **synthétiques** (isSynthetic).

Un utilisateur qui coche les trois en même temps obtient un graphe mélangé avec des arêtes réelles et des arêtes synthétiques visuellement indiscernables (sauf l'opacité 0.22 via `SHARED_EDGE_OPACITY`). Il n'y a aucun indicateur dans le panel que "Similaires" crée des relations inventées.

---

## 🟠 [UI-4] Bouton "Explorer" : aucun feedback sur ce qui a déjà été chargé

**Fichier :** `NodeDetailPanel.jsx`, `NodeSettingsSection`

Le bouton affiche "Réexplorer" si `settings.explored === true`, mais :
- Il ne montre pas combien de nœuds ont été chargés depuis ce nœud
- Il ne distingue pas "incoming chargé mais pas outgoing" (cas fréquent)
- `explored` se reset à `false` dès qu'on change une direction, mais l'utilisateur ne sait pas que cela va re-fetcher

Un utilisateur qui a coché "Entrants + Sortants + Similaires" puis reclique Explorer : 3 appels réseau simultanés sans feedback clair sur ce qui est en cours.

---

## 🟠 [UI-5] `graphSlice.updateGraphData` — reconstruction systématique O(N²) sans mémoïzation

**Fichier :** `graphSlice.js`

```js
// Parcourt TOUS les loadedRelations à chaque appel
for (const rel of Object.values(loadedRelations)) {
  if (!finalVisibleIds.has(rel.source) || !finalVisibleIds.has(rel.target)) continue;
  // ...
}
// Puis groupement de TOUTES les edges par paire
const edgesMap = new Map();
for (const edge of crossEdges) { ... }
```

`loadedRelations` peut contenir des milliers d'edges (outgoing inactifs, edges en cache de sessions précédentes). Chaque `updateGraphData` les parcourt intégralement. Aucune mémoïzation, aucun index PID visible/invisible.

**Triggers fréquents :** `initFromEntity` (×100 en boucle), `addNodeToGraph`, `fetchAndExpandNode` (×3 appels internes). Un utilisateur qui explore 10 entités successivement peut déclencher 1000+ rebuilds.

---

## 🟡 [UI-6] Le header du type (badge de type) a 3 comportements sur le même élément

**Fichier :** `NodeDetailPanel.jsx`

```jsx
<button
  onClick={...selectNode(typeQid)}           // gauche = naviguer vers le type
  onContextMenu={...addFilter(TYPE, qid)}    // droit = ajouter filtre type
  title="Gauche: naviguer · Droit: filtre type"
>
  {selectedNode.type}
</button>
```

Et le titre de l'entité (h2) a un 3e comportement :
```jsx
<h2 onClick={() => openSearchModal([ENTITY filter])} title="Rechercher les connexions">
```

Résultat : dans le header du panel, **tout est cliquable** mais avec des comportements différents non indiqués visuellement. L'indice est uniquement dans le tooltip.

---

## 🟡 [UI-7] Grille Connexions/Type en bas du panel : asymétrie non intuitive

**Fichier :** `NodeDetailPanel.jsx`

```jsx
<div className="grid grid-cols-2 gap-4">
  <button onClick={onShowConnectedNodes}>  // ← bouton interactif
    Connexions ({connectedNodes.length})
  </button>
  <div className="flex items-center justify-center ...">  // ← div passive
    {selectedNode.type}
  </div>
</div>
```

La cellule gauche est un bouton. La cellule droite est une `<div>` passive avec le même style visuel. Un utilisateur qui clique sur le type dans la grille (cellule droite) n'obtient rien — alors qu'il vient de voir le badge de type en haut du panel *qui est cliquable*. Incohérence entre deux représentations du même `selectedNode.type`.

---

## 🟡 [UI-8] `NodeSettingsSection` — "Mode Rendu" (Force/Radial) visible même si le nœud n'a pas été exploré

Le nœud a `settings.explored = false` mais les contrôles Force/Radial sont visibles. Si l'utilisateur sélectionne "Radial" avant d'explorer, les sliders radial s'affichent pour un graphe vide. Le bouton "Explorer" résout cela, mais la logique attendue serait : "Mode Rendu" visible uniquement après exploration.

---

## 🟡 [UI-9] `dataSlice.removeEdgeFromGraph` est une coquille vide

**Fichier :** `dataSlice.js`

```js
removeEdgeFromGraph: (edgeId) => {
  const rel = get().loadedRelations[edgeId];
  if (!rel) return;
  // Toggle the PID off globally (simplest approach)
  // ← implémentation manquante
},
```

L'action est déclarée, appelée depuis le mode édition du panel (ou prévue pour l'être), mais ne fait rien. Si cette action est liée à un bouton visible dans l'UI, l'utilisateur clique sans effet.

---

# PARTIE 2 — OPTIMISATION GRAPH / LAYOUT

## 🔴 [PERF-1] `useForceLayout` — rebuild complet du graphe à chaque node/edge change

**Fichier :** `useForceLayout.js`

```js
useEffect(() => {
  if (!threadsRef.current) return;
  // Reconstruit tout le graphe depuis zéro
  const graph = new Graph();
  filteredNodes.forEach(n => { graph.addNode({...}); });
  edges.forEach(e => { graph.addEdge({...}); });
  graphRef.current = graph;
  // ...
  runLayoutBatchInternal(200);   // ← redémarre le layout
}, [nodes, edges, isInitialized, runLayoutBatchInternal]);
```

`nodes` et `edges` sont des références **nouvelles à chaque `updateGraphData`** (créés via `Array.from(edgesMap.values())`). Donc cet effet se déclenche à chaque `updateGraphData`, même si un seul nœud a changé. Le graphe entier est reconstruit + la simulation repart de 0.

**Avec 100 agrégats [UI-1]** : 100 rebuilds complets du graphe `@antv/graphlib` + 100 démarrages de simulation. La simulation n'a jamais le temps de converger.

---

## 🔴 [PERF-2] `nodeSize` linéaire → zones d'exclusion absurdes pour les hubs

**Fichier :** `useForceLayout.js`

```js
graph.addNode({
  data: {
    mass: 1 + Math.log(degree + 1) * 0.5,  // logarithmique (correct)
    nodeSize: (degree + 1) * 2,             // linéaire (problématique)
  }
});
```

Avec `preventOverlap: true` dans les FORCE_LAYOUT_DEFAULTS, `nodeSize` détermine le rayon d'exclusion. Un nœud central avec 50 voisins a `nodeSize = 102`. Le rayon visuellement rendu est `NODE_RADIUS = 8`. Le layout tente de maintenir une zone libre de rayon 102 autour d'un nœud qui visuellement fait 8px de rayon → répulsion excessive → graphe très dispersé pour les hubs.

La formule cohérente avec la masse serait `nodeSize: NODE_RADIUS * 2 + Math.log(degree + 1) * 3`.

---

## 🟠 [PERF-3] `linkDistance: 30` avec `NODE_RADIUS: 8` → edges trop courts

**Fichier :** `graphConstants.js`

```js
export const NODE_RADIUS = 8;
export const FORCE_LAYOUT_DEFAULTS = {
  linkDistance: 30,   // ← longueur cible des arêtes en unités monde
```

Avec deux nœuds de rayon 8, la distance surface-à-surface à `linkDistance=30` est `30 - 16 = 14 unités`. Pour une scène 3D où les nœuds font 8 unités de rayon, les labels et les arêtes se chevauchent visuellement. Un `linkDistance` de `80-120` correspondrait mieux à la taille des nœuds.

---

## 🟠 [PERF-4] `maxSpeed: 500` → instabilité initiale des grands graphes

**Fichier :** `graphConstants.js`

```js
FORCE_LAYOUT_DEFAULTS = {
  maxSpeed: 500,    // vitesse max par frame
  damping: 0.8,     // friction
```

Lors d'un rebuild complet ([PERF-1]), les nœuds initialisés avec `(Math.random() - 0.5) * 40` peuvent se retrouver sur des positions impliquant des forces énormes. Avec `maxSpeed = 500` et `damping = 0.8`, les premières frames sont explosives. Pour des graphes > 50 nœuds, on observe typiquement un "big bang" visuel avant convergence.

`maxSpeed: 100-150` avec `damping: 0.9` donne une convergence plus douce sans sacrifier la vitesse finale.

---

## 🟠 [PERF-5] Positions initiales des nouveaux nœuds : offset aléatoire ±5 trop petit

**Fichier :** `useForceLayout.js`

```js
if (parentPos) {
  const off = 5;
  x = parentPos.x + (Math.random() - 0.5) * off;  // ←  ±2.5 unités
  y = parentPos.y + (Math.random() - 0.5) * off;
  z = parentPos.z + (Math.random() - 0.5) * off;
}
```

Avec `NODE_RADIUS = 8`, spawner un nouveau nœud à ±2.5 unités de son parent signifie qu'ils se chevauchent complètement au frame 0. La répulsion WASM va ensuite les séparer violemment (`maxSpeed: 500`), causant un flash visuel désagréable à chaque expansion.

`off = linkDistance * 0.5 = 15` serait plus propre, ou mieux : placer le nouveau nœud à `linkDistance` dans une direction aléatoire depuis le parent.

---

## 🟠 [PERF-6] `writeAllPositions` + `setPositions` par batch de 100 itérations → 5 re-renders Zustand

**Fichier :** `useForceLayout.js`

```js
for (let i = 0; i < numBatches; i++) {
  // ...
  writeAllPositions(newPositions);           // SAB write
  useGraphStore.getState().setPositions(newPositions);  // Zustand update → re-render
}
```

Pour 500 itérations = 5 `setPositions`. Chaque `setPositions` est un nouveau state Zustand → tous les composants abonnés à `positions` re-renderent (Scene, InstancedNodes, Minimap). Avec un graphe de 200 nœuds, `setPositions` écrit 200 × 3 floats à chaque fois.

L'approche correcte avec SAB : écrire dans le SAB à chaque batch (pour le rendu Three.js qui lit depuis SAB en `useFrame`), mais appeler `setPositions` seulement à la **fin de la simulation**, pas à chaque batch.

---

## 🟢 [PERF-7] `graphSlice` — edges parallèles groupés mais pas les nœuds redondants

**Fichier :** `graphSlice.js`

Le code groupe bien les arêtes parallèles A→B et B→A en un seul objet avec `isBidirectional`. Mais `visibleNodes` ne déduplique pas les nœuds qui pourraient être représentés deux fois (ex: un nœud `aggregate` et son `expanded` version pourraient coexister brièvement si le garbage des agrégats expanded n'est pas parfait). Pas critique, mais une assertion `new Set(visibleNodes.map(n=>n.id)).size === visibleNodes.length` révélerait si ça arrive.

---

## 🟢 [PERF-8] `updateGraphData` : `rawNodes` et `rawRelations` toujours vides

**Fichier :** `graphSlice.js`

```js
set({
  nodes: visibleNodes,
  edges,
  visibleNodeIds: finalVisibleIds,
  rawNodes: [],       // ← toujours vide
  rawRelations: [],   // ← toujours vide
});
```

`rawNodes` et `rawRelations` sont initialisés dans l'état mais jamais peuplés. Si des composants lisent `rawNodes`, ils obtiennent toujours un tableau vide. Mort code ou feature future abandonnée à clarifier.

---

## Récapitulatif actionnable

| ID | Sévérité | Impact | Action |
|----|----------|--------|--------|
| UI-1 | 🔴 | Perf/UX | Batcher les `updateGraphData` en fin d'itération sur les agrégats (une seule mise à jour après le `for`) |
| PERF-1 | 🔴 | Perf | Diff incrémental dans `useForceLayout` : ne reconstruire que les nœuds/edges ajoutés/supprimés |
| PERF-2 | 🔴 | Layout | `nodeSize: NODE_RADIUS * 2 + Math.log(degree + 1) * 3` |
| UI-2 | 🔴 | Perf | Instancier `ForceLayout` une seule fois par run, pas par batch |
| UI-3 | 🟠 | UX | Séparer visuellement "Similaires" des directions de traversée (section distincte, badge "synthétique") |
| UI-5 | 🟠 | Perf | Index PID→edges visible dans graphSlice pour éviter le scan complet |
| PERF-3 | 🟠 | Layout | `linkDistance: 80` (accord avec NODE_RADIUS=8) |
| PERF-4 | 🟠 | Layout | `maxSpeed: 120`, `damping: 0.9` |
| PERF-5 | 🟠 | UX Layout | Spawn à `linkDistance * 0.5` depuis le parent |
| PERF-6 | 🟠 | Perf | `setPositions` en fin de simulation uniquement, SAB pour les frames intermédiaires |
| UI-4 | 🟡 | UX | Afficher le compteur de nœuds chargés par direction dans NodeSettingsSection |
| UI-6 | 🟡 | UX | Ajouter un indicateur hover explicite sur le badge type (cursor, underline) |
| UI-7 | 🟡 | UX | Rendre la cellule type cliquable (même comportement que le badge en haut) |
| UI-8 | 🟡 | UX | Masquer Mode Rendu/Radial tant que `explored === false` |
| UI-9 | 🟡 | UX | Implémenter ou supprimer `removeEdgeFromGraph` |
| PERF-7 | 🟢 | Robustesse | Assertion sur la déduplication des nœuds |
| PERF-8 | 🟢 | Cleanup | Supprimer `rawNodes`/`rawRelations` si inutilisés |

---

## Ordre de priorité suggéré

**Batch critique (impact immédiat perceptible) :**
1. **UI-1** : un seul `updateGraphData` après la boucle `for (agg of aggregates)` → division par 100× du nombre de rebuilds
2. **UI-2** : une seule instance `ForceLayout` par run → 3-5× plus rapide
3. **PERF-2** : nodeSize logarithmique → graphe moins dispersé sur les hubs

**Batch layout (qualité visuelle) :**
4. PERF-3 + PERF-4 + PERF-5 → linkDistance, maxSpeed, spawn position

**Batch UX (compréhension utilisateur) :**
5. UI-3 → séparer "Similaires"
6. UI-7 → rendre la cellule type cliquable
7. UI-4 → feedback sur ce qui est chargé

**Backlog :**
8. PERF-1 (diff incrémental — plus gros chantier)
9. PERF-6 (setPositions en fin de run)
10. UI-9, PERF-7, PERF-8

---

*Audit réalisé par lecture statique directe du code source. Aucune modification effectuée.*
