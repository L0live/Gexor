# GEXOR — Audit Logic Drift & Intuitivité
> Généré le 2026-03-25 | Périmètre : `wikidataClient.js`, `wikidata.js`, `NodeDetailPanel.jsx`, `sparql.js`
> Méthode : lecture directe du code + cross-check avec `CLAUDE.md` et `GEXOR_IMPLEMENTATION.md`

---

## Légende de sévérité

| Icône | Niveau | Signification |
|-------|--------|---------------|
| 🔴 | **Critique** | Perte de données / comportement silencieusement incorrect |
| 🟠 | **Logic Drift** | Règle qui existait pour une bonne raison mais dont le sens s'est évaporé |
| 🟡 | **Intuitivité** | Ça marche, mais personne ne comprend pourquoi ni comment |
| 🟢 | **Tech Debt** | Pas urgent, mais accumulation risquée |

---

## 🔴 CRITIQUE

### [C1] `wikidataClient.js` — Collision temporelle P569 ↔ P580 → `temporal.start`

**Fichier :** `server/services/wikidataClient.js`, fonction `fetchEntityProperties`

**Ce qui se passe :**
```js
} else if (['P569', 'P580'].includes(pid) && valType === 'time') {
  temporal.start = _parseDate(val.time);   // ← P569 ET P580 écrivent au même endroit
```

P569 = date de naissance, P580 = date de début. Ces deux propriétés sont conceptuellement distinctes mais les deux overwrite `temporal.start`. Pour une personne (Q-humain), `claims` itère dans l'ordre de l'API Wikidata — si P580 arrive après P569, la date de naissance est écrasée silencieusement par la date de début de mandat, de titre, etc.

**Impact :** Toute entité "humain ayant occupé un poste" (ex : Q7742 — Charles de Gaulle) peut afficher une date de naissance incorrecte dans le panel et dans les métadonnées temporelles du graphe.

**Règle d'origine :** Distinguer correctement les dates. La règle a dérivé quand P580 a été ajouté en copiant la ligne P569 sans vérifier le conflit.

---

### [C2] `NodeDetailPanel.jsx` — `isActive = true` hardcodé dans le mode édition

**Fichier :** `src/components/UI/NodeDetailPanel.jsx`, composant `PropertiesGrouped`

**Ce qui se passe :**
```jsx
const isActive = true; return (   // ← commentaire manquant, TODO silencieux
```

`isActive` pilote :
1. La couleur du checkbox d'ajout de relation (`bg-blue-500` si true = "déjà dans le graphe")
2. La couleur du label de propriété (`text-slate-400` vs `text-slate-600`)

Résultat : **tous les checkboxes sont toujours bleus** (apparence "coché/actif"), peu importe si la relation est réellement dans le graphe. L'utilisateur clique sur un checkbox qui a l'air actif → ça "ajoute quand même" → confusion totale.

**Règle d'origine :** `isActive` devait refléter si la propriété a des edges visibles dans le graphe actuel. La logique n'a jamais été implémentée ; la variable placeholder `true` a survécu.

---

## 🟠 LOGIC DRIFT

### [D1] `wikidataClient.js` — Les PIDs C (context-dependent) non promus sont inclus, mais le spec dit le contraire

**Fichier :** `server/services/wikidataClient.js`, `fetchOutgoingNeighbors`

**Ce que le CLAUDE.md dit :**
> Apply budget per tier : **C promoted→all**, unclassified→20

**Ce que le code fait :**
```js
if (cls === 'context-dependent') {
  if (promotedPids.has(pid)) {
    edge._contextPromoted = true;
    filteredEdges.push(edge);
  }
  // Not promoted → still include as secondary (fetchable) but mark appropriately
  else {
    filteredEdges.push(edge);   // ← inclus quand même !
  }
  continue;
}
```

Les PIDs C non promus sont inclus dans `filteredEdges` sans être marqués `_contextPromoted`. Ils vont donc en `tier: 'secondary'` dans les edges finaux. Ce n'est pas catastrophique mais c'est une règle qui a dérivé : la spec "C non promu = exclu" n'est plus vraie, et rien ne le documente.

**Conséquence :** Des edges attendus comme "absents par défaut sauf contexte" apparaissent quand même dans le graphe, avec un weight=30. La logique du Context Resolver perd de sa signification : il "promeut" quelque chose qui serait apparu de toutes façons.

