# Gexor — Rapport d'Architecture : Pipeline de Gestion des Données Wikidata

> **Date** : Mars 2026
> **Contexte** : Refonte du système de classification et d'affichage des propriétés Wikidata dans le moteur de graphe 3D Gexor
> **Base de code** : NexReecGraph (React Three Fiber + Zustand + SPARQL fédéré)
> **Données analysées** : Dump taxonomique complet Wikidata — 411 734 classes P279, 7 797 031 instances P31

---

## 1. État des lieux

### 1.1 Ce qui existe et fonctionne

Le code actuel de Gexor dispose déjà d'un système de classification des propriétés Wikidata organisé en deux fichiers principaux :

**`WikiData_properties.json` (v4.0)** — un référentiel exhaustif de ~500 propriétés classées sur deux axes :
- **Axe A** — Groupes de redondance hiérarchique (A1 localisation, A2 biographie, A3 juridiction, A4 dates, A5 mesures). Propriétés dont l'information est dérivable d'une autre plus spécifique.
- **Axe B** — Bruit UI (métadonnées Wikimedia, images/médias, noms/appellations, symboles officiels, droits/licences, religion/rituels, biométrie, langues, bibliographique, méta-propriétés, qualificateurs).
- **Axe C** — Propriétés contexte-dépendantes (P27 nationalité, P21 genre, P140 religion, P36 capitale, P37 langue officielle, P407 langue de l'œuvre, etc.).
- **Axe D** — Propriétés toujours primaires (~50 PIDs : famille, biographie, création, structure, thématique).

**`propertyClassification.js`** — service qui expose des lookups O(1) sur ce référentiel : `classifyPid()`, `getRedundancyGroupForPid()`, `isNoisePid()`, `getContextDependentPids()`, `getAlwaysPrimaryPids()`, etc.

**`graphSlice.js`** — filtrage à l'affichage via une whitelist `graphRelationPids` (initialisée avec D_always_primary) croisée avec une blacklist `secondaryPids` (A+B), avec override utilisateur via `toggleSecondaryPid()`.

**`SettingsPanel.jsx`** — interface de configuration qui organise les PIDs découverts par catégorie (primary / context-dependent / secondary / unclassified) et permet à l'utilisateur de toggler individuellement.

### 1.2 Les cinq problèmes structurels

**Problème 1 — Le limit=50 est aveugle et s'applique avant la classification.**

Dans `fetchNeighbors` (wikidata.js), l'itération sur les claims de l'entité s'arrête à 50 voisins :

```js
if (neighborQids.size >= limit) break;
```

L'ordre d'itération des claims suit l'ordre arbitraire de l'API Wikidata. Pour une entité avec 200+ claims `wikibase-item` (États, grandes personnalités), les 50 premiers capturés peuvent être du bruit (P735 prénom, P734 nom de famille, P910 catégorie Commons, P1412 langues) tandis que des arêtes structurantes comme P800 (œuvre notable) ou P185 (doctorant) apparaissent plus loin et sont tronquées.

**Problème 2 — Aucune déduplication par groupe de redondance au moment du fetch.**

Si Napoléon a P131 (Ajaccio), P17 (France), P30 (Europe), les trois arrivent comme edges distincts dans `loadedRelations`. Le `graphSlice` les masque tous car P17, P30 et P131 sont dans `getAllSecondaryPids()` — y compris P131 qui est pourtant documenté comme `_keep_as_primary` dans le groupe A1. La propriété la plus spécifique est filtrée alors qu'elle devrait être l'unique survivante du groupe.

**Problème 3 — Les propriétés contexte-dépendantes (axe C) ne sont jamais promues automatiquement.**

`classifyPid()` retourne `'context-dependent'` pour ces PIDs, mais aucune logique ne vérifie le P31 de l'entité pour décider si la promotion est pertinente. P36 (capitale) reste secondaire même quand on explore un pays. P407 (langue de l'œuvre) reste secondaire même pour un roman. Seul le toggle manuel dans le SettingsPanel permet de les réactiver.

**Problème 4 — Les PIDs non classifiés sont exclus par défaut.**

La whitelist `graphRelationPids` ne contient que les PIDs de D_always_primary. Tout PID inconnu (non listé dans le JSON) de type `wikibase-item` est stocké dans `loadedRelations` mais jamais affiché sauf activation manuelle. Pour des domaines de niche (biologie, musique, droit), beaucoup de PIDs pertinents de type `wikibase-item` n'apparaissent dans aucune liste.

