# Audit du Système de Détection et Création d'Edges (Gexor)
> **Dernière mise à jour :** Mars 2026 — confronté au code source réel (`wikidataClient.js`, `graphSlice.js`, `dataSlice.js`)

Le système de construction et détection d'arêtes (*edges*) dans Gexor couvre le pipeline complet de Wikidata jusqu'au rendu Three.js. Cet audit décrit l'architecture réelle (telle qu'implémentée), les limites connues, et les vecteurs d'amélioration.

---

## 1. Architecture du Pipeline d'Edges

Le flux des relations suit un pipeline à 4 étages :

### Étage 1 — Extraction (Backend Fastify · `wikidataClient.js`)

**Sortant — `fetchOutgoingNeighbors(qid, limit=50, promotedPids)`**

Stratégie **classify-first** (pas limit-first) :
1. Itère **toutes** les claims `wikibase-item` de l'entité (aucune troncature amont).
2. Classe chaque PID via `classifyPid()` → D/C/A/B/unclassified.
3. Déduplique les groupes de redondance A-axis (`_deduplicateRedundancyGroup`).
4. Applique un **budget par tier** :
   - **D (`D_always_primary`)** → 100 % inclus, toujours.
   - **C (`C_context_dependent`)** → inclus si promu par le Context Resolver ; sinon inclus comme secondary.
   - **A survivant** (après dédup redondance) → inclus.
   - **B (`B_noise_compact_ui`)** → exclu totalement.
   - **Unclassified** → limité à `min(limit, 20)` = **20 max** (pas `limit` brut).
5. Filtre les voisins dont tous les P31 appartiennent à `WIKIMEDIA_NOISE_TYPES` (7 types).
6. Batch-résout labels PID et QID (via `labelResolver.js`).

> ⚠️ Le paramètre `limit=50` ne s'applique QUE sur le budget unclassified (plafonné à 20). Les PIDs D, C et A survivants ne sont jamais coupés par ce budget.

**Entrant — voie principale : `fetchIncomingAggregates(qid, limit=100)`**

Requête SPARQL groupée `GROUP BY ?prop` avec `COUNT(DISTINCT ?item)` :
- Retourne des agrégats `{ predicate, predicateLabel, targetClasses, count }`, pas des nœuds individuels.
- Les agrégats ≤ 5 entités sont auto-expansés en nœuds réels ; les agrégats > 5 produisent un **AggregateNode** (hexagone violet, cliquable).
- Expansion à la demande via `fetchAggregateChildren(qid, pid, targetTypeQid, limit=50)`.
- Les types 100 % Wikimedia-noise sont filtrés du résultat.

**Entrant — voie directe (secondaire) : `fetchIncomingNeighbors(qid, limit=50)`**

Requête SPARQL directe `?subject ?pred wd:${qid}` — retourne des nœuds individuels. Voie secondaire sans pipeline classify-first (voir Section 2.G).

### Étage 2 — Classification & Filtrage (`propertyClassification.js` frontend + logique backend dans `wikidataClient.js`)

Le backend embarque sa propre logique de classification (lecture directe de `data/wikidata_properties.json`) **sans dépendre du module frontend**. Les deux côtés partagent la même source JSON via des chemins de code distincts.

Taxonomie des PIDs (4 axes) :
- **D** — `D_always_primary` : ~40 PIDs structurants, toujours inclus.
- **C** — `C_context_dependent` : PIDs promotionnables selon les types P31 de l'entité (via `contextRules.json`, 20 familles de types).
- **A** — `A_redundancy_groups` : groupes hiérarchiques dont un seul survivant est retenu (le plus spécifique selon `_hierarchy` et `_keep_as_primary`).
- **B** — `B_noise_compact_ui` : exclus du graphe, affichés uniquement en liste compacte.

### Étage 3 — Intégration d'État (`dataSlice.js`)

Structures clés :
- `loadedNodes` : `{ [uri]: LodNode }` — tous les nœuds chargés.
- `loadedRelations` : `{ [edgeId]: LodEdge }` — toutes les arêtes chargées.
- `incomingEdgeIds` : `Set<string>` — IDs des arêtes issues d'un fetch entrant (permet le filtrage directionnel).
- `nodeSettings` : `{ [uri]: { depth, explorationDirection, renderMode, radialStrength } }` — settings **par nœud**.
- `loadedAggregates`, `expandedUris`, `incomingExpandedUris`, `outgoingFetchedUris` — contrôle fin de l'état d'expansion.