---

### [D2] `wikidataClient.js` — Détection B-noise via IIFE inline dans la boucle principale

**Fichier :** `server/services/wikidataClient.js`, `fetchOutgoingNeighbors`

**Ce qui se passe :**
```js
if (cls === 'secondary' && !_getContextDependentPids().has(pid)) {
  const isNoiseBPid = (() => {
    _loadClassification();
    const bGroups = _classificationData.B_noise_compact_ui || {};
    for (const [key, group] of Object.entries(bGroups)) {
      if (key.startsWith('_')) continue;
      if ((group.properties || {})[pid]) return true;
      if (group.exemples_canoniques && group.exemples_canoniques[pid]) return true;
    }
    return false;
  })();
  if (isNoiseBPid) continue;
}
```

Ce IIFE re-parcourt `B_noise_compact_ui` en entier pour **chaque edge de la boucle**. `_getAllSecondaryPids()` existe déjà et contient tous les PIDs B — mais n'est pas utilisé ici. La fonction `classifyPid()` retourne déjà `'secondary'` pour les PIDs B, mais le code ré-implémente la détection B au lieu de faire confiance à sa propre classification.

**Règle d'origine :** La distinction A-secondary (survivor de redondance) vs B-secondary (noise) était claire dans l'architecture. Elle a dérivé quand quelqu'un a voulu "s'assurer" que seuls les vrais PIDs B étaient exclus, sans remarquer que `_getAllSecondaryPids()` les couvre déjà.

**Conséquence :** O(N_edges × N_B_properties) au lieu de O(N_edges). Pour des entités denses (> 200 claims), c'est perceptible. Et la logique de classification est maintenant dupliquée en deux endroits.

---

### [D3] `wikidata.js` + `wikidataClient.js` — Paramètre `targetTypeQid` mort dans `fetchAggregateChildren`

**Fichiers :** `src/services/queries/wikidata.js` + `server/services/wikidataClient.js`

**Frontend :**
```js
const typeParam = targetTypeQid ? `&type=${targetTypeQid}` : '';
const response = await fetch(`/api/entity/${qid}/aggregate-children?pids=${pid}${typeParam}&limit=${limit}`);
```

**Backend :**
```js
// We no longer filter by targetTypeQid since aggregates are grouped by predicate only.
// Instead we fetch all non-noise incoming links for the predicate.
const sparql = `SELECT ?item ... WHERE { ?item wdt:${pid} wd:${qid} . ... }`;
```

Le paramètre `type` est envoyé mais jamais lu côté backend. Le changement architectural (abandon du filtrage par type dans les agrégats) n'a pas été propagé à la couche appelante.

**Règle d'origine :** Les agrégats étaient filtrables par type P31. La décision de supprimer ce filtrage a été prise côté backend mais pas nettoyée côté frontend ni dans la signature de la fonction.

**Conséquence :** N'importe quel appelant futur de `fetchAggregateChildren` pourra passer `targetTypeQid` en pensant que ça filtre, alors que ça ne fait rien.

---

### [D4] `wikidataClient.js` — Incoming neighbors : aucune classification, aucun filtre bruit

**Fichier :** `server/services/wikidataClient.js`, `fetchIncomingNeighbors`

Les voisins sortants (`fetchOutgoingNeighbors`) passent par :
- Classification D/C/A/B
- Déduplication des groupes A
- Budget par tier
- Filtre Wikimedia noise

Les voisins entrants (`fetchIncomingNeighbors`) passent par :
- Filtre `ExternalId` (via SPARQL `MINUS`)
- Résolution des labels PID
- C'est tout.

La classification `classifyPid(pid)` est **appelée** pour les edges entrants (pour `classification` et `redundancyGroup`), mais elle n'est jamais utilisée pour filtrer ou déduplicer quoi que ce soit.

**Règle d'origine :** L'asymétrie était probablement intentionnelle au début (les entrants sont "subis", les sortants sont "choisis"). Mais aujourd'hui avec les agrégats qui gèrent la volumétrie entrante, cette asymétrie crée une incohérence : le graphe peut contenir des edges entrants classés `secondary` ou `B-noise` qui seraient exclus s'ils étaient sortants.

---

## 🟡 INTUITIVITÉ

### [I1] `NodeDetailPanel.jsx` — Même icône `RefreshCcw`, deux comportements opposés selon `editMode`

