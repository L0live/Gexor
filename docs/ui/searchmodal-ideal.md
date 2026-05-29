# SearchModal — Spécification idéale pour Gexor

## Table des matières

1. [Vision & principes directeurs](#1-vision--principes-directeurs)
2. [Problèmes de l'état actuel](#2-problèmes-de-létat-actuel)
3. [Architecture générale du nouveau SearchModal](#3-architecture-générale-du-nouveau-searchmodal)
4. [Layout détaillé](#4-layout-détaillé)
   - 4.1 [Idle bar](#41-idle-bar)
   - 4.2 [Modal ouvert — structure globale](#42-modal-ouvert--structure-globale)
   - 4.3 [Header](#43-header)
   - 4.4 [Zone filtres actifs](#44-zone-filtres-actifs)
   - 4.5 [Zone résultats](#45-zone-résultats)
   - 4.6 [États vides et pré-recherche](#46-états-vides-et-pré-recherche)
   - 4.7 [Footer](#47-footer)
5. [Système de filtres — révision complète](#5-système-de-filtres--révision-complète)
   - 5.1 [Scope selector (remplace le toggle "Hors graphe")](#51-scope-selector-remplace-le-toggle-hors-graphe)
   - 5.2 [Types de filtres conservés et modifiés](#52-types-de-filtres-conservés-et-modifiés)
   - 5.3 [HAS_VALUE — accès UI](#53-has_value--accès-ui)
   - 5.4 [Debounce et auto-trigger](#54-debounce-et-auto-trigger)
6. [TypeHierarchyPanel — repositionnement](#6-typehierarchypanel--repositionnement)
7. [FilterBrowser — repositionnement](#7-filterbrowser--repositionnement)
8. [Résultats — nouvelles interactions](#8-résultats--nouvelles-interactions)
   - 8.1 [Actions secondaires par résultat](#81-actions-secondaires-par-résultat)
   - 8.2 [Ajout groupé au graphe](#82-ajout-groupé-au-graphe)
   - 8.3 [Preview au survol](#83-preview-au-survol)
   - 8.4 [Groupement et tri](#84-groupement-et-tri)
9. [Features nouvelles](#9-features-nouvelles)
   - 9.1 [Navigation directe par QID](#91-navigation-directe-par-qid)
   - 9.2 [Search-as-you-type in-graph](#92-search-as-you-type-in-graph)
   - 9.3 [Historique de recherche](#93-historique-de-recherche)
   - 9.4 [Propriétés suggérées — accès revu](#94-propriétés-suggérées--accès-revu)
10. [Raccourcis clavier — révision](#10-raccourcis-clavier--révision)
11. [Animations & transitions](#11-animations--transitions)
12. [État du store — évolutions](#12-état-du-store--évolutions)
13. [Évolutions backend](#13-évolutions-backend)
14. [Priorités d'implémentation](#14-priorités-dimplémentation)

---

## 1. Vision & principes directeurs

Le SearchModal est **la surface d'entrée principale dans le graphe**. C'est le seul endroit où l'utilisateur peut initier une exploration depuis une intention verbale ou conceptuelle. Tout le reste de l'UI répond à ce qui est *déjà* dans le graphe — le SearchModal est le seul qui répond à ce qui n'y est *pas encore*.

Cette position centrale impose trois principes :

**Principe 1 — Progressivité**
L'interface doit être utilisable sans configuration. Taper un nom et appuyer sur Entrée doit fonctionner en 2 secondes. Les filtres avancés, la hiérarchie taxonomique, les propriétés suggérées — tout cela doit être accessible mais non imposé. Le chemin minimal reste minimal.

**Principe 2 — Contexte permanent**
À tout moment, l'utilisateur doit savoir *où il cherche* (scope), *comment il filtre* (filtres actifs), et *ce qu'il a trouvé* (résultats + stats). Ces trois dimensions doivent être simultanément lisibles sans scroll ni interaction.

**Principe 3 — Continuité avec le graphe**
Le SearchModal n'est pas une interface autonome — c'est une extension du graphe. Il doit afficher ce qui est in-graph vs hors-graphe, permettre d'ajouter au graphe directement depuis les résultats, et s'ouvrir pré-configuré depuis le contexte (ex: depuis NodeDetailPanel).

---

## 2. Problèmes de l'état actuel

### UI

| Problème | Manifestation | Impact |
|----------|--------------|--------|
| Header surchargé | Input + submit + toggle + FilterBrowser button + close sur 1 ligne | Lisibilité faible, confusion sur les priorités |
| Trois colonnes dans 700px | FilterBrowser + TypeHierarchy + Results côte à côte | Zone résultats étranglée, sidebars non découvertes |
| "Hors graphe" sémantiquement inversé | Le label du toggle décrit l'état désactivé | Confusion sur ce que le bouton fait |
| Propriétés suggérées dans le header | Occupe une 3ème ligne du header avec des boutons horizontaux | Crée un header à 3 lignes de densité maximale |
| Idle bar neutre | Aucune information contextuelle visible à l'état fermé | Opportunité manquée |

### Système

| Problème | Description | Impact |
|----------|-------------|--------|
| Pas de search-as-you-type local | La recherche in-graph nécessite Enter | Friction sur le cas le plus rapide |
| Auto-trigger sans debounce | `useEffect` relance `executeSearch()` à chaque changement de filtre | N requêtes si N filtres ajoutés rapidement |
| Filtre ENTITY borgne | Vérifie seulement `loadedRelations` — sans vision hors-graphe | Sémantique tronquée non exposée |
| HAS_VALUE inaccessible | Existe dans le modèle, aucun chemin UI | Feature de puissance invisible |
| TypeHierarchy découplée | Apparaît quand un filtre TYPE est actif — remplacement silencieux du filtre | Comportement non intuitif |

### Features manquantes

- Navigation directe par QID (`Q42` → entité sans passer par la recherche textuelle)
- Historique des recherches récentes
- Ajout groupé au graphe (sélection multiple)
- Preview au survol sur les résultats in-graph
- Actions secondaires sur chaque résultat (ajouter, copier QID, voir connexions)
- Scope "visible uniquement" (`visibleNodeIds` est dans le store mais non utilisé)

---

## 3. Architecture générale du nouveau SearchModal

Le SearchModal reste un composant unique avec ses sous-composants internes, mais sa structure logique est réorganisée en **4 zones distinctes** avec des responsabilités claires :

```
SearchModal
├── IdleBar            — état fermé, hints contextuels
└── ModalOpen
    ├── Header         — input + scope selector + actions globales
    ├── FilterBar      — filtres actifs (badges) + clear all
    ├── Body
    │   ├── PreSearch  — état vide avant toute recherche (historique + FilterBrowser)
    │   └── Results    — groupedResults avec actions par résultat
    └── Footer         — hints clavier + stats
```

Les sidebars (**TypeHierarchyPanel** et **FilterBrowser**) ne sont **plus des colonnes permanentes**. Elles deviennent :
- TypeHierarchyPanel → **popover contextuel** déclenché depuis le badge du filtre TYPE
- FilterBrowser → **section dans l'état pré-recherche** (body quand aucun résultat ni query)

---

## 4. Layout détaillé

### 4.1 Idle bar

```
┌─────────────────────────────────── 520px ────────────────────────────────────┐
│  🔍  Rechercher une entité…                        47 nœuds · ⌘K             │
└──────────────────────────────────────────────────────────────────────────────┘
         opacity: 40% au repos → 100% au hover
```

**Changements par rapport à l'actuel :**
- Largeur étendue de 450px → 520px pour afficher le contexte
- Côté droit : nombre de nœuds chargés (`loadedNodes.size`) + shortcut ⌘K
- Si filtres actifs au moment de la fermeture : afficher "2 filtres actifs" à la place du placeholder
- Si dernière recherche en session : afficher la query précédente en placeholder grisé

```
│  🔍  "Marie Curie" (dernière recherche)         47 nœuds · ⌘K              │
│  🔍  2 filtres actifs                           47 nœuds · ⌘K              │
```

---

### 4.2 Modal ouvert — structure globale

```
┌──────────────────────────────── 720px ──── max-h: 85vh ────────────────────┐
│  HEADER                                                              16px pad│
│  [🔍 input ─────────────────────────────────────────────────] [✕]          │
│  [● Graphe]  [○ Wikidata]  [○ Visible]                                      │
├────────────────────────────────────────────────────────────────────────────│
│  FILTER BAR (si filtres actifs)                                             │
│  [AND être humain ✕] [OR France ✕]  ···  [× Tout effacer]                  │
├────────────────────────────────────────────────────────────────────────────│
│  BODY                                                    scroll interne     │
│                                                                             │
│  [PRÉ-RECHERCHE : historique + FilterBrowser]                               │
│  ou                                                                         │
│  [RÉSULTATS groupés par type avec actions]                                  │
│                                                                             │
├────────────────────────────────────────────────────────────────────────────│
│  FOOTER                                                                     │
│  ↩ naviguer · ⌘↩ ajouter au graphe · Esc fermer    12 résultats · 5 ●     │
└────────────────────────────────────────────────────────────────────────────┘
```

**Dimensions :**
- Largeur : 720px (vs 700px actuel — légère augmentation pour respiration)
- Max-height : 85vh (vs 80vh — on récupère de l'espace maintenant que les sidebars sont supprimées)
- Border-radius top : 16px (inchangé)
- Background : `slate-900/97` (légèrement plus opaque pour lisibilité)

---

### 4.3 Header

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🔍  [input placeholder contextuel ─────────────────────────] [✕]      │
│                                                                         │
│  Scope :  ┌─────────┐  ┌──────────┐  ┌──────────┐                     │
│           │ ● Graphe│  │○ Wikidata│  │○ Visible │                     │
│           └─────────┘  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Input :**
- Placeholder adaptatif :
  - Mode Graphe : `"Filtrer dans les 47 nœuds chargés…"`
  - Mode Wikidata : `"Rechercher dans Wikidata…"`
  - Mode Visible : `"Filtrer les 12 nœuds visibles…"`
- Détection QID automatique : si l'input correspond à `/^Q\d+$/`, afficher un hint inline sous l'input : `→ Naviguer directement vers Q42` (voir §9.1)
- Pas de bouton "Search" explicite — le scope + l'input suffisent, Enter lance

**Scope selector :**
- 3 options pill-style avec icônes :
  - `● Graphe` — nœuds dans `loadedNodes` (comportement in-graph actuel)
  - `○ Wikidata` — recherche distante (comportement "Hors graphe" actuel)
  - `○ Visible` — nœuds dans `visibleNodeIds` uniquement
- Le scope actif est persistent en session (mémorisé dans le store)
- Quand "Visible" est actif et que aucun nœud n'est visible : griser l'option + tooltip "Aucun nœud visible actuellement"

**Bouton close [✕] :**
- Aligné à droite, en dehors de l'input
- Raccourci Esc — identique à aujourd'hui

**Ce qui disparaît du header :**
- Bouton "Hors graphe" → remplacé par le scope selector
- Bouton "⚙ Filter" (FilterBrowser) → FilterBrowser déplacé dans l'état pré-recherche
- Ligne stats + propriétés suggérées → déplacée dans le footer (stats) et en drawer (propriétés)

---

### 4.4 Zone filtres actifs

Affichée uniquement si `searchFilters.length > 0`. Séparée du header par un divider.

```
│  [AND être humain ✕] [OR France ✕] [NOT article ✕]    [× Tout effacer]   │
```

**Comportements inchangés :**
- FilterBadge : clic sur opérateur = cycle AND → OR → NOT
- Clic ✕ = removeFilter
- Bouton "Tout effacer" = clearFilters

**Nouveau — badge TYPE avec popover hiérarchie :**
Quand un badge de type TYPE est affiché, il possède une icône `⋮` supplémentaire qui ouvre le TypeHierarchyPanel en popover, ancré sur le badge lui-même :

```
│  [AND être humain ⋮ ✕]
│           ↓ (popover sur clic ⋮)
│  ┌──────────────────────────┐
│  │  ↑ Q15978631 primates    │
│  │  ● Q5 être humain 9.8M  │
│  │  ↓ Q514 homme            │
│  │  ↓ Q215627 femme         │
│  └──────────────────────────┘
```

Clic sur un élément de la hiérarchie → remplace le filtre TYPE actif (comportement actuel de `handleTypeFilterReplace`), puis ferme le popover.

---

### 4.5 Zone résultats

#### Structure d'un TypeGroup

```
▼  être humain   Q5     7 résultats              [+ Filtrer par type]
   ──────────────────────────────────────────────────────────────────
   ●  Marie Curie           Q7186    physicienne et chimiste…
                                      [↗] [+] [⧉]
   ○  Albert Einstein        Q937    physicien théoricien…
                                      [↗] [+] [⧉]
```

- `●` = in-graph (pastille verte)
- `○` = hors-graphe
- `[↗]` = naviguer vers ce nœud (action principale — identique au clic sur le label)
- `[+]` = ajouter au graphe (`addNodeToGraph`) sans fermer le modal
- `[⧉]` = copier le QID dans le presse-papier
- Les icônes d'action sont visibles au hover de la ligne uniquement (pas en permanence)
- L'action principale reste le **clic sur le label** → navigate + close (comportement actuel)

#### Sélection multiple pour ajout groupé

Checkboxes au hover de la pastille (●/○) :

```
☑  Marie Curie           Q7186    physicienne et chimiste…
☑  Albert Einstein        Q937    physicien théoricien…
☐  Isaac Newton           Q935    mathématicien…
```

Quand ≥ 1 checkbox cochée, un bandeau flottant apparaît en bas de la zone résultats :

```
┌────────────────────────────────────────────────────────────┐
│  2 entités sélectionnées          [Ajouter au graphe]  [✕] │
└────────────────────────────────────────────────────────────┘
```

Clic "Ajouter au graphe" → itère `addNodeToGraph()` sur chaque entité sélectionnée, puis reset la sélection. Le modal reste ouvert.

---

### 4.6 États vides et pré-recherche

**État initial (modal vient d'ouvrir, input vide, pas de filtres) :**

```
┌─────────────────────────────────────────────────────────────────┐
│  HISTORIQUE RÉCENT                                               │
│  🕐  Marie Curie                                    → relancer   │
│  🕐  [TYPE: être humain] [NOT: article]             → relancer   │
│  🕐  Q42                                            → naviguer   │
│                                                                  │
│  EXPLORER LE GRAPHE COURANT                                      │
│  Types découverts :                                             │
│    [être humain 34]  [pays 8]  [œuvre littéraire 5]  [film 3]  │
│  Propriétés fréquentes :                                        │
│    [P31]  [P569]  [P27]  [P21]                                  │
├─────────────────────────────────────────────────────────────────┤
```

- Section "Historique récent" : 5 dernières entrées (query textuelle et/ou combinaison de filtres). Cliquable → restore la session.
- Section "Explorer le graphe" : contenu du FilterBrowser actuel, repackagé en chips horizontaux par section. Clic = addFilter.

**État "zéro résultat" :**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│           Aucun résultat pour "Dostoïevski"                     │
│           dans le graphe courant (47 nœuds)                     │
│                                                                  │
│   [Chercher dans Wikidata →]                                    │
│                                                                  │
│   Ou affinez vos filtres :                                      │
│   ✕ Retirer "être humain"    ✕ Retirer le filtre de date        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

- Bouton CTA primaire → passe le scope en "Wikidata" et relance
- Liste des filtres actuels avec suggestion de les retirer

**État "chargement" :**
- Spinner minimaliste dans la zone body, sans bloquer le header
- Les résultats précédents restent affichés en grisé (`opacity: 50%`) pendant le chargement d'une nouvelle requête — évite le flash de contenu vide

---

### 4.7 Footer

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ↩ naviguer · ⌘↩ ajouter · ⌘K fermer · Ctrl+⌫ supprimer filtre    12 · 5● │
└────────────────────────────────────────────────────────────────────────────┘
```

- Côté gauche : raccourcis clavier dynamiques (s'adaptent selon le contexte — ex: si sélection multiple active, afficher "[⌘↩ Ajouter 2 entités]")
- Côté droit : stats synthétiques `{total résultats} · {n in-graph} ●`
- Si "Charger plus" disponible (`searchHasMore`), un bouton discret apparaît au-dessus du footer à la fin de la liste

---

## 5. Système de filtres — révision complète

### 5.1 Scope selector (remplace le toggle "Hors graphe")

Le toggle `IN_GRAPH` actuel est un filtre parmi d'autres dans `searchFilters`. Ce modèle est confus : le scope n'est pas un filtre sur les *propriétés* des entités — c'est une décision sur *où on cherche*.

**Nouvelle modélisation :**
- Scope = propriété du store séparée (`searchScope: 'graph' | 'wikidata' | 'visible'`)
- N'apparaît plus dans `searchFilters` ni dans les FilterBadges
- Affiché uniquement dans le scope selector du header

**Impact sur `executeSearch()` :**

```
Scope 'graph'    → pool = loadedNodes uniquement (pas de fetch remote)
Scope 'wikidata' → pool = loadedNodes + fetch remote (comportement "hors graphe" actuel)
Scope 'visible'  → pool = loadedNodes filtré par visibleNodeIds (pas de fetch remote)
```

Le filtre `FILTER_TYPES.IN_GRAPH` est **retiré** du modèle de données ou conservé en interne uniquement pour la logique backend (ne plus l'exposer dans l'UI).

---

### 5.2 Types de filtres conservés et modifiés

| Type | Statut | Changement |
|------|--------|------------|
| `TEXT` | ✅ Inchangé | Géré par l'input, pas en badge |
| `IN_GRAPH` | 🔄 Remplacé | → `searchScope` dans le store |
| `TYPE` | ✅ Conservé | + icône `⋮` pour ouvrir TypeHierarchy en popover |
| `PROPERTY` | ✅ Conservé | + step HAS_VALUE optionnel au clic (voir §5.3) |
| `ENTITY` | ✅ Conservé | Tooltip sur le badge : "Connecté à [label] dans le graphe" |
| `HAS_VALUE` | ✅ Conservé | Désormais accessible via UI (voir §5.3) |

**Opérateurs :**
Le cycle AND → OR → NOT est conservé tel quel. Aucun changement de sémantique.

**Couleurs :**
Inchangées. La palette actuelle est cohérente et lisible.

---

### 5.3 HAS_VALUE — accès UI

HAS_VALUE est actuellement le filtre le plus puissant et le plus inaccessible. Il permet de chercher `entités ayant la valeur Q… pour la propriété P…`.

**Nouveau chemin d'accès :**

Quand l'utilisateur clique sur une propriété suggérée (ex: P27 — pays de citoyenneté), plutôt que d'ajouter directement un filtre PROPERTY :

```
┌─────────────────────────────────────────────────────────┐
│  P27 — Pays de citoyenneté                              │
│                                                         │
│  ○  Filtrer par existence (a P27)                       │
│  ● Filtrer par valeur spécifique…                       │
│     [🔍 Rechercher une valeur QID…]                     │
│     → France  Q142                                      │
│     → Allemagne  Q183                                   │
│     → Russie  Q159                                      │
└─────────────────────────────────────────────────────────┘
```

- Popover sur clic de la propriété suggérée
- Option 1 (filtre PROPERTY) : ajoute un badge `[AND propriété:P27 ✕]`
- Option 2 (filtre HAS_VALUE) : input de recherche dans le popover → sélection d'une valeur → badge `[AND P27=France ✕]`

Ce popover utilise `searchEntities()` pour la recherche de valeur (appel remote léger).

---

### 5.4 Debounce et auto-trigger

**Problème actuel :**
`useEffect` sur `searchFilters` → `executeSearch()` immédiatement. Si l'utilisateur clique 3 types dans le FilterBrowser, 3 exécutions successives.

**Solution :**

```
Changement de filtre → debounce 250ms → executeSearch()
Input texte (scope Graphe) → debounce 150ms → executeSearch() (local only)
Input texte (scope Wikidata) → attendre Enter ou 800ms idle → executeSearch() (remote)
```

Le debounce sur les filtres doit s'annuler si un nouveau filtre arrive dans la fenêtre — comportement standard `clearTimeout` + `setTimeout`.

---

## 6. TypeHierarchyPanel — repositionnement

### Problème actuel

Le TypeHierarchyPanel s'affiche comme une **colonne latérale** dès qu'un filtre TYPE est actif. Cette colonne prend ~180px de largeur dans un modal de 700px, réduisant la zone résultats à ~340px si le FilterBrowser est aussi ouvert. De plus, cliquer un élément de la hiérarchie **remplace silencieusement** le filtre actif — comportement non évident.

### Nouvelle approche : Popover ancré sur le badge TYPE

**Déclencheur :** Clic sur l'icône `⋮` du badge TYPE dans la FilterBar.

**Rendu :**

```
[AND être humain ⋮ ✕]
         ↓
┌──────────────────────────────────────────┐
│  Naviguer dans la taxonomie P279         │
│                                          │
│  ↑  Q131476 mammifère        (327M)      │
│  ↑  Q15978631 primate         (28M)      │
│  ─────────────────────────────────────── │
│  ●  Q5 être humain            (9.8M)     │ ← courant (surligné)
│  ─────────────────────────────────────── │
│  ↓  Q514 homme                (4.1M)     │
│  ↓  Q215627 femme             (3.2M)     │
│  ↓  Q22808320 personne âgée     (80K)    │
│                                          │
│  [Clic pour remplacer le filtre]         │
└──────────────────────────────────────────┘
```

**Comportements :**
- Popover ferme sur clic extérieur ou sur Escape
- Clic sur un item de la hiérarchie → `handleTypeFilterReplace(qid)` → ferme le popover
- Scroll interne si nombreux enfants (max-h: 300px)
- Animation fade-in légère (100ms)

**Avantage :** Le TypeHierarchyPanel n'occupe plus de surface permanente. Il devient un outil de précision accessible en 2 clics depuis le filtre.

---

## 7. FilterBrowser — repositionnement

### Problème actuel

Le FilterBrowser est une **sidebar optionnelle** déclenchée par un bouton "⚙ Filter" dans le header. Il liste types, propriétés et entités du graphe courant. Il est peu découvrable et réduit la zone résultats quand ouvert.

### Nouvelle approche : Section dans l'état pré-recherche

**Quand :** Affiché dans le body du modal quand `localQuery === ''` et `searchFilters.length === 0`.

**Layout :**

```
EXPLORER LE GRAPHE COURANT
──────────────────────────────────────────────────────────────
Types                                               (6 types)
  [être humain 34]  [pays 8]  [œuvre littéraire 5]  [film 3]
  [ville 2]  [organisation 2]   + 3 autres…

Propriétés                                          (12 PIDs)
  [P31 — type]  [P27 — pays]  [P569 — naissance]   + 9…

Entités chargées                                    (47 nœuds)
  [Marie Curie]  [France]  [Paris]  [CNRS]          + 43…
──────────────────────────────────────────────────────────────
```

**Comportement :**
- Clic sur un chip → `addFilter()` + le FilterBrowser reste visible (l'utilisateur peut chaîner plusieurs filtres)
- "Autres…" → expande la section
- Dès que l'utilisateur tape dans l'input ou qu'un filtre est ajouté, le body passe en mode résultats (FilterBrowser disparaît)

**Avantage :** Le FilterBrowser est découvrable naturellement (c'est ce qu'on voit à l'ouverture) et n'empiète pas sur l'espace résultats.

---

## 8. Résultats — nouvelles interactions

### 8.1 Actions secondaires par résultat

Chaque ligne de résultat expose 3 actions au hover :

```
●  Marie Curie           Q7186    physicienne et chimiste…
                                   [↗ Naviguer]  [+ Graphe]  [⧉ QID]
```

| Icône | Action | Comportement |
|-------|--------|-------------|
| `↗` | Naviguer | `selectNode(uri)` + `closeSearchModal()` (identique au clic actuel) |
| `+` | Ajouter au graphe | `addNodeToGraph(uri)` — modal reste ouvert, pastille passe à ● |
| `⧉` | Copier QID | `navigator.clipboard.writeText(id)` + feedback toast 1s |

**Règles :**
- Pour un nœud in-graph (●) : l'icône `+` est grisée et non-cliquable (déjà dans le graphe)
- Pour un nœud hors-graphe (○) : les 3 icônes sont actives
- Les icônes ne sont visibles qu'au hover de la ligne (économie visuelle)
- L'icône active au keyboard focus (`Tab`) reste visible (accessibilité)

### 8.2 Ajout groupé au graphe

**Activation :** Clic sur la pastille (●/○) d'une ligne = toggle checkbox sur cette ligne.

**Comportement :**
- La pastille se transforme en checkbox `☑ / ☐`
- Un bandeau de sélection apparaît en sticky en bas de la zone body :

```
┌────────────────────────────────────────────────────────────────┐
│  ☑ 2 entités sélectionnées              [Ajouter au graphe ↗] │
└────────────────────────────────────────────────────────────────┘
```

- "Ajouter au graphe" → itère `addNodeToGraph(uri)` sur chaque entité sélectionnée
- Les entités ajoutées passent de ○ à ● avec animation de pulse (comportement `addNodeToGraph` existant)
- Le bandeau reste jusqu'au désactif manuel (✕) ou fermeture du modal

**State local :**
- `selectedResults: Set<uri>` — géré en state local dans SearchModal
- Reset à chaque nouvelle recherche

### 8.3 Preview au survol

Pour les entités **in-graph uniquement** (données déjà dans `loadedNodes`) :

Hover prolongé (300ms) sur une ligne → tooltip latéral avec :
- Description complète (pas tronquée)
- 3 propriétés primaires du nœud (depuis `_raw.properties`)
- Nombre de connexions dans le graphe courant

```
┌──────────────────────────────────────────────┐
│  Marie Curie                        Q7186    │
│  Physicienne et chimiste polonaise…          │
│  ─────────────────────────────────────────── │
│  Naissance : 7 novembre 1867, Varsovie       │
│  Nationalité : polonaise, française          │
│  Domaine : physique, chimie                  │
│  ─────────────────────────────────────────── │
│  12 connexions dans le graphe                │
└──────────────────────────────────────────────┘
```

Pour les entités hors-graphe : pas de preview (données non disponibles localement).

### 8.4 Groupement et tri

**Groupement :** Inchangé — groupement par `typeLabel` (type P31), trié par count desc.

**Tri au sein d'un groupe :**
1. In-graph (●) en premier
2. Alphabétique sur le label
*(identique à l'actuel)*

**Bouton "Charger plus" :**
- Positionné après le dernier groupe, avant le footer
- Visible uniquement si `searchHasMore === true`
- Label : `"Charger 50 résultats de plus"`
- Déclenche `executeSearch(true)` (inchangé)

---

## 9. Features nouvelles

### 9.1 Navigation directe par QID

**Déclencheur :** L'input est analysé en temps réel. Si le pattern `/^Q\d+$/` est détecté :

```
┌─────────────────────────────────────────────────────────────────┐
│  🔍  Q42                                                  [✕]  │
│      ↳ Naviguer directement vers Q42 →                         │  ← hint inline
│  [● Graphe]  [○ Wikidata]  [○ Visible]                         │
└─────────────────────────────────────────────────────────────────┘
```

- Le hint apparaît sous l'input (non intrusif)
- Enter → `selectNode('http://www.wikidata.org/entity/Q42')` + close
- Si le QID n'est pas in-graph : tente `addNodeToGraph('Q42')` puis navigate

**Cas d'usage :** L'utilisateur copie un QID depuis Wikidata ou un autre outil et veut l'explorer directement sans passer par la recherche textuelle.

### 9.2 Search-as-you-type in-graph

**Scope Graphe :**
- Dès que `localQuery.length >= 1`, la recherche locale (`loadedNodes`) se filtre en temps réel (debounce 150ms)
- Pas d'appel backend — uniquement les données en mémoire
- Les résultats apparaissent instantanément

**Scope Wikidata :**
- Le comportement actuel est conservé : Enter ou 800ms idle → fetch remote
- Un indicator discret `"Tape ↩ pour chercher dans Wikidata"` peut apparaître si l'utilisateur tape mais n'a pas encore soumis

**Scope Visible :**
- Identique au scope Graphe mais pool réduit à `visibleNodeIds`
- Toujours instantané (pas de fetch)

### 9.3 Historique de recherche

**Stockage :** `sessionStorage` (persiste pendant la session, reset à la fermeture du navigateur).

**Format d'une entrée d'historique :**
```js
{
  id: timestamp,
  query: "Marie Curie",        // texte de recherche
  filters: [...],              // snapshot des filtres actifs
  scope: 'graph',              // scope au moment de la recherche
  resultCount: 12,             // nombre de résultats obtenus
  timestamp: 1717000000000
}
```

**Affichage dans l'état pré-recherche :**
```
RECHERCHES RÉCENTES
🕐  Marie Curie                              12 résultats  → relancer
🕐  [TYPE: être humain] [NOT: article]        7 résultats  → relancer
🕐  Q42                                      naviguer direct
```

**Restauration :**
- Clic "→ relancer" → restore query + filtres + scope + lance `executeSearch()`
- Clic "→ naviguer" → directement `selectNode()` + close

**Limite :** 10 entrées max (FIFO).

### 9.4 Propriétés suggérées — accès revu

**Positionnement actuel :** Ligne de boutons dans le header (3ème ligne). Trop encombrant.

**Nouvelle position :** Drawer discret en bas de la FilterBar, visible uniquement quand un filtre TYPE est actif.

```
┌────────────────────────────────────────────────────────────────────┐
│  [AND être humain ⋮ ✕]                          [× Tout effacer] │  ← FilterBar
│  ──────────────────────────────────────────────────────────────   │
│  Propriétés fréquentes pour être humain :                         │  ← Drawer
│  [P569 naissance 83%]  [P27 nationalité 57%]  [P21 sexe 71%]…    │
└────────────────────────────────────────────────────────────────────┘
```

- Apparaît automatiquement quand `activeTypeFilter` est défini et `propertyMatrixLoaded`
- Clic sur un chip → popover HAS_VALUE (voir §5.3)
- Maximum 5 propriétés affichées (les plus fréquentes), bouton `+ voir plus` pour le reste

---

## 10. Raccourcis clavier — révision

| Raccourci | Condition | Action | Statut |
|-----------|-----------|--------|--------|
| `⌘K` / `Ctrl+K` | Global | Toggle open/close | ✅ Inchangé |
| `Escape` | Modal ouvert | Ferme le modal | ✅ Inchangé |
| `Ctrl+Backspace` | Modal ouvert + filtres > 0 | Supprime le dernier filtre | ✅ Inchangé |
| `Enter` | Input focus | Lance la recherche (scope Wikidata) ou confirme QID | 🔄 Adaptatif |
| `⌘Enter` | Résultat surligné | Ajoute au graphe sans fermer | 🆕 Nouveau |
| `Tab` / `↓` | Après Enter | Focus sur le premier résultat | 🆕 Nouveau |
| `↑` / `↓` | Focus dans les résultats | Navigation entre résultats | 🆕 Nouveau |
| `Enter` | Résultat focusé | Naviguer vers ce nœud + close | 🆕 Nouveau |
| `1` / `2` / `3` | Header focus | Sélectionner scope Graphe/Wikidata/Visible | 🆕 Nouveau |
| `P` | Modal **fermé** + node sélectionné | Pin/unpin | ✅ Inchangé |

**Note sur la navigation clavier dans les résultats :**
La navigation ↑/↓ traverse tous les résultats visibles dans l'ordre affiché (sans distinction de TypeGroup). L'item focusé reçoit un outline visible (`ring-2 ring-blue-500`).

---

## 11. Animations & transitions

### Slide-up (ouverture)

L'animation `slide-up` actuelle (0.25s ease-out) est conservée — elle est correcte et sobre.

### Transitions internes

| Événement | Animation |
|-----------|-----------|
| Scope change | Fade cross (150ms) sur la zone body |
| Ajout filtre | Le badge entre en fade-in scale depuis gauche (100ms) |
| Suppression filtre | Le badge sort en fade-out scale (100ms) |
| Résultats arrivés | Fade-in staggered des TypeGroups (50ms entre chaque groupe) |
| Ajout au graphe (●) | La pastille ○ → ● avec pulse vert 500ms (cohérent avec `ADDED_PULSE_COLOR`) |
| Popover TypeHierarchy | Fade-in + scale depuis l'ancre (100ms) |
| Bandeau sélection multiple | Slide-up depuis le bas de la zone body (150ms) |
| État loading | Opacity 50% sur les résultats existants + spinner en overlay |

**Principe général :** Toutes les animations restent sous 200ms. Aucun effet spectaculaire — le modal doit rester un outil, pas une vitrine.

---

## 12. État du store — évolutions

### Nouvelles propriétés dans `searchSlice`

```js
// Scope de recherche (remplace le filtre IN_GRAPH)
searchScope: 'graph' | 'wikidata' | 'visible',  // défaut: 'graph'
setSearchScope: (scope) => void,

// Sélection multiple
selectedResults: Set<uri>,
toggleResultSelection: (uri) => void,
clearResultSelection: () => void,

// Historique
searchHistory: SearchHistoryEntry[],   // max 10 entrées, sessionStorage
addToHistory: (entry) => void,
restoreFromHistory: (entry) => void,
```

### Propriétés retirées

```js
// Remplacé par searchScope
// Le filtre IN_GRAPH disparaît de searchFilters
```

### Modifications de `executeSearch()`

```js
// Avant
const inGraphFilter = searchFilters.find(f => f.type === FILTER_TYPES.IN_GRAPH);
const includeRemote = !!inGraphFilter;

// Après
const includeRemote = searchScope === 'wikidata';
const visibleOnly = searchScope === 'visible';
const localPool = visibleOnly
  ? [...loadedNodes.values()].filter(n => visibleNodeIds.has(n.uri))
  : [...loadedNodes.values()];
```

### Modifications de `openSearchModal()`

```js
openSearchModal: (initialFilters = [], initialScope = null) => {
  // Si initialScope fourni (ex: 'graph' depuis NodeDetailPanel), forcer ce scope
  // Sinon conserver le scope mémorisé
}
```

---

## 13. Évolutions backend

Le backend est **peu impacté** par cette révision. Les endpoints existants sont suffisants.

### Aucun changement requis pour

- `GET /api/search` — inchangé
- `GET /api/taxonomy/light` — inchangé
- `GET /api/taxonomy/property-matrix` — inchangé
- `POST /api/search/filtered` — inchangé

### Évolution optionnelle — Recherche HAS_VALUE dans le popover

Le popover HAS_VALUE a besoin de chercher des entités en temps réel (pour lister les valeurs possibles d'une propriété). Il utilise `GET /api/search?q=...` — aucune route spécifique requise.

### Évolution optionnelle — Scope "Visible" + filtres structurels

Si l'utilisateur est en scope "Visible" avec des filtres TYPE/PROPERTY, la logique actuelle de post-filtre local suffit (le pool est simplement réduit à `visibleNodeIds`). Aucun endpoint backend supplémentaire.

---

## 14. Priorités d'implémentation

### Phase 1 — Fondations UX (impact max, effort min)

Ces changements améliorent l'expérience sans toucher au backend ni au store.

| # | Tâche | Fichier(s) | Effort |
|---|-------|------------|--------|
| 1.1 | Scope selector (remplace toggle "Hors graphe") | `SearchModal.jsx`, `searchSlice.js` | M |
| 1.2 | Suppression des sidebars permanentes (TypeHierarchy + FilterBrowser) | `SearchModal.jsx` | S |
| 1.3 | FilterBrowser dans l'état pré-recherche | `SearchModal.jsx` | S |
| 1.4 | Actions secondaires au hover (↗ / + / ⧉) | `SearchModal.jsx` | S |
| 1.5 | État "zéro résultat" designé + CTA Wikidata | `SearchModal.jsx` | S |
| 1.6 | TypeHierarchyPanel → popover ancré sur le badge TYPE | `SearchModal.jsx`, `TypeHierarchyPanel.jsx` | M |

### Phase 2 — Fluidité et puissance (impact élevé, effort moyen)

| # | Tâche | Fichier(s) | Effort |
|---|-------|------------|--------|
| 2.1 | Search-as-you-type in-graph (debounce 150ms, local only) | `SearchModal.jsx`, `searchSlice.js` | M |
| 2.2 | Debounce 250ms sur auto-trigger des filtres | `SearchModal.jsx` | S |
| 2.3 | Navigation directe par QID | `SearchModal.jsx` | S |
| 2.4 | Ajout groupé (sélection multiple + bandeau) | `SearchModal.jsx`, `searchSlice.js` | M |
| 2.5 | Idle bar contextuelle (nœuds chargés, scope courant) | `SearchModal.jsx` | S |
| 2.6 | Propriétés suggérées → drawer sous la FilterBar | `SearchModal.jsx` | S |

### Phase 3 — Features avancées (impact ciblé, effort variable)

| # | Tâche | Fichier(s) | Effort |
|---|-------|------------|--------|
| 3.1 | Historique de recherche (sessionStorage) | `SearchModal.jsx`, `searchSlice.js` | M |
| 3.2 | Preview au survol (entités in-graph) | `SearchModal.jsx` | M |
| 3.3 | HAS_VALUE via popover propriété | `SearchModal.jsx` | L |
| 3.4 | Scope "Visible" (visibleNodeIds) | `searchSlice.js` | M |
| 3.5 | Navigation clavier dans les résultats (↑/↓/Enter) | `SearchModal.jsx` | M |
| 3.6 | Animations internes staggered + transitions scope | `SearchModal.jsx`, `index.css` | S |

---

*Document produit dans le cadre de la refonte SearchModal — Gexor.*
*Version 1.0 — Mars 2026*
