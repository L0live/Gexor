# Audit — SearchModal

**Fichier** : `src/components/UI/SearchModal.jsx`
**Taille** : 1495 lignes
**Date** : 2026-04-13

---

## 1. Structure interne

Le fichier définit un composant principal `SearchModal` et **15 sous-composants internes** (non exportés) :

| Composant | Lignes (approx.) | Rôle |
|---|---|---|
| `ScopeSelector` | 18–45 | Sélecteur de scope (graph / wikidata / visible) |
| `PreviewTooltip` | 48–83 | Tooltip de preview au hover sur un résultat in-graph |
| `ResultRow` | 86–212 | Ligne de résultat avec actions hover (naviguer, ajouter, copier QID) |
| `TypeGroup` | 215–259 | Groupe de résultats collapsible par type, avec bouton "Filtrer" |
| `DisplaySelector` | 262–288 | Sélecteur de mode en mode exploration (outgoing/incoming/shared) |
| `ExplorationNodeRow` | 291–335 | Ligne de résultat en mode exploration |
| `ExplorationPredicateGroup` | 338–353 | Groupe collapsible par prédicat en mode exploration |
| `IncomingAggregateGroup` | 356–413 | Groupe agrégé incoming avec lazy-expand |
| `ExplorationResults` | 416–522 | Orchestrateur d'affichage selon le `displayMode` |
| `PreSearchBody` | 525–676 | Corps pré-recherche : historique + chips types/entités/propriétés |
| `ZeroResultsBody` | 679–713 | Écran "aucun résultat" avec suggestion de passer à Wikidata |
| `SelectionBanner` | 716–733 | Bandeau sticky pour ajout batch |
| `HasValuePopover` | 736–848 | Popover à 2 modes (existence / valeur spécifique) pour filtres HAS_VALUE |
| `SuggestedPropertiesDrawer` | 851–893 | Tiroir de propriétés fréquentes pour un type filtré |
| `TypeHierarchyPopover` | 896–916 | Wrapper popover autour de `TypeHierarchyPanel` |
| **`SearchModal`** (principal) | 919–1493 | Composant maître avec tout le câblage |

### State local

| State | Type | Rôle |
|---|---|---|
| `localQuery` | string | Query locale synchronisée avec le store |
| `selectedUris` | Set | URIs sélectionnées pour ajout batch |
| `hierarchyPopoverFilterId` | string\|null | ID du filtre dont le popover hiérarchie est ouvert |
| `focusedResultIndex` | number | Index du résultat focusé par clavier |
| `searchExecuted` | boolean | Flag indiquant si une recherche a été lancée |
| `explorationIncoming` | array | Données incoming chargées en mode exploration |
| `explorationShared` | array | Données "entités similaires" en mode exploration |
| `explorationLoading` | boolean | État de chargement des données exploration |

### Refs

| Ref | Rôle |
|---|---|
| `inputRef` | Référence vers l'`<input>` de recherche |
| `debounceRef` | Timer debounce pour search-as-you-type |
| `filterDebounceRef` | Timer debounce sur changement de filtres |
| `resultsRef` | Référence vers le conteneur de résultats scrollable |

---

## 2. Dépendances directes (imports)

**React** : `useRef, useEffect, useCallback, useState, useMemo`

**Icônes lucide-react** (17) : `Search, X, Loader, Plus, ChevronDown, ChevronRight, ExternalLink, Copy, Check, Clock, Database, Eye, Globe, MoreVertical, ArrowRight, Filter, Compass`

**Store** : `useGraphStore` depuis `../../store/useGraphStore`

**Modèle** : `createFilter, FILTER_TYPES` depuis `../../models/searchFilter`

**Composants enfants importés** :
- `FilterBadge` (`./FilterBadge`)
- `TypeHierarchyPanel` (`./TypeHierarchyPanel`)

**Services** depuis `../../services/queries/wikidata` :
- `fetchIncomingAggregates`
- `fetchAggregateChildren`
- `fetchSimilarByProperties`

---

## 3. Composants qui dépendent de SearchModal

**Import direct** :
- `src/Gexor.jsx` (ligne 16) — seul fichier qui importe et rend `SearchModal`