**Fichier :** `NodeDetailPanel.jsx`, composant `PropertiesGrouped`

```jsx
{editMode && (
  <button onClick={(e) => { e.stopPropagation(); refreshNode(nodeUri); }} title="Recharger toutes les propriétés">
    <RefreshCcw className="w-3 h-3" />
  </button>
)}
{!editMode && (
  <button onClick={(e) => { e.stopPropagation(); fetchOutgoingForDisplay(nodeUri); }} title="Charger les propriétés sortantes">
    <RefreshCcw className="w-3 h-3" />
  </button>
)}
```

- Mode normal : `fetchOutgoingForDisplay` — charge les propriétés sortantes pour affichage (pas de rechargement API)
- Mode édition : `refreshNode` — invalide le cache et refetch depuis Wikidata API

Même icône, même position, comportements radicalement différents (l'un est léger, l'autre est un hard reload réseau). L'utilisateur qui active le mode édition ne sait pas que le bouton de refresh a changé de sens.

---

### [I2] `NodeDetailPanel.jsx` — `AggregateEntityList` : bouton "Ajouter" ne s'affiche jamais

**Fichier :** `NodeDetailPanel.jsx`

```jsx
<AggregateEntityList
  aggregateId={selectedNode.aggregateId}
  selectNode={selectNode}
  // addNodeToGraph N'EST PAS PASSÉ ICI
/>
```

À l'intérieur de `AggregateEntityList` :
```jsx
{addNodeToGraph && (
  <button onClick={() => addNodeToGraph(childUri)}>
    <Plus className="w-3 h-3" />
  </button>
)}
```

La prop `addNodeToGraph` n'est pas passée → le bouton n'existe pas → impossible d'ajouter une entité d'un agrégat au graphe directement depuis la liste. La feature est codée, la prop est prévue, mais la connexion manque.

---

### [I3] `NodeDetailPanel.jsx` — Direction "Similaires" dans les settings : connexion à `fetchSimilarByProperties` non vérifiable dans ce périmètre

**Fichier :** `NodeDetailPanel.jsx`, `NodeSettingsSection`

Le toggle "Similaires" stocke `'shared'` dans `nodeSettings.explorationDirection`. Le bouton "Explorer" appelle `fetchAndExpandNode(nodeUri, { force: true })`. 

Si `dataSlice.fetchAndExpandNode` ne branche pas explicitement sur `direction.includes('shared')` → `fetchSimilarByProperties`, alors le mode Similaires est un bouton qui ne fait rien. Ce point ne peut pas être vérifié sans lire `dataSlice.js`, mais l'architecture est suffisamment indirecte pour que ce soit un vrai risque.

**À vérifier en priorité :** `dataSlice.js` → `fetchAndExpandNode` → branche `'shared'`.

---

### [I4] `NodeDetailPanel.jsx` — `isPreview` : concept appliqué à géométrie variable

Le flag `isPreview` contrôle :
- ✅ Affichage bouton "Ajouter" vs boutons navigation (header)
- ✅ Masquage de `NodeSettingsSection`
- ❌ **Non géré** pour `AggregateEntityList` (toujours visible)
- ❌ **Non géré** pour le bouton "Développer" des agrégats

Un nœud en mode preview qui serait un agrégat (cas possible ?) afficherait "Développer" sans être dans le graphe. C'est une inconsistance conceptuelle : preview = "je te montre mais tu n'es pas encore là", mais certaines actions d'exploration ignorent cet état.

---

### [I5] `wikidata.js` — `fetchSimilarByProperties` ne filtre que les QIDs, pas `v.isEntity`

**Fichier :** `src/services/queries/wikidata.js`

```js
const valueQid = v.value?.startsWith?.('http') ? v.value.replace(WD, '') : v.value;
if (valueQid && /^Q\d+$/.test(valueQid)) qids.push(valueQid);
```

Cette logique teste si la valeur ressemble à un QID par regex, plutôt que d'utiliser `v.isEntity` qui est le flag canonique de la structure `LodNode`. Si une valeur non-entity contient accidentellement un pattern `Q\d+` (peu probable mais possible dans des strings libres ou des identifiants externes), elle serait traitée comme une entité Wikidata.

La règle naturelle : utiliser `v.isEntity && /^Q\d+$/.test(valueQid)` pour être cohérent avec le modèle de données.

---

## 🟢 TECH DEBT

