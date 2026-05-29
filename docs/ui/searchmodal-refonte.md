# SearchModal — Plan de refonte complet

> **Basé sur** : audit SearchModal (2026-04-13), SEARCHMODAL_IDEAL.md, lecture de `searchFilter.js`, `searchSlice.js`, `SearchModal.jsx`
> **Statut** : Plan pré-implémentation

---

## Table des matières

1. [Décisions architecturales](#1-décisions-architecturales)
2. [Nouveau modèle de filtres — Query Builder](#2-nouveau-modèle-de-filtres--query-builder)
3. [Layout cible](#3-layout-cible)
4. [Plan d'implémentation par étapes](#4-plan-dimplémentation-par-étapes)
5. [Bugs de l'audit à intégrer](#5-bugs-de-laudit-à-intégrer)
6. [Fichiers touchés](#6-fichiers-touchés)

---

## 1. Décisions architecturales

### 1.1 Suppression du mode exploration dans le SearchModal

Le mode exploration (Ctrl+Click → DisplaySelector → Outgoing/Incoming/Shared) est **supprimé** du SearchModal.

**Justification :** L'ExplorationBar dans InfoPanel couvre déjà Outgoing (Propriétés) et Incoming (Associés) sur les nœuds in-graph. Le mode SearchModal exploration n'apporte de valeur unique que sur les nœuds hors-graphe — cas limite qui ne justifie pas le coût en complexité (400+ lignes, 3 sous-composants dédiés, useEffects sans AbortController, race conditions).

**Redistribution :**
- Outgoing → ExplorationBar `[Propriétés]`
- Incoming → ExplorationBar `[Associés]`
- Shared (entités similaires) → futur onglet RightPanel (plugin `cluster-shared`)

**Ce qui disparaît du SearchModal :**
- `DisplaySelector`, `ExplorationNodeRow`, `ExplorationPredicateGroup`, `IncomingAggregateGroup`, `ExplorationResults`
- `searchExplorationUri`, `searchDisplayMode` dans le store
- Imports `fetchIncomingAggregates`, `fetchAggregateChildren`, `fetchSimilarByProperties`
- Le Ctrl+Click sur les résultats (l'action reste seulement pour ouvrir en exploration via l'InfoPanel)

**Impact store :** retirer `searchExplorationUri`, `searchDisplayMode`, `setSearchDisplayMode` de `searchSlice.js`.

---

### 1.2 Scope "Visible" conservé

Déjà implémenté dans le store (`searchScope: 'graph' | 'wikidata' | 'visible'`). Le ScopeSelector 3 boutons est déjà en place dans le fichier actuel. **Aucun changement côté store.**

---

### 1.3 Query Builder remplace les badges avec opérateurs cyclables

Le système actuel (badges AND/OR/NOT cyclables) est remplacé par un **query builder progressif**. Les filtres restent dans le store sous forme de liste plate — seule la **représentation UI** change, plus la structure de métadonnées pour les groupes OR.

---

## 2. Nouveau modèle de filtres — Query Builder

### 2.1 Structure d'un filtre (évolution de `searchFilter.js`)

```js
// Avant
createFilter(type, value, label, operator, meta)
// → { id, type, operator, value, label, color, meta }

// Après — ajout de groupId pour les blocs OR
createFilter(type, value, label, operator, meta, groupId)
// → { id, type, operator, value, label, color, meta, groupId }
```

`groupId` est un identifiant partagé par tous les filtres OR d'un même groupe logique.
- Filtres `operator: 'and'` → `groupId: null` (pas de groupe)
- Filtres `operator: 'or'` → `groupId: string` (même id pour les items du même bloc OR)
- Filtres `operator: 'not'` → `groupId: null`

**Aucun changement à `executeSearch()`** — la logique de filtrage existante (AND séquentiels, OR regroupés) est déjà correcte. On ajoute juste le routage du groupId dans le regroupement OR visuel.

### 2.2 UX du Query Builder

Un bouton `+ Ajouter un filtre` sous la FilterBar ouvre un mini-sélecteur progressif inline (pas de modale) :

```
Étape 1 — Choisir le type de filtre :
  [Type d'entité]  [Propriété]  [Entité liée]

Étape 2a (Type) :
  est de type [▾ être humain ×]
  → input autocomplete dans taxonomyClasses

Étape 2b (Propriété) — deux sous-modes :
  [a la propriété ▾] [P106 occupation ×]          ← existence simple
  [P569 naissance ▾] [après ▾] [1900 ×]           ← valeur spécifique (HAS_VALUE)
  → le sous-mode "valeur" s'affiche après sélection de la propriété

Étape 2c (Entité liée) :
  [est lié à ▾] [Marie Curie ×]
  → input search dans loadedNodes

Étape 3 — Opérateur (avant confirmation) :
  ET ce critère   OU ce critère   SAUF ce critère
  (défaut : ET)
```

Chaque filtre confirmé apparaît dans la FilterBar sous forme de ligne de texte lisible :
```
  est de type   être humain           [×]
  a la propriété  nationalité          [×]
  nationalité  =  France               [×]
─── ou ──────────────────────────────────  ← fond légèrement teinté (même groupId)
  est de type   physicien              [×]
  est de type   chimiste               [×]
─────────────────────────────────────────
  sauf   être de type  personnage fictif [×]
```

### 2.3 Groupement OR — rendu visuel

Les filtres partageant un `groupId` sont encadrés d'un fond partagé `bg-amber-500/5 border border-amber-500/15 rounded-lg` avec un label `ou` à gauche. Un seul niveau de groupement — pas de groupes imbriqués.

```
┌─ ou ──────────────────────────────┐
│  est de type   physicien      [×] │
│  est de type   chimiste       [×] │
└───────────────────────────────────┘
```

Quand on ajoute un filtre OR, on propose :
- **Nouveau groupe OR** (crée un nouveau `groupId`)
- **Ajouter à ce groupe** (si un groupe OR existe déjà — sélecteur du groupe cible)

### 2.4 Résolution des labels — règle absolue

Le query builder n'affiche **jamais** un QID brut. Si le label n'est pas encore résolu au moment de l'affichage, on affiche un spinner inline `○` dans la position du label, puis on le remplace à la résolution. Les labels sont résolus depuis :
- `taxonomyClasses[qid].label` pour les types
- `propertyMatrix[pid].label` pour les propriétés
- `loadedNodes[uri].label` pour les entités liées
- Fallback : appel `GET /api/search?q={qid}&lang=fr` pour les valeurs HAS_VALUE non locales

---

## 3. Layout cible

### 3.1 Structure des zones

```
SearchModal
├── IdleBar            — fermé, hints contextuels (520px)
└── ModalOpen          — ouvert (720px, max-h: 85vh)
    ├── Header
    │   ├── [🔍 input ───────────────────────] [✕]
    │   └── [● Graphe]  [○ Wikidata]  [○ Visible]
    ├── FilterBar       — visible si filtres actifs
    │   ├── Lignes de filtres (query builder rendu)
    │   └── [+ Ajouter un filtre]  [× Tout effacer]
    ├── Body            — scroll interne
    │   ├── PreSearch   — si !searchExecuted
    │   │   ├── Historique (10 entrées sessionStorage)
    │   │   └── FilterBrowser (types + props du graphe courant)
    │   └── Results     — si searchExecuted
    │       ├── TypeGroup[] (collapsibles)
    │       │   └── ResultRow[] (hover actions)
    │       └── SelectionBanner (sticky bas, si sélection > 0)
    └── Footer
        └── hints clavier · stats (N résultats · M ●)
```

### 3.2 Ce qui disparaît du layout actuel

| Élément | Destination |
|---------|-------------|
| Sidebar FilterBrowser (colonne permanente) | → PreSearch body |
| Sidebar TypeHierarchyPanel (colonne permanente) | → popover ancré sur badge TYPE |
| DisplaySelector (outgoing/incoming/shared) | → supprimé (voir §1.1) |
| ExplorationResults | → supprimé |
| 3ème ligne header (propriétés suggérées) | → drawer sous FilterBar si TYPE actif |

### 3.3 IdleBar

```
┌──────────────────── 520px ─────────────────────┐
│  🔍  Rechercher…              47 nœuds · ⌘K    │
└────────────────────────────────────────────────┘
```
- Si filtres actifs à la fermeture : `2 filtres actifs` à la place du placeholder
- Si dernière query en session : la query en placeholder grisé
- `opacity: 40%` au repos → `100%` au hover

### 3.4 ResultRow — actions hover

```
[●] Marie Curie                    [↗] [+] [⧉]
    Physicienne polonaise · 1867–1934
```

- `↗` → naviguer + fermer (`selectNode + closeSearchModal`)
- `+` → `addNodeToGraph` sans fermer (pastille ○→● + pulse vert 500ms)
- `⧉` → copier QID dans le presse-papier
- Checkbox (si hover prolongé ou sélection déjà active) → mode sélection batch
- Ctrl+Click → **supprimé** (plus de mode exploration)

---

## 4. Plan d'implémentation par étapes

### Étape 0 — Nettoyage dead code
**Fichier :** `SearchModal.jsx`
**Durée estimée :** 30 min

- Supprimer `propertyEntries` useMemo + bloc UI associé (lignes ~543–648)
- Supprimer `showAllProps` / `setShowAllProps`
- Retirer l'import `MoreVertical` (inutilisé dans SearchModal)
- Retirer la prop `targetClass` de `IncomingAggregateGroup` (jamais lue)

---

### Étape 1 — Suppression du mode exploration
**Fichiers :** `SearchModal.jsx`, `searchSlice.js`
**Durée estimée :** 1h

**`SearchModal.jsx` :**
- Supprimer les 5 sous-composants : `DisplaySelector`, `ExplorationNodeRow`, `ExplorationPredicateGroup`, `IncomingAggregateGroup`, `ExplorationResults`
- Supprimer le state local `explorationIncoming`, `explorationShared`, `explorationLoading`
- Supprimer les useEffects liés à `searchExplorationUri`
- Supprimer les imports `fetchIncomingAggregates`, `fetchAggregateChildren`, `fetchSimilarByProperties`
- Retirer le Ctrl+Click sur `ResultRow`
- Dans le corps du modal : supprimer la branche `searchExplorationUri` — ne garder que le chemin recherche

**`searchSlice.js` :**
- Supprimer `searchExplorationUri: null`
- Supprimer `searchDisplayMode: 'outgoing'`
- Supprimer `setSearchDisplayMode`
- Dans `openSearchModal` : retirer le paramètre `explorationUri` et tout son handling

**Vérification :** s'assurer qu'aucun des 9 fichiers consommateurs n'appelle encore `openSearchModal` avec un 3ème argument.

---

### Étape 2 — Évolution du modèle de filtres
**Fichier :** `src/models/searchFilter.js`
**Durée estimée :** 30 min

- Ajouter `groupId` comme 6ème paramètre de `createFilter` (défaut `null`)
- Ajouter `createOrGroup(filters)` — helper qui génère un `groupId` partagé et affecte `operator: 'or'` à tous les filtres du tableau
- Supprimer `IN_GRAPH` de `FILTER_TYPES` et `FILTER_COLORS` (remplacé par `searchScope`)
- Ajouter la couleur OR group : variable CSS `--color-or-group-bg` et `--color-or-group-border` (pas codées en dur)

**Aucun changement à `executeSearch()`** — la logique de groupement OR par `operator` reste identique.

---

### Étape 3 — Refonte layout et suppressions sidebars
**Fichier :** `SearchModal.jsx`
**Durée estimée :** 3–4h (cœur de la refonte)

**3.1 — Restructurer le JSX racine du modal**
Passer d'une structure flex-row (body + sidebar) à une structure flex-col (Header / FilterBar / Body / Footer).

**3.2 — Header**
Ne garder que :
- `<input>` de recherche
- Bouton `✕`
- `ScopeSelector` (déjà implémenté, juste repositionner)

Supprimer du header : le bouton FilterBrowser, les propriétés suggérées.

**3.3 — FilterBar**
Nouvelle zone dédiée, visible uniquement si `searchFilters.length > 0` :
- Rendu des filtres en format texte lisible (query builder rendu — voir §2.2)
- Groupes OR avec fond partagé (voir §2.3)
- `[+ Ajouter un filtre]` en bas de la zone
- `[× Tout effacer]` à droite

**3.4 — Body PreSearch**
Quand `!searchExecuted && searchResults.length === 0` :
- Section historique (si `searchHistory.length > 0`)
- FilterBrowser (types + props du graphe courant — ex-sidebar)

**3.5 — Supprimer les sidebars**
Retirer complètement le rendu conditionnel des colonnes latérales TypeHierarchyPanel et FilterBrowser.

**3.6 — TypeHierarchyPanel → popover**
Le popover `TypeHierarchyPopover` est déjà implémenté. S'assurer qu'il est correctement ancré sur le badge TYPE dans le nouveau rendu FilterBar.

**3.7 — Drawer propriétés suggérées**
`SuggestedPropertiesDrawer` devient une zone collapsible **sous la FilterBar** (pas dans le header), visible si `activeTypeFilter && propertyMatrixLoaded`.

**Corriger §8.5 (double onKeyDown) en passant :** retirer le `onKeyDown` du conteneur parent, garder uniquement celui de l'`<input>`.

---

### Étape 4 — Query Builder UI
**Fichier :** `SearchModal.jsx`
**Durée estimée :** 3–4h

Nouveau sous-composant `FilterBuilder` (interne) :

```
État local : step ('type' | 'config'), filterType, pid, pidLabel, valueMode ('exists' | 'equals'), operator
```

**Flux :**
1. Clic `+ Ajouter un filtre` → affiche le sélecteur de type (Type / Propriété / Entité liée)
2. Sélection du type → affiche les champs de configuration (autocomplete selon le type)
3. Si Propriété : un toggle `[A la propriété] [= valeur]` sélectionne le mode HAS_VALUE
4. Sélection de l'opérateur (`ET` / `OU` / `SAUF`) avec logique de groupe OR
5. Confirmation → `addFilter(createFilter(...))` → ferme le builder

**Rendu des filtres existants dans FilterBar :**
Remplacer `FilterBadge` par un rendu inline en texte naturel :
```jsx
<span className="text-slate-400">est de type</span>
<span className="text-slate-200 font-medium">être humain</span>
<button onClick={onRemove}>×</button>
```
Garder `FilterBadge` uniquement si une action spécifique le nécessite (bouton hiérarchie TYPE → popover).

**Corriger §8.1 (race condition setTimeout) ici :** remplacer le `setTimeout(50)` de `ZeroResultsBody` par un `useEffect` réagissant au changement de `searchScope`.

---

### Étape 5 — Logique de recherche
**Fichiers :** `SearchModal.jsx`, `searchSlice.js`
**Durée estimée :** 2h

**5.1 — Search-as-you-type in-graph**
Le scope `graph` et `visible` déclenchent la recherche au debounce 150ms sans attendre Enter.
Le scope `wikidata` attend Enter (comportement actuel) — car requête réseau.

**5.2 — Debounce sur changement de filtres**
Le `useEffect [searchFilters]` existant doit passer par `filterDebounceRef` (250ms) avant d'appeler `executeSearch()`. Déjà prévu dans le plan, vérifier que c'est bien en place et non bypassé.

**5.3 — Navigation directe par QID**
Pattern `QID_PATTERN` est déjà défini (`/^Q\d+$/i`). Vérifier le flux :
- `localQuery` match QID → afficher une ligne dédiée en tête de résultats "Aller à Q42 →"
- Enter / clic → si in-graph `selectNode`, sinon `addNodeToGraph` → `selectNode` → `closeSearchModal`

**Corriger §8.3 (AbortController) ici :** les 3 useEffects d'exploration étant supprimés, le seul useEffect réseau restant est le debounce de recherche — vérifier qu'il est proprement nettoyé sur démontage.

---

### Étape 6 — Interactions résultats
**Fichier :** `SearchModal.jsx`
**Durée estimée :** 2h

**6.1 — Précalcul `connectionsByUri`**
Corriger §8.2 : déplacer le calcul `connectionCount` hors de `ResultRow`.
Dans le composant parent `SearchModal` (useMemo) :
```js
const connectionsByUri = useMemo(() => {
  const map = {};
  for (const rel of Object.values(loadedRelations)) {
    map[rel.source] = (map[rel.source] || 0) + 1;
    map[rel.target] = (map[rel.target] || 0) + 1;
  }
  return map;
}, [loadedRelations]);
```
Passer `connectionCount={connectionsByUri[result.uri] || 0}` en prop à chaque `ResultRow`.

**6.2 — handleBatchAdd avec gestion d'erreur**
Corriger §8.4 :
```js
let success = 0, failed = 0;
for (const uri of selectedUris) {
  try {
    if (!loadedNodes[uri]) await addNodeToGraph(uri);
    success++;
  } catch { failed++; }
}
// Afficher toast : "N entités ajoutées" (+ "M échecs" si failed > 0)
```

**6.3 — IdleBar contextuelle**
Mettre à jour l'IdleBar pour afficher le nombre de nœuds chargés et la dernière query si disponible dans `searchHistory[0]`.

---

### Étape 7 — Features de confort
**Fichier :** `SearchModal.jsx`
**Durée estimée :** 2h

- **Navigation clavier ↑/↓/Enter** : `focusedResultIndex` déjà en state, vérifier que le handler unique (après correction §8.5) gère correctement tous les cas
- **Preview tooltip** : `PreviewTooltip` déjà implémenté, vérifier le positionnement dans le nouveau layout sans sidebar
- **Animations** : scope change → fade cross 150ms sur le body ; badges filtres → fade-in/out scale 100ms (à ajouter dans `index.css`)

---

## 5. Bugs de l'audit à intégrer

| # | Bug | Étape | Traitement |
|---|-----|-------|------------|
| §8.1 | Race condition `setTimeout(50)` | Étape 4 | useEffect réagissant au scope |
| §8.2 | `connectionCount` O(N×M) | Étape 6 | Précalcul `connectionsByUri` au parent |
| §8.3 | Absence AbortController | Étape 5 | Supprimé avec le mode exploration ; vérifier le useEffect debounce |
| §8.4 | `handleBatchAdd` sans erreur | Étape 6 | try/catch + compteur succès/échec |
| §8.5 | Double `onKeyDown` | Étape 3 | Retirer celui du conteneur parent |
| §8.6 | 3 suppressions ESLint | Étapes 3–5 | Réécrire les useEffects au passage |
| §8.7 | `restoreFromHistory` QID | Étape 5 | Clarifier le flux, séparer les chemins |

---

## 6. Fichiers touchés

| Fichier | Type de changement |
|---------|-------------------|
| `src/models/searchFilter.js` | Ajout `groupId`, suppression `IN_GRAPH`, helper `createOrGroup` |
| `src/store/slices/searchSlice.js` | Suppression `searchExplorationUri`, `searchDisplayMode`, `setSearchDisplayMode` |
| `src/components/UI/SearchModal.jsx` | Refonte complète (layout, query builder, suppression exploration) |
| `src/components/UI/TypeHierarchyPanel.jsx` | Vérification `popoverMode` — probablement inchangé |
| `src/components/UI/FilterBadge.jsx` | Probablement supplanté par le rendu inline du query builder — à évaluer |
| `src/index.css` | Ajout des classes d'animation (fade-cross, badge-enter/exit, or-group styling) |

**Fichiers à vérifier après (pas à modifier) :**
- `src/components/UI/PropertiesGrouped.jsx` — ne plus passer `explorationUri` à `openSearchModal`
- `src/components/UI/AllPropertiesModal.jsx` — idem
- `src/hooks/useKeyboardShortcuts.js` — vérifier qu'aucun raccourci ne référence le mode exploration

---

## Ordre recommandé et points de synchronisation

```
0 → 1 → 2    (fondations — ne pas implémenter 3 avant que 1 soit stable)
         ↓
         3    (layout — le changement le plus visible, tester en isolation)
         ↓
         4    (query builder — dépend du layout stable)
         ↓
    5 + 6    (peuvent aller en parallèle)
         ↓
         7    (polish — peut s'arrêter ici sans dette)
```

Chaque étape laisse le composant dans un état fonctionnel — pas de longue branche cassée.