**Problème 5 — Les relations entrantes n'existaient pas, et leur ajout change radicalement la donne.**

Jusqu'ici `fetchNeighbors` ne lisait que les claims sortants (Napoléon → P40 → ses enfants). L'ajout des relations entrantes (Napoléon ← P22 ← ses enfants, Napoléon ← P921 ← des œuvres sur lui) est la différence entre un "infobox amélioré" et un vrai outil d'exploration de graphe. Mais ça introduit une explosion combinatoire (France ← P17 = millions d'entités) et une asymétrie sémantique par PID (P17 sortant = secondaire, P17 entrant = bruit massif ; P921 sortant = primary, P921 entrant = très pertinent).

---

## 2. Analyse du Dump Taxonomique

### 2.1 Méthode

Extraction complète des relations P31 (instance of) et P279 (subclass of) depuis le dump N-Triples truthy de Wikidata (~30 GB compressé, 651 millions de lignes). Parsing multi-threadé avec checkpoints, détection de cycles via Tarjan SCC, streaming P31 sur disque.

### 2.2 Chiffres clés

| Métrique | Valeur |
|----------|--------|
| Classes P279 totales | 411 734 |
| Edges P279 | 418 527 |
| Instances P31 | 7 797 031 |
| Classes ayant au moins 1 instance | 39 720 (9.6% des classes) |
| Classes sans aucune instance | 370 391 (90%) |
| Racines P279 (0 parents) | 73 271 |
| Feuilles P279 (0 children) | 361 592 |
| Profondeur max | 5 |
| Profondeur moyenne | 0.85 |
| Cycles SCC | 0 |

### 2.3 Distribution de la profondeur

L'arbre P279 en mode truthy est extraordinairement plat :

```
depth 0 :   73 271  ██████████████████████  (17.8% — racines)
depth 1 :  328 868  ██████████████████████████████████████████████████  (79.9%)
depth 2 :    9 063  ██                      (2.2%)
depth 3 :      479                          (0.1%)
depth 4 :       49                          
depth 5 :        4                          
```

La quasi-totalité des classes sont à profondeur 0 (racines) ou 1 (un seul parent P279). Les hiérarchies profondes type "daily newspaper → periodical → publication → creative work → intellectual work" n'existent quasiment pas en mode truthy. Ça signifie que pour la majorité des entités, le P31 direct EST déjà au bon niveau d'abstraction — pas besoin de remonter l'arbre.

### 2.4 Couverture : 45 classes = 80%

| Seuil | Classes nécessaires | Instances couvertes |
|-------|--------------------:|--------------------:|
| 50% | 3 | 4 276 826 |
| 80% | 45 | 6 246 577 |
| 90% | 241 | 7 018 772 |
| 95% | 878 | 7 407 439 |
| 99% | 7 438 | 7 719 061 |

### 2.5 Top 20 classes par instances directes

| # | QID | Label | Instances | % | Pertinence Gexor |
|---|-----|-------|----------:|---:|-----------------|
| 1 | Q13442814 | scholarly article | 3 105 993 | 39.8% | Agrégateur |
| 2 | Q5 | human | 672 801 | 8.6% | Cœur de cible |
| 3 | Q4167836 | Wikimedia category page | 498 032 | 6.4% | Exclure |
| 4 | Q16521 | taxon | 326 985 | 4.2% | Niche bio |
| 5 | Q4167410 | Wikimedia disambiguation page | 153 362 | 2.0% | Exclure |
| 6 | Q7187 | gene | 149 005 | 1.9% | Agrégateur |
| 7 | Q8054 | protein | 122 590 | 1.6% | Agrégateur |
| 8 | Q11266439 | Wikimedia template | 88 002 | 1.1% | Exclure |
| 9 | Q13100073 | village of China | 73 091 | 0.9% | Géographie |
| 10 | Q8502 | mountain | 63 499 | 0.8% | Géographie |
| 11 | Q486972 | human settlement | 54 275 | 0.7% | Géographie |
| 12 | Q3305213 | painting | 50 602 | 0.6% | Culture |
| 13 | Q4022 | river | 47 835 | 0.6% | Géographie |
| 14 | Q79007 | street | 47 101 | 0.6% | Géographie niche |
| 15 | Q54050 | hill | 39 261 | 0.5% | Géographie niche |
| 16 | Q30612 | clinical trial | 39 132 | 0.5% | Agrégateur |
| 17 | Q13433827 | encyclopedia article | 37 527 | 0.5% | Agrégateur |
| 18 | Q13406463 | Wikimedia list article | 37 004 | 0.5% | Exclure |
| 19 | Q101352 | family name | 36 747 | 0.5% | Linguistique niche |
| 20 | Q7725634 | literary work | 36 072 | 0.5% | Culture |