### [T1] `NodeDetailPanel.jsx` — Mutation directe de store via `getState()` dans un callback async

**Fichier :** `NodeDetailPanel.jsx`, composant `AggregateEntityList`

```js
const newAggregates = { ...useGraphStore.getState().loadedAggregates };
const newLoadedNodes = { ...useGraphStore.getState().loadedNodes };
// ...
useGraphStore.setState({ loadedAggregates: newAggregates, loadedNodes: newLoadedNodes });
```

Ce pattern bypasse la couche d'actions de Zustand. Il lit et écrit l'état directement depuis un composant. Ce n'est pas incorrect (Zustand l'autorise) mais cela :
1. Crée un couplage fort entre le composant et la structure interne du store
2. Empêche de tester cette logique sans monter le composant
3. Peut causer des race conditions si deux opérations async accèdent à `getState()` simultanément

Cette logique appartient à une action `expandAggregateChildren` dans `dataSlice`.

---

### [T2] `sparql.js` — Timeout max 60s mais `executeSparql` default 10s

Le schema Fastify autorise `timeout` jusqu'à 60 000ms (= limite hard WDQS). `executeSparql` default à 10 000ms. C'est cohérent en pratique (`fetchSimilarByProperties` passe explicitement 15 000ms) mais le contrat de la route ne documente pas pourquoi le maximum correspond exactement à la limite WDQS. Si quelqu'un change le max sans savoir, il casse le contrat implicite.

---

## Récapitulatif actionnable

| ID | Fichier | Sévérité | Action recommandée |
|----|---------|----------|--------------------|
| C1 | `wikidataClient.js` | 🔴 | Séparer P569 → `temporal.birthDate` et P580 → `temporal.start`. Ou au minimum : P569 ne doit pas être overwritable par P580 |
| C2 | `NodeDetailPanel.jsx` | 🔴 | Implémenter `isActive` via `visibleNodeIds` ou supprimer le checkbox et son styling conditionnel |
| D1 | `wikidataClient.js` | 🟠 | Clarifier la règle C : soit "non promus = exclus" (spec), soit "non promus = secondary" (code actuel). Documenter explicitement et aligner le CLAUDE.md |
| D2 | `wikidataClient.js` | 🟠 | Remplacer le IIFE par un `Set` pré-calculé au load de classification (`_getBNoisePids()`) |
| D3 | `wikidata.js` + `wikidataClient.js` | 🟠 | Supprimer le paramètre `targetTypeQid` de la signature frontend et de l'URL, ou le réimplémenter côté backend |
| D4 | `wikidataClient.js` | 🟠 | Décision explicite : les entrants sont-ils classifiés/filtrés ? Si oui : appliquer le même pipeline. Sinon : documenter l'asymétrie dans CLAUDE.md |
| I1 | `NodeDetailPanel.jsx` | 🟡 | Utiliser deux icônes distinctes OU afficher un tooltip différencié selon editMode |
| I2 | `NodeDetailPanel.jsx` | 🟡 | Passer `addNodeToGraph` à `AggregateEntityList` dans la vue aggregate |
| I3 | `dataSlice.js` | 🟡 | Vérifier que `fetchAndExpandNode` branch sur `direction.includes('shared')` → `fetchSimilarByProperties` |
| I4 | `NodeDetailPanel.jsx` | 🟡 | Propager le guard `isPreview` au bouton "Développer" et à `AggregateEntityList` |
| I5 | `wikidata.js` | 🟢 | Ajouter `v.isEntity &&` au filtre dans `fetchSimilarByProperties` |
| T1 | `NodeDetailPanel.jsx` | 🟢 | Déplacer la logique de `handleFetchList` vers une action `dataSlice.expandAggregateForList(aggregateId)` |
| T2 | `sparql.js` | 🟢 | Ajouter un commentaire expliquant que 60000 = limite WDQS hard timeout |

---

## Priorité d'implémentation suggérée

**Sprint 1 (avant tout) :** C1, C2 — corrections silencieuses qui faussent des données affichées
**Sprint 2 (stabilisation) :** D1, D2, D3 — nettoyage des règles orphelines
**Sprint 3 (UX) :** I1, I2, I3 — intuitivité utilisateur
**Backlog :** D4, I4, I5, T1, T2

---

*Audit réalisé par lecture statique directe du code source. Aucune modification effectuée.*