**Via le store** (9 fichiers interagissent avec `openSearchModal` / `closeSearchModal` / `searchModalOpen`) :
- `src/hooks/useKeyboardShortcuts.js` — raccourcis Cmd+K, Escape, Ctrl+Backspace
- `src/Gexor.jsx` — consomme `openSearchModal`
- `src/components/UI/PropertiesGrouped.jsx` — ouvre en mode exploration (Ctrl+Click)
- `src/components/UI/TagsFormat.jsx` — ouvre avec filtre PROPERTY
- `src/components/UI/ClickableProperty.jsx` — ouvre avec filtre PROPERTY ou ajoute un filtre OR
- `src/components/UI/AllPropertiesModal.jsx` — ouvre en mode exploration
- `src/components/UI/RightPanel.jsx` — ouvre avec filtre ENTITY
- `src/components/UI/InfoPanel.jsx` — ouvre avec filtre ENTITY

---

## 4. Store Zustand impliqué

### searchSlice (`src/store/slices/searchSlice.js`, 466 lignes)

**État consommé** :
- `searchModalOpen`, `searchFilters`, `searchResults`, `searchLoading`
- `searchQuery`, `searchHasMore`, `searchScope`, `searchHistory`
- `searchExplorationUri`, `searchDisplayMode`
- `taxonomyClasses`, `propertyMatrixLoaded`

**Actions consommées** :
- `openSearchModal(initialFilters?, initialScope?, explorationUri?)`
- `closeSearchModal()` — ferme et reset `explorationUri`
- `addFilter`, `removeFilter`, `clearFilters`, `toggleFilterOperator`
- `setSearchQuery`, `executeSearch(loadMore?)`
- `setSearchScope`, `setSearchDisplayMode`
- `restoreFromHistory(entry)`
- `getSuggestedProperties(typeQid, limit)`, `loadPropertyMatrix()`

### uiSlice
- `selectNode(nodeId)` — navigation vers un résultat
- `fetchOutgoingForDisplay(uri)` — charge les relations sortantes en mode exploration

### dataSlice
- `loadedNodes`, `loadedRelations`, `addNodeToGraph(uri)`
- `visibleNodeIds`, `outgoingDisplayRelations`, `outgoingFetchedUris`
- `allDiscoveredTypes`

---

## 5. Composants enfants (lus séparément)

### FilterBadge (`src/components/UI/FilterBadge.jsx`, 52 lignes)
- Props : `filter, onToggleOperator, onRemove, onShowHierarchy`
- Badge coloré avec opérateur cyclable (AND/OR/NOT), label, bouton hiérarchie (TYPE uniquement), bouton supprimer
- Pas de dépendance store directe

### TypeHierarchyPanel (`src/components/UI/TypeHierarchyPanel.jsx`, 98 lignes)
- Props : `activeTypeQid, onSelectType, lang, popoverMode`
- Lit `taxonomyClasses` et `getTaxonomyLabel` directement depuis le store
- Affiche parents / nœud courant / enfants triés par `totalInstances`
- Supporte `popoverMode` qui modifie le CSS conteneur

### ClickableProperty (`src/components/UI/ClickableProperty.jsx`, 32 lignes)
- **N'est pas importé dans SearchModal** — interagit uniquement via le store
- Crée des filtres PROPERTY via `addFilter` ou `openSearchModal`

---

## 6. Flux de données

### A — Recherche standard

```
[input change] → handleInputChange → localQuery (state local)
     ↓
useEffect [localQuery, searchScope]
     ↓ debounce 150ms
setSearchQuery(localQuery) + executeSearch()   (scope graph/visible)
     OU
[attente Enter]                                 (scope wikidata)
     ↓
executeSearch() dans searchSlice
  ├─ Pool local depuis loadedNodes (filtré si scope visible)
  ├─ scope wikidata → /api/search/filtered ou /api/search → merge avec pool local
  ├─ Application séquentielle des filtres : texte, entity, type (BFS P279), NOT type, property, HAS_VALUE
  ├─ Tri : in-graph first, puis alphabétique
  └─ Troncature 200 résultats
     ↓
searchResults → groupedResults (useMemo) → TypeGroup[] → ResultRow[]
```

### B — Ajout au graphe

```
[click "+"] → addNodeToGraph(uri)         (ajout unitaire)
[checkbox]  → toggleSelectUri → Set
[SelectionBanner] → handleBatchAdd
  └─ for (uri of selectedUris) await addNodeToGraph(uri)   (séquentiel)
```

### C — Navigation QID directe