### 2.6 Segmentation par pertinence Gexor

| Segment | Exemples de classes | Instances | Stratégie |
|---------|---------------------|----------:|-----------|
| **Bruit Wikimedia** | category page, disambiguation, template, list article | ~776K | Exclure complètement du graphe |
| **Contenu massif spécialisé** | scholarly article, clinical trial, gene, protein, encyclopedia article | ~3.5M | Nœuds agrégateurs (comptage, pas affichage individuel) |
| **Contenu Gexor cœur** | human, settlement, film, literary work, painting, mountain, river, enterprise | ~3.5M | Nœuds individuels, exploration complète |

### 2.7 Racines — diagnostic

Sur les 73 271 racines P279 :
- **36 979** ont des instances (directes ou héritées) — classes légitimes sans parent dans le dump truthy
- **36 292** n'ont aucune instance — bruit structurel de Wikidata (classes méta-ontologiques, classifications vides, stubs)

Les plus grosses racines orphelines (0 instances, mais des milliers de children P279) sont des classes abstraites servant à organiser l'ontologie Wikidata elle-même, jamais utilisées directement en P31.

---

## 3. Architecture Proposée

### 3.1 Vue d'ensemble — Pipeline en 3 couches

```
                         COUCHE 1 : FETCH
                         (wikidata.js)
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                     │
    SORTANTS              PROPRIÉTÉS           ENTRANTS
    (Action API)          (Action API)         (SPARQL)
         │                    │                     │
    Claims wikibase-item  Tous datatypes     Comptage groupé
    → Classification      → Panneau détail   par type P31
    → Dédup redondance                       → Agrégateurs
    → Limit intelligent                      → Expand on-demand
         │                    │                     │
         └────────────────────┼────────────────────┘
                              │
                         COUCHE 2 : STORE
                         (dataSlice.js)
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                     │
    LodEdge               LodNode              AggregateNode
    (tier, weight,        (propriétés,         (type, count,
     direction,            sources)             expanded,
     redundancyGroup)                           children)
         │                    │                     │
         └────────────────────┼────────────────────┘
                              │
                         COUCHE 3 : DISPLAY
                         (graphSlice.js)
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                     │
    Arêtes primaires     Arêtes secondaires    Nœuds agrégateurs
    (D + C promus        (A dédup + C non      (compteur, style
     + unclassified)      promus, sur toggle)   distinct, expand)
```

### 3.2 Couche 1 — Fetch intelligent

#### 3.2.1 Relations sortantes (refonte de `fetchNeighbors`)

Le problème central est résolu en inversant l'ordre : **classer d'abord, limiter ensuite**.

L'algorithme actuel :
1. Itérer les claims
2. Prendre les 50 premiers `wikibase-item`
3. Classer après coup

L'algorithme proposé :
1. Itérer TOUS les claims `wikibase-item` de l'entité
2. Classer chaque PID via le pipeline de classification (voir 3.3)
3. Appliquer la déduplication par groupe de redondance (voir 3.4)
4. Appliquer un budget intelligent par tier :
   - **D_always_primary** : tous pris, pas de limit (rarement >30)
   - **C promu** : tous pris (déterminé par le Context Resolver)
   - **Unclassified** : budget de 20 (conservatif — inconnu ≠ inutile)
   - **A dédup** : un seul survivant par groupe de redondance
   - **B noise** : exclus du fetch (jamais chargés comme voisins)

L'Action API retourne tous les claims d'un coup (pas de pagination), donc il n'y a pas de surcoût réseau à tout itérer. Le coût supplémentaire est uniquement la classification côté client, qui est O(1) par PID via les Sets/Maps pré-calculés.

#### 3.2.2 Relations entrantes (nouvelle fonctionnalité)