**Direction d'exploration par nœud** : chaque nœud possède `explorationDirection` ∈ `{ incoming, outgoing, both }`. Valeur par défaut : `incoming`. Cela détermine quels voisins sont chargés ET quelles arêtes sont visibles pour ce nœud.

### Étage 4 — Résolution du Graphe (`graphSlice.js · updateGraphData`)

Pipeline en 5 sous-étapes :

**4.1 — Construction de l'adjacence (pour BFS)**

Seules les arêtes actives (`isPidActiveForGraph`) ET compatibles avec la direction du nœud (`isEdgeVisibleForDirection`) contribuent à l'adjacence qui alimente le BFS.

```javascript
const isPidActiveForGraph = (pid) => {
  if (!graphRelationPids.has(pid)) return false;
  // ... classification checks + secondaryPidOverrides + contextPromotedPids
};
const isEdgeVisibleForDirection = (rel) => {
  const isIncoming = incomingEdgeIds.has(rel.id);
  // check explorationDirection du nœud target (incoming) ou source (outgoing)
};
```

**4.2 — BFS multi-sources**

Racines BFS = union de tous les `uri` présents dans `nodeSettings` (avec `depth >= 0`). Chaque racine a sa propre profondeur max. Un nœud avec `depth=0` est visible mais ne propage pas le BFS.

**4.3 — Collecte des nœuds visibles**

Tous les nœuds atteignables par BFS dont le `LodNode` est effectivement chargé en mémoire. Les "ghost nodes" (URI connus mais non encore fetchés) sont ignorés.

**4.4 — Cross-edges (arêtes entre nœuds visibles)**

```javascript
// Ici : PAS de filtre isPidActiveForGraph — seule la visibilité des deux endpoints compte
if (!visibleNodeIds.has(rel.source) || !visibleNodeIds.has(rel.target)) return;
```

> ⚠️ Un PID désactivé par l'utilisateur ne contribue pas au BFS mais peut quand même apparaître comme arête si ses endpoints sont visibles pour d'autres raisons (voir Section 2.C).

**4.5 — Groupement des arêtes parallèles / bidirectionnelles**

```javascript
const pairKey = `${u}||${v}`; // ordre alphabétique, agnostique au sens
// → { id, source, target, relations: LodEdge[], isBidirectional, isAggregate }
```

Toutes les arêtes entre deux mêmes nœuds sont regroupées. Les arêtes individuelles sont **préservées dans `relations`** (accessibles à la UI) mais le rendu Three.js ne produit qu'une seule géométrie par paire.

---

## 2. Problèmes Identifiés

### A. Budget Unclassified Bas (20 PIDs max)

Le paramètre `limit=50` passé à `fetchOutgoingNeighbors` est trompeur : le budget effectif pour les PIDs non classifiés est `min(limit, 20) = 20`. Pour une entité riche (personnalité publique avec 100+ relations wikibase-item non classifiées), les occurrences au-delà de 20 sont silencieusement ignorées. Les PIDs D, C promus et A survivants ne sont pas affectés.

### B. Cross-Edge Invisible par Nœud Non-Atteint par BFS

Un nœud B peut être dans `loadedNodes` (chargé lors d'une expansion précédente) sans être dans `visibleNodeIds` si aucune arête active ne le relie aux racines BFS courantes. Dans ce cas, une arête A→B existante dans `loadedRelations` ne sera pas rendue même si A est visible. L'arête n'est pas "manquante" dans les données — elle est hors du périmètre BFS actuel.

### C. Incohérence `isPidActiveForGraph` entre BFS et Cross-Edges

En étape 4.1 (adjacence BFS), `isPidActiveForGraph` filtre les arêtes actives.
En étape 4.4 (cross-edges), ce filtre est **absent** — seule la visibilité des endpoints compte.

Conséquence : un PID désactivé par l'utilisateur (retiré de `graphRelationPids`) ne contribue pas à rendre ses voisins visibles via BFS, mais si ces voisins sont visibles pour une autre raison, l'arête apparaît quand même dans le graphe — contredisant l'intention de l'utilisateur.

### D. Groupement des Arêtes Masque la Multiplicité Visuelle

Entre deux nœuds U et V, N arêtes de PIDs différents (e.g. P31, P17, P131) sont compilées en un seul objet `grouped_U||V`. Le rendu Three.js ne reflète pas la multiplicité. L'information est dans `group.relations` mais inexploitée visuellement (pas de courbes de Bézier multiples, pas d'épaisseur variable).