```
[input = "Q42"] → isQidInput=true
[Enter / click] → URI Wikidata construit
  ├─ nœud existe dans loadedNodes → selectNode(uri) + ferme
  └─ sinon → addNodeToGraph(uri) → selectNode + ferme
```

### D — Mode exploration

```
[Ctrl+Click sur un résultat] → openSearchModal([], null, uri)
     ↓
searchExplorationUri présent → DisplaySelector au lieu de ScopeSelector
     ↓
displayMode === 'outgoing' → fetchOutgoingForDisplay → outgoingDisplayRelations
displayMode === 'incoming' → fetchIncomingAggregates → explorationIncoming (state local)
displayMode === 'shared'   → fetchSimilarByProperties → explorationShared (state local)
```

### E — Filtres

```
[chip / TypeGroup / HasValuePopover] → addFilter(filter)
useEffect [searchFilters] → debounce 250ms → executeSearch()
[FilterBadge MoreVertical] → TypeHierarchyPopover → handleTypeFilterReplace
```

---

## 7. Fonctionnalités — liste exhaustive

1. **Recherche textuelle** avec debounce (150ms auto, Enter pour Wikidata)
2. **3 scopes** : graphe chargé, nœuds visibles, Wikidata distant
3. **Navigation directe par QID** (pattern `Q\d+` détecté, bypass de la recherche)
4. **Filtres combinables** : TYPE, PROPERTY, ENTITY, HAS_VALUE avec opérateurs AND/OR/NOT cyclables
5. **Hiérarchie taxonomique P279** : parents/enfants dans un popover, remplacement du filtre type
6. **Propriétés fréquentes** : tiroir depuis la property matrix pour un type filtré
7. **Filtre HAS_VALUE** : popover 2 modes (existence simple ou valeur spécifique QID)
8. **Groupement des résultats par type** avec sections collapsibles
9. **Preview tooltip** au hover (300ms) pour les nœuds in-graph
10. **Actions par résultat** : naviguer (click), ajouter (+), copier QID, explorer (Ctrl+Click)
11. **Sélection batch** : checkboxes multi-résultats + bandeau sticky "Ajouter N entités"
12. **Navigation clavier** : ArrowUp/Down, Enter (naviguer), Cmd+Enter (ajouter), Escape (fermer)
13. **Raccourcis scope** : Ctrl+1/2/3 pour basculer graph/wikidata/visible
14. **Load more** : pagination pour les résultats Wikidata (par lots de 50)
15. **Historique de recherche** : 10 dernières recherches en sessionStorage, restaurables
16. **Pre-search body** : historique + chips types/entités du graphe courant (avant toute recherche)
17. **Zero results** : suggestion de passer au scope Wikidata + retrait individuel de filtres
18. **Mode exploration** : navigation dans les propriétés/relations d'un nœud spécifique
19. **Incoming aggregates** : groupes collapsibles avec lazy-expand (`fetchAggregateChildren` on-demand)
20. **Entités similaires** (shared) : recherche par propriétés communes via SPARQL multi-query
21. **Idle bar** : quand fermé, barre compacte en bas avec résumé + raccourci Cmd+K
22. **Statistiques en footer** : total résultats, nombre in-graph
23. **Indicateurs visuels** : pastille verte pour in-graph, animations staggerées, loading overlay

---

## 8. Bugs et fragilités

### 8.1 Race condition — `setTimeout(50)` dans `ZeroResultsBody`

**Localisation** : ~ligne 690

```js
setSearchScope('wikidata');
setTimeout(() => executeSearch(), 50);
```

Le scope est changé puis `executeSearch()` est appelé après 50ms arbitraires. Si la propagation Zustand n'est pas terminée au moment de l'appel, la recherche s'exécute avec l'ancien scope.

**Fix recommandé** : un `useEffect` qui réagit au changement de scope.

---

### 8.2 Performance — `connectionCount` en O(N×M) par render

**Localisation** : `ResultRow`, ~ligne 94–101

```js
const connectionCount = useMemo(() => {
  return Object.values(loadedRelations).filter(
    r => r.source === uri || r.target === uri
  ).length;
}, [loadedRelations, uri]);
```

Ce calcul est répété pour chaque `ResultRow`. Avec 10 000 relations et 200 résultats, cela représente 2 millions d'itérations par cycle de rendu.