Les entrants passent par SPARQL (obligatoire — l'Action API ne donne pas les backlinks). Deux étapes :

**Étape A — Comptage groupé (toujours exécuté).**

```sparql
SELECT ?prop ?type (COUNT(DISTINCT ?item) AS ?count) WHERE {
  ?item ?prop wd:Q517 .
  ?item wdt:P31 ?type .
  ?prop wikibase:directClaim ?p .
}
GROUP BY ?prop ?type
ORDER BY DESC(?count)
LIMIT 100
```

Résultat : une liste `(PID, type P31, count)` — ex: "(P921, Q13442814, 3105), (P921, Q11424, 12), (P22, Q5, 3)". Chaque ligne produit un nœud agrégateur ou des nœuds individuels selon le count.

**Étape B — Expand individuel (sur demande utilisateur).**

Quand l'utilisateur clique sur un agrégateur, une requête ciblée charge les entités individuelles :

```sparql
SELECT ?item ?itemLabel ?type WHERE {
  ?item wdt:P921 wd:Q517 .
  ?item wdt:P31 wd:Q11424 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
LIMIT 50
```

#### 3.2.3 Filtre Wikimedia Noise

Avant toute autre classification, un filtre binaire exclut les entités dont le P31 est un type Wikimedia interne. Ce filtre s'applique aux entrants et aux sortants :

```js
const WIKIMEDIA_NOISE_TYPES = new Set([
  'Q4167836',   // Wikimedia category page
  'Q4167410',   // Wikimedia disambiguation page
  'Q11266439',  // Wikimedia template
  'Q13406463',  // Wikimedia list article
  'Q17442446',  // Wikimedia internal item (propagé: 88K)
  'Q15184295',  // Wikimedia module
  'Q17633526',  // Wikinews article
  'Q13406463',  // Wikimedia list article
]);
```

Ce filtre seul élimine ~10% de toutes les instances P31 et réduit massivement le bruit dans le graphe.

### 3.3 Context Resolver

#### 3.3.1 Principe

Le Context Resolver est une fonction pure :

```
Entrée  : types P31 de l'entité explorée (ex: ["Q6256"])
Sortie  : Set de PIDs à promouvoir en primary (ex: {"P36", "P37", "P38"})
```

Il ne remplace pas le jugement humain — il le propage. Un humain (toi) écrit une fois le mapping entre les grandes familles de types et les PIDs contexte-dépendants à promouvoir. Le Context Resolver applique ce mapping automatiquement.

#### 3.3.2 Mapping des familles de types

Basé sur l'analyse du dump (les ~20 classes les plus fréquentes pertinentes pour Gexor) :

| Famille | Q-IDs d'ancrage | PIDs C à promouvoir | Justification |
|---------|----------------|---------------------|---------------|
| **Personne** | Q5 | P27 (nationalité) — seulement si multi-valué | Pertinent pour exilés, naturalisés, doubles nationalités |
| **Pays / État** | Q6256, Q3624078 | P36 (capitale), P37 (langue officielle), P38 (monnaie) | Propriétés structurantes d'un État |
| **Ville / Settlement** | Q486972, Q515, Q13100073 | P17 (pays) — exception au groupe A1 pour ce type | Pour une ville, le pays est informatif même si "dérivable" |
| **Œuvre littéraire** | Q7725634 | P407 (langue de l'œuvre), P123 (éditeur) | Propriétés structurantes d'une œuvre textuelle |
| **Film** | Q11424 | P364 (langue originale) | Propriété structurante d'un film |
| **Taxon** | Q16521 | — | Pas de PIDs C pertinents (les PIDs bio sont déjà D ou B) |
| **Organisation** | Q43229, Q4830453 | P17 (pays), P37 (langue) si multi-national | Localisation pertinente pour les organisations |
| **Lieu géographique** | Q8502, Q4022, Q23442 | P17 (pays) | Idem villes |
| **Album musical** | Q482994 | P407 (langue) | Pertinent pour musique non-anglophone |
| **Peinture** | Q3305213 | P138 (nommé en l'honneur de) | Pertinent pour tableaux historiques/religieux |

#### 3.3.3 Utilisation du dump P279

Avec un arbre de profondeur max 5 et une profondeur moyenne de 0.85, la stratégie est simple :

1. **Matching direct** — Si le P31 de l'entité est dans la table de mapping → appliquer la règle.
2. **Fallback P279 (1 saut max)** — Si le P31 n'est pas dans la table, remonter d'un cran via P279 et vérifier.
3. **Fallback conservatif** — Si aucune ancre trouvée → les PIDs C restent secondaires (comportement actuel inchangé, toggle manuel possible).

Étant donné la platitude de l'arbre, un seul saut P279 suffit dans 97.8% des cas (depth 0 + depth 1). Le lookup peut être un fichier statique de ~5 KB (50 Q-IDs → règles) chargé au démarrage de l'application.

### 3.4 Déduplication par groupe de redondance (axe A)

#### 3.4.1 Logique

Pour chaque groupe de redondance A, un seul PID survit comme arête primaire. Le survivant est le plus spécifique selon la hiérarchie documentée dans le JSON :

**A1 — Localisation géographique** :
- Hiérarchie : P625 (coordonnées) → P131 (entité admin.) → P17 (pays) → P30 (continent)
- Règle : garder uniquement le PID le plus spécifique PRÉSENT dans les claims de l'entité
- Si l'entité a P131 et P17, garder P131 seul
- Si l'entité n'a que P17, garder P17
- Exception : si l'entité est elle-même un lieu (détecté par le Context Resolver), P17 est promu même si P131 existe

**A2 — Lieux biographiques** :
- P19 (lieu de naissance) et P20 (lieu de mort) sont toujours primaires (axe D)
- P27 (nationalité), P551 (résidence), P937 (lieu de travail) sont secondaires sauf si promus par le Context Resolver
- P119 (lieu de sépulture) est toujours secondaire

**A3 — Territoire et juridiction** :
- P17 (pays) ou P131 (entité admin.) survivent
- P1001 (applies to jurisdiction), P194 (assemblée législative) sont toujours secondaires

#### 3.4.2 Implémentation

La fonction `getRedundancyGroupForPid()` existe déjà dans `propertyClassification.js` et retourne le groupKey + la priorité dans la hiérarchie. Ce qui manque est la logique qui, pour un ensemble de claims d'une entité donnée, filtre les doublons :

```
Pour chaque groupe A actif dans les claims de l'entité :
  1. Lister tous les PIDs de ce groupe présents dans les claims
  2. Trier par priorité hiérarchique (isPreferred d'abord, puis priority croissante)
  3. Garder le premier → tier 'primary'
  4. Tous les autres → tier 'secondary'
```

### 3.5 Nœuds agrégateurs

#### 3.5.1 Le concept

Au lieu d'afficher N nœuds individuels qui saturent le graphe, un seul nœud agrégateur dit "47 articles scientifiques" — cliquable et expandable.

```
              [Napoléon]
             /    |     \        \
    [Waterloo] [France]  [📚 47 articles]  [🎬 12 films]
                                  │
                            (clic → expand)
                            /    |    \
                     [Art. 1] [Art. 2] [Art. 3] ...
```

#### 3.5.2 Quand agréger vs afficher individuellement

Le seuil est basé sur le count de la requête groupée SPARQL :

| Count | Comportement |
|------:|-------------|
| 1-5 | Nœuds individuels affichés directement dans le graphe |
| 6-30 | Nœud agrégateur expandable dans le graphe (clic → charge et affiche les nœuds individuels) |
| 31-500 | Nœud agrégateur avec panneau latéral paginé et filtrable |
| 500+ | Nœud agrégateur avec filtre obligatoire avant expand (sous-filtre par P31, par date, par lieu, etc.) |

Ces seuils sont configurables et pourront être ajustés en fonction des retours utilisateurs.

#### 3.5.3 Modèle de données

Nouveau type de nœud dans le store :

```js
// Nouveau : AggregateNode
{
  id: 'agg:Q517:P921:Q13442814',      // convention de nommage
  type: 'aggregate',
  sourceUri: 'http://www.wikidata.org/entity/Q517',
  predicate: 'P921',                    // PID entrant
  predicateLabel: 'sujet principal',
  targetClass: 'Q13442814',             // type P31 des entités agrégées
  targetClassLabel: 'scholarly article',
  count: 3105,
  direction: 'incoming',                // entrant vers l'entité source
  expanded: false,
  children: [],                         // rempli au clic
  loadingChildren: false,
}
```

Le LodEdge reliant l'entité à l'agrégateur :

```js
{
  id: 'Q517-P921-agg:Q13442814',
  source: 'http://www.wikidata.org/entity/Q517',
  target: 'agg:Q517:P921:Q13442814',
  predicate: 'P921',
  label: 'sujet principal',
  direction: 'incoming',
  classification: 'aggregate',
  count: 3105,
}
```

#### 3.5.4 Rendu 3D

Le nœud agrégateur a un style visuel distinct des nœuds classiques :

- **Forme** : sphère avec halo ou texture "multi-bulles" (suggère la multiplicité)
- **Taille** : proportionnelle au log du count (un agrégateur de 3000 n'est pas 1000x plus gros qu'un de 3)
- **Couleur** : basée sur le type P31 agrégé (même code couleur que les nœuds individuels de ce type, mais avec transparence)
- **Label** : toujours visible — "47 articles scientifiques" ou "🎬 12 films"
- **Compteur** : badge numérique visible sans hover
- **Interaction au clic** : expand (petits groupes) ou ouverture du panneau filtrable (gros groupes)
- **Interaction au hover** : tooltip avec détails (PID entrant, type, count, "cliquer pour explorer")

#### 3.5.5 Cas d'usage par domaine

**Recherche scientifique** — Un chercheur explore CRISPR-Cas9 (Q23000981). Le nœud agrégateur "3 200 scholarly articles" lui dit immédiatement l'ampleur de la littérature. Il peut filtrer par date, par journal, par auteur.

**Biologie** — Un explorateur regarde une maladie (ex: Q12078). Agrégateur "12 gènes associés" (via P2293 genetic association). Expand montre les gènes individuels.

**Géographie** — France (Q142). Agrégateur "3 400 villes" (P17 entrant filtré par P31=Q515). L'utilisateur peut filtrer par population, région, etc.

**Histoire** — Napoléon (Q517). Agrégateur "156 œuvres" (P921 entrant) avec sous-groupes par type : 47 articles, 12 films, 23 livres, 74 peintures.

**Culture** — Léonard de Vinci (Q762). Agrégateur "42 peintures" (P170 entrant, "créateur"). Expand montre La Joconde, La Cène, etc.

### 3.6 Classification directionnelle des PIDs

#### 3.6.1 Le problème

Un même PID a une pertinence différente selon la direction :

| PID | Sortant (entité → cible) | Entrant (cible → entité) |
|-----|--------------------------|--------------------------|
| P17 (pays) | Secondary (redondant avec P131) | Bruit massif (millions d'entités) → agrégateur géant |
| P921 (sujet principal) | Primary (ce livre parle de X) | Très pertinent (tous les livres/films sur X) → agrégateur |
| P22 (père) | Primary (relation familiale) | Primary inversé (= P40 enfant) → nœuds individuels |
| P131 (entité admin.) | Primary (localisation) | Modéré (toutes les entités dans cette ville) → agrégateur |
| P161 (acteur) | Primary (casting d'un film) | Pertinent (filmographie d'un acteur) → agrégateur |

#### 3.6.2 Solution via les agrégateurs

Au lieu d'un système de classification binaire "primary/secondary" par direction (trop rigide), les agrégateurs résolvent le problème naturellement :

- **Tous les PIDs entrants produisent des agrégateurs** lors de la requête groupée SPARQL
- Le **count** détermine l'affichage : 3 résultats → nœuds individuels, 50 → agrégateur expandable, 10 000 → agrégateur avec filtre obligatoire
- Le **Context Resolver** peut influencer les seuils : pour une personnalité, P921 entrant peut avoir un seuil d'agrégation plus haut (montrer les 10 premières œuvres individuellement au lieu de les agréger dès 6)

Ce système est auto-adaptatif : pas besoin de classifier manuellement chaque PID par direction. Le count réel fait le travail.

### 3.7 LodEdge enrichi

Le modèle `createLodEdge` existant porte déjà `classification` et `redundancyGroup`. Champs à ajouter :

```js
{
  // ... champs existants ...
  tier: 'primary' | 'secondary' | 'hidden' | 'aggregate',
  direction: 'outgoing' | 'incoming',
  contextPromoted: false,         // true si un PID C a été promu par le Context Resolver
  weight: 100,                    // pour le tri/affichage (primary=100, C promu=90, unclassified=70, secondary=30)
  redundancyRank: null,           // position dans la hiérarchie du groupe A (1=plus spécifique)
  aggregateCount: null,           // nombre d'entités agrégées (pour les edges vers agrégateurs)
}
```

---

## 4. Impact sur les Composants Existants

### 4.1 `wikidata.js` — fetchNeighbors

**Ce qui change** : L'itération sur les claims passe par le pipeline de classification avant d'appliquer le limit. Deux nouvelles fonctions sont ajoutées : `fetchIncomingAggregates` (SPARQL groupé) et `fetchAggregateChildren` (SPARQL expand).

**Ce qui ne change pas** : Le mécanisme de batch-fetch labels via l'Action API, le throttling, le cache de PIDs.

### 4.2 `propertyClassification.js`

**Ce qui change** : Ajout d'une fonction `resolveContext(types)` qui prend les P31 de l'entité et retourne les PIDs C à promouvoir. Ajout d'une fonction `deduplicateRedundancyGroup(claims, groupKey)` qui filtre les doublons A.

**Ce qui ne change pas** : Toutes les fonctions existantes (`classifyPid`, `getAlwaysPrimaryPids`, etc.) restent inchangées.

### 4.3 `lodNode.js`

**Ce qui change** : Ajout d'un factory `createAggregateNode()` pour les nœuds agrégateurs.

**Ce qui ne change pas** : `createLodNode`, `createLodEdge`, `createSource` restent inchangés. Le LodEdge reçoit de nouveaux champs optionnels (rétrocompatible).

### 4.4 `dataSlice.js`

**Ce qui change** : `fetchAndExpandNode` orchestre les deux requêtes (sortants Action API + entrants SPARQL groupé). Nouveau state : `loadedAggregates` (Map des agrégateurs). Nouvelle action : `expandAggregate(aggregateId)`.

**Ce qui ne change pas** : `searchWikidata`, `initFromEntity`, `refreshNode`, le cache IndexedDB.

### 4.5 `graphSlice.js`

**Ce qui change** : `updateGraphData` intègre les agrégateurs comme nœuds du graphe. Le système `isPidActiveForGraph` est remplacé par un système à 3 tiers (primary auto-actif, secondary togglable, hidden jamais). Les nœuds agrégateurs ont leur propre logique de BFS (pas d'expansion automatique au-delà du nœud agrégateur lui-même).

**Ce qui ne change pas** : Le BFS multi-sources, le pinning, le mécanisme de `wakeSimulation`.

### 4.6 `SettingsPanel.jsx`

**Ce qui change** : Ajout d'une section "Agrégateurs" permettant de configurer les seuils. Le Context Resolver peut être surpassé manuellement (l'utilisateur peut promouvoir/rétrograder un PID C quelle que soit la décision automatique).

**Ce qui ne change pas** : L'organisation par catégories (primary/context-dependent/secondary/unclassified) et les toggles individuels.

### 4.7 Rendu 3D (Graph/)

**Ce qui change** : Nouveau type de sprite/mesh pour les nœuds agrégateurs. Handler de clic spécifique (expand ou panneau). Animation de matérialisation quand un agrégateur est expandé.

---

## 5. Fichier de configuration statique — Context Resolver

Le Context Resolver n'a pas besoin du dump de 370 MB au runtime. Il a besoin d'un fichier de lookup statique, produit offline à partir du dump, de la forme :

```json
{
  "_description": "Mapping type P31 → PIDs contexte-dépendants à promouvoir",
  "_version": "1.0",
  "rules": {
    "Q5":       { "label": "human",           "promote": ["P27"],  "conditions": { "P27": "multi-valued-only" } },
    "Q6256":    { "label": "country",          "promote": ["P36", "P37", "P38"] },
    "Q3624078": { "label": "sovereign state",  "promote": ["P36", "P37", "P38"] },
    "Q515":     { "label": "city",             "promote": ["P17"] },
    "Q486972":  { "label": "human settlement", "promote": ["P17"] },
    "Q13100073":{ "label": "village of China",  "promote": ["P17"] },
    "Q7725634": { "label": "literary work",    "promote": ["P407", "P123"] },
    "Q11424":   { "label": "film",             "promote": ["P364"] },
    "Q482994":  { "label": "album",            "promote": ["P407"] },
    "Q3305213": { "label": "painting",         "promote": ["P138"] },
    "Q43229":   { "label": "organization",     "promote": ["P17"] },
    "Q4830453": { "label": "enterprise",       "promote": ["P17"] },
    "Q16521":   { "label": "taxon",            "promote": [] },
    "Q8502":    { "label": "mountain",         "promote": ["P17"] },
    "Q4022":    { "label": "river",            "promote": ["P17"] },
    "Q23442":   { "label": "island",           "promote": ["P17"] },
    "Q3918":    { "label": "university",       "promote": ["P17", "P37"] },
    "Q33506":   { "label": "museum",           "promote": ["P17"] },
    "Q178561":  { "label": "battle",           "promote": [] },
    "Q198":     { "label": "war",              "promote": [] }
  },
  "wikimedia_noise_types": [
    "Q4167836", "Q4167410", "Q11266439", "Q13406463",
    "Q17442446", "Q15184295", "Q17633526"
  ],
  "aggregate_types": {
    "_description": "Types P31 qui devraient toujours être agrégés (jamais en nœuds individuels entrants)",
    "types": [
      "Q13442814", "Q30612", "Q13433827", "Q101352",
      "Q7187", "Q8054"
    ]
  }
}
```

Ce fichier fait ~2 KB. Il est maintenu manuellement et versionné dans le repo. Il peut être étendu progressivement à mesure que de nouveaux use-cases apparaissent.

---

## 6. Roadmap d'Implémentation

### Phase 1 — Quick wins (impact immédiat, code minimal)

| Tâche | Effort | Impact |
|-------|--------|--------|
| Ajouter le filtre Wikimedia Noise Types dans `fetchNeighbors` | 30 min | Élimine ~10% du bruit |
| Corriger la dédup A1 : P131 ne doit pas être filtré quand c'est le PID le plus spécifique | 1h | Restaure des arêtes géographiques manquantes |
| Les PIDs unclassified `wikibase-item` sont primary par défaut (pas exclus) | 30 min | Couverture des domaines de niche |

### Phase 2 — Pipeline de classification (refonte du fetch)

| Tâche | Effort | Impact |
|-------|--------|--------|
| Créer `classifyEdge(pid, entityTypes, claims)` — pipeline Gate→Classify→Dedup→Rank | 3h | Fetch intelligent avec limit par tier |
| Créer `contextResolver.js` avec le fichier de mapping statique | 2h | Promotion automatique des PIDs C |
| Refactorer `fetchNeighbors` pour utiliser le nouveau pipeline | 2h | Le limit=50 n'est plus aveugle |
| Tests unitaires sur les cas documentés (Napoléon, France, Mona Lisa) | 2h | Validation du pipeline |

### Phase 3 — Relations entrantes et agrégateurs

| Tâche | Effort | Impact |
|-------|--------|--------|
| Créer `fetchIncomingAggregates(uri)` — requête SPARQL groupée | 2h | Première version des backlinks |
| Créer le modèle `AggregateNode` dans lodNode.js | 1h | Structure de données |
| Intégrer les agrégateurs dans `dataSlice` et `graphSlice` | 3h | Affichage dans le graphe |
| Créer `expandAggregate()` — requête SPARQL ciblée | 2h | Expand on-demand |
| Rendu 3D des nœuds agrégateurs (sprite distinct) | 3h | Distinction visuelle |
| Panneau latéral pour les gros agrégateurs (>30 entités) | 3h | Navigation dans les groupes massifs |

### Phase 4 — Polish et configuration utilisateur

| Tâche | Effort | Impact |
|-------|--------|--------|
| Seuils d'agrégation configurables dans le SettingsPanel | 2h | Personnalisation |
| Override manuel du Context Resolver dans le SettingsPanel | 1h | Contrôle utilisateur |
| Pré-calcul offline des résolutions P279 pour les 878 classes couvrant 95% | 2h | Performance |
| Cache spécifique pour les comptages d'agrégateurs (TTL plus long) | 1h | Réduction des requêtes SPARQL |

---

## 7. Décisions ouvertes

**7.1** — Faut-il charger le dump P279 complet dans un Web Worker pour permettre le filtrage par type dans le graphe ("ne montrer que les personnes") ? Ou un fichier de lookup pré-calculé suffit-il ?

Recommandation : commencer avec le lookup statique (~50 classes). Le Worker est un investissement pour la Phase 4+ quand le filtrage par type sera demandé par les utilisateurs.

**7.2** — Les nœuds agrégateurs doivent-ils participer au force layout (avoir une position physique calculée) ou avoir une position fixe relative à leur entité source ?

Recommandation : position physique dans le layout, mais avec une masse/charge différente (plus léger, attirés plus fortement vers l'entité source).

**7.3** — Quand un agrégateur est expandé, les nœuds individuels remplacent-ils l'agrégateur ou s'ajoutent-ils en dessous ?

Recommandation : remplacement — l'agrégateur disparaît et ses children prennent sa place dans le graphe. Un bouton "re-collapse" permet de revenir à l'agrégateur.

**7.4** — Le Context Resolver doit-il être exposé à l'API publique future (B2B) pour permettre à des clients de définir leurs propres règles de promotion ?

Recommandation : oui à terme (fichier de config uploadable), mais hors scope actuel.

**7.5** — Comment gérer les entités multi-typées (ex: Napoléon est Q5 human + Q36180 writer) ? Quelle règle de promotion gagne ?

Recommandation : union des promotions. Si Q5 promeut P27 et Q36180 promeut P407, l'entité obtient les deux promotions.