### E. Résolution de Direction par Asymétrie de Nœuds

`isEdgeVisibleForDirection(rel)` vérifie la direction du nœud target pour une arête incoming, et la direction du nœud source pour une arête outgoing. Si les deux nœuds ont des `explorationDirection` contradictoires (l'un en `outgoing`, l'autre en `incoming`), le fallback chaîné `sourceDir || targetDir || 'incoming'` peut produire des résultats non déterministes selon l'ordre de résolution.

### F. Qualifiers Wikidata Silencieusement Ignorés

`fetchOutgoingNeighbors` itère `entity.claims` et n'exploite que `claim.mainsnak`. Les `claim.qualifiers` (contenant P580/P582 temporels, P453 rôles, P794 rangs institutionnels) sont présents dans chaque réponse `wbgetentities` mais **entièrement ignorés**. Ces données enrichiraient les arêtes sans appel réseau supplémentaire.

### G. `fetchIncomingNeighbors` sans Pipeline Classify-First

Contrairement à `fetchOutgoingNeighbors`, la voie directe `fetchIncomingNeighbors` n'applique **aucune classification ni déduplication** sur les arêtes retournées. Les edges produits n'ont pas de `tier`, `contextPromoted`, `weight`, ni `redundancyRank`. Cette asymétrie peut injecter des arêtes secondaires non filtrées si cette voie est activée.

---

## 3. Ce Qui Fonctionne Correctement

- **Classify-first** : le budget ne tronque jamais les PIDs structurants (D, C promus, A survivants).
- **Aggregate nodes** : le mécanisme incoming via agrégats est scalable et évite les SPARQL massifs sur les entités très référencées.
- **Redundancy dedup** : A-axis correctement dédupliqué selon la hiérarchie `_hierarchy` et `_keep_as_primary`.
- **Wikimedia noise** : filtrage cohérent côté backend (outgoing, aggregates, aggregate children).
- **Retry 429** : toutes les requêtes SPARQL ont un mécanisme de retry sur rate-limit.
- **Context Resolver** : 20 familles de types dans `contextRules.json`, promotion de PIDs C correctement transmise au backend via `promotedPids`.
- **Per-node settings** : depth, direction et renderMode sont réellement indépendants par nœud.
- **3-tier cache** : L1 mémoire (frontend) → L2 PostgreSQL (backend) → L3 Wikidata API, avec TTL différenciés par domaine.
- **Aggregate children** : expansion à la demande correctement isolée par PID, undo/redo supporté.

---

## 4. Recommandations Priorisées

### P0 — Corriger l'incohérence cross-edges / `isPidActiveForGraph` (§2.C)
Décider si l'étape 4.4 doit appliquer `isPidActiveForGraph` ou si c'est intentionnel (afficher toutes les arêtes entre nœuds visibles quelle que soit la config PID). Documenter ou corriger.

### P1 — Exploiter les qualifiers Wikidata (§2.F)
Enrichir `allEdgesRaw` dans `fetchOutgoingNeighbors` avec `claim.qualifiers` pour les temporels (P580/P582), rôles (P453), rangs (P794). Aucun appel réseau supplémentaire requis — les données sont déjà dans la réponse `wbgetentities`.

### P2 — Aligner `fetchIncomingNeighbors` sur le pipeline classify-first (§2.G)
Ajouter classification, tier, weight et redondance dedup aux edges retournés. Ou supprimer cette voie si `fetchIncomingAggregates` + expand couvre tous les cas d'usage.

### P3 — Rendre le budget unclassified configurable et visible (§2.A)
Extraire le plafond de 20 comme constante nommée (`UNCLASSIFIED_EDGE_BUDGET`) dans `config.js`. Envisager de le rendre dépendant du type d'entité via le Context Resolver.

### P4 — Visualisation multi-arêtes (§2.D)
Permettre le rendu de N courbes de Bézier décalées entre deux nœuds lorsque `group.relations.length > 1`, avec décalage angulaire ou épaisseur proportionnel au nombre de relations.

### P5 — Lazy cross-edge detection (endpoint dédié)
Pour les nœuds visibles dont les voisins communs ne sont pas encore chargés : ajouter un endpoint backend qui, pour une liste de QIDs visibles, retourne les paires reliées non encore connues du frontend. Permet de découvrir des cross-edges sans re-expand complet.