**Fix recommandé** : précalculer `connectionsByUri` au niveau parent et passer en prop.

---

### 8.3 Absence d'`AbortController` dans les useEffect d'exploration

**Localisation** : useEffects du mode exploration (lignes ~1055–1080)

Les appels `fetchIncomingAggregates`, `fetchSimilarByProperties`, `fetchAggregateChildren` ne sont pas annulés quand le composant est démonté ou quand l'URI change. Peut causer des updates sur un composant démonté ou écraser les résultats du bon nœud avec ceux de l'ancien.

**Fix recommandé** : pattern `AbortController` + `signal` dans tous les useEffect qui font des fetch.

---

### 8.4 `handleBatchAdd` sans gestion d'erreur

**Localisation** : ~ligne 1212

```js
for (const uri of selectedUris) {
  if (!loadedNodes[uri]) await addNodeToGraph(uri);
}
```

Si un `addNodeToGraph` échoue en milieu de boucle, les entités suivantes ne sont pas ajoutées et l'utilisateur n'a aucun feedback.

**Fix recommandé** : `try/catch` par itération + compteur succès/échec affiché.

---

### 8.5 Double `onKeyDown` handler

**Localisation** : conteneur parent (~ligne 1249) ET `<input>` (~ligne 1261)

Les événements bubblent du `<input>` vers le conteneur — `handleKeyDown` est donc appelé deux fois pour chaque touche. L'impact pratique est limité (les handlers retournent tôt), mais constitue un risque pour les futurs ajouts.

**Fix recommandé** : retirer le `onKeyDown` du conteneur ou ajouter `e.stopPropagation()` dans l'input.

---

### 8.6 Trois suppressions ESLint de dépendances useEffect

**Localisations** : lignes ~1003, 1027, 1062 (`// eslint-disable-line react-hooks/exhaustive-deps`)

Ces suppressions masquent des dépendances intentionnellement omises pour éviter des boucles infinies. Fragile à la maintenance — une modification future pourrait introduire un bug silencieux.

**Fix recommandé** : utiliser `useRef` pour stabiliser les fonctions, ou reécrire les conditions explicitement.

---

### 8.7 `restoreFromHistory` avec QID — comportement inattendu

**Localisation** : `PreSearchBody`, ~lignes 569–573

Quand un historique est restauré et que la query est un QID, le code navigue directement avec `selectNode` sans restaurer les filtres. Comportement "magique" qui mélange deux fonctionnalités.

---

## 9. Dead code

| Élément | Localisation | Description |
|---|---|---|
| `propertyEntries` | ~lignes 543–545 | `useMemo` qui retourne toujours `[]`. Le bloc UI associé (lignes 628–648) ne s'affiche jamais. |
| `showAllProps` / `setShowAllProps` | ~ligne 555 | State jamais effectivement utilisé (dépend de `propertyEntries` qui est vide) |
| `MoreVertical` import | ligne 2 | Importé depuis lucide-react mais jamais rendu dans SearchModal (FilterBadge a son propre import) |
| `targetClass` prop | `IncomingAggregateGroup` ~ligne 356 | Prop déclarée et passée (~ligne 487) mais jamais lue dans le composant |

---

## 10. Synthèse architecturale

Le fichier est un **méga-composant de 1495 lignes** qui concentre deux modes fonctionnels distincts (recherche et exploration) avec 15 sous-composants inline. La logique est globalement bien compartimentée, mais la taille du fichier et la cohabitation des modes compliquent la maintenance.

### Points critiques par priorité

| Priorité | Problème | Impact |
|---|---|---|
| Haute | Race condition `setTimeout(50)` (§8.1) | Recherche avec mauvais scope possible |
| Haute | Absence d'`AbortController` (§8.3) | Updates sur composant démonté, données mélangées |
| Moyenne | Performance `connectionCount` O(N×M) (§8.2) | Lenteur visible sur grands graphes |
| Moyenne | `handleBatchAdd` sans gestion d'erreur (§8.4) | Ajouts silencieusement échoués |
| Basse | Double `onKeyDown` (§8.5) | Risque latent |
| Basse | 3 suppressions ESLint (§8.6) | Fragilité maintenance |
| Info | `propertyEntries` dead code (§9) | Feature incomplète ou abandonnée |
| Info | `MoreVertical` import inutile (§9) | Nettoyage cosmétique |
