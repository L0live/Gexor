# Gexor — Documentation d'Implémentation Complète

> **Version** : 1.2  
> **Date** : Mars 2026  
> **Statut** : Document de référence — vision produit et architecture technique  
> **Base existante** : Gexor (moteur 3D fonctionnel + backend Fastify + pipeline Wikidata)  
> **IA** : hors périmètre actuel → voir `GEXOR_IA_FUTURE.md`

---

## Table des matières

1. [Vision & Positionnement](#1-vision--positionnement)
2. [Architecture Globale](#2-architecture-globale)
3. [Couche Données — SPARQL Fédéré](#3-couche-données--sparql-fédéré)
4. [Moteur 3D — Architecture existante](#4-moteur-3d--architecture-existante)
5. [Système de Parcours](#5-système-de-parcours)
6. [Modes de Visualisation & Plugins](#6-modes-de-visualisation--plugins)
7. [Annotations & Blocs-notes 3D](#7-annotations--blocs-notes-3d)
8. [Sourçage Atomique](#8-sourçage-atomique)
9. [Modèle Économique & Tiers](#9-modèle-économique--tiers)
10. [Couche Contenu Éducatif](#10-couche-contenu-éducatif)
11. [Infrastructure & Performance](#11-infrastructure--performance)
12. [Roadmap d'Implémentation](#12-roadmap-dimplémentation)
13. [Zones d'Ombre & Décisions Ouvertes](#13-zones-dombre--décisions-ouvertes)

---

## 1. Vision & Positionnement

### Définition

Gexor est un **navigateur immersif du savoir mondial** qui explore le Linked Open Data (LOD) cloud en temps réel via SPARQL fédéré, dans une scène 3D interactive.

**Nom complet :** Gexor — Graph Exploration of RDFS  
**Tagline :** *Explore la connaissance comme un univers.*

### Ce que Gexor n'est pas

- Ce n'est pas un moteur de recherche (pas d'index propriétaire)
- Ce n'est pas une encyclopédie (pas de contenu hébergé)
- Ce n'est pas un outil académique réservé aux experts

### Ce que Gexor est

- Un **layer de navigation** sur le LOD cloud existant
- Une **UX d'exploration** que le LOD n'a jamais eu
- Un **outil éducatif** qui rend la connaissance structurée accessible au grand public

### Utilisateurs cibles

**Primaires :**
- Autodidactes curieux (25–45 ans), passionnés d'histoire, géopolitique, sciences
- Étudiants en recherche exploratoire

**Secondaires :**
- Enseignants construisant des parcours pédagogiques
- Établissements scolaires (packs curriculum)
- Créateurs de contenu éducatif

---

## 2. Architecture Globale

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                          GEXOR                                   │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────────────────┐  │
│  │  COUCHE        │  │  BACKEND       │  │  COUCHE MOTEUR 3D                │  │
│  │  DONNÉES       │  │  FASTIFY       │  │  React Three Fiber / Three.js   │  │
│  │  Wikidata API  │◀▶│  Cache PG      │◀▶│  @antv/layout-wasm / Zustand    │  │
│  │  (+future T2/3)│  │  Proxy image   │  │                                │  │
│  └──────────────┘  └───────────────┘  └──────────────┬───────────────┘  │
│                                                       │                      │
│  ┌────────────────────────────────────────────────────▼──────────────────┐  │
│  │                       COUCHE UX                             │  │
│  │   Modes / Plugins / Annotations / Parcours / Sourçage       │  │
│  └─────────────────────────────────────────┬──────────────────┘  │
│                                            │                      │
│  ┌─────────────────────────────────────────▼──────────────────┐  │
│  │                    COUCHE CONTENU                           │  │
│  │      Packs scolaires / Parcours éditoriaux / Marketplace    │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Principes architecturaux fondamentaux

**Gexor ne stocke pas de données de connaissance.** Toute la connaissance vit dans le LOD cloud. Gexor stocke uniquement : les profils utilisateurs, les annotations, les parcours sauvegardés, le cache de performance (PostgreSQL).

**Wikidata est le hub central.** Toute entité est identifiée par un Q-ID Wikidata. Le backend Fastify consolide les appels vers l'API Wikidata (Action API + SPARQL), met en cache les résultats dans PostgreSQL, et proxie les images Wikimedia Commons. Les autres endpoints (Tier 2/3) sont des enrichissements optionnels activés selon le contexte.

**La caméra est la pagination.** Le frustum de la caméra détermine quelles données sont chargées. Se déplacer dans la scène = requêter de nouvelles données. S'éloigner = libérer la mémoire.

**Les parcours sont des trajectoires de graphe.** Ils sont calculés par des algorithmes de pathfinding sur la structure réelle du LOD, sans génération de contenu par IA.

---

## 3. Couche Données — SPARQL Fédéré

### Principe général

Quand l'utilisateur explore un nœud, Gexor déclenche une séquence de requêtes SPARQL pour charger ses propriétés, ses relations directes, et ses enrichissements cross-endpoints. Ces requêtes sont asynchrones, parallèles quand possible, et leur résultat alimente directement le graphe 3D.

### Hiérarchie des endpoints

**Tier 1 — Hub central (toujours actif)**
- Wikidata (`query.wikidata.org`) : identités, propriétés de base, identifiants de liaison vers tous les autres endpoints. CC0. ~15 milliards de triples.

**Tier 2 — Enrichissement automatique (activé selon les propriétés détectées)**
- Si l'entité a un VIAF ID → requête BnF, LoC, GND
- Si l'entité a un GeoNames ID → requête GeoNames pour données géographiques
- Si l'entité a un Getty ULAN ID → requête Getty pour données artistiques
- Si l'entité a un DOI/ORCID → requête OpenCitations pour données académiques
- Si l'entité a un Europeana ID → requête Europeana pour patrimoine culturel

**Tier 3 — Endpoints spécialisés (activés par plugin ou domaine)**
- Pleiades : entités de l'Antiquité gréco-romaine
- UniProt + ChEMBL : entités biologiques et chimiques
- Louvre, Rijksmuseum, British Museum : œuvres d'art
- PeriodO : périodes historiques
- Nomisma : numismatique

### Stratégie de chargement frustum-driven

Le chargement est couplé à la caméra en permanence. Le système fonctionne ainsi :

1. **Zone d'intérêt** : définie par le frustum de la caméra étendu d'un facteur de marge
2. **Priorité de chargement** : les nœuds proches du centre du frustum sont chargés en premier
3. **Déchargement** : les nœuds sortant de la zone étendue libèrent leur mémoire après un délai de grâce (pour éviter les rechargements lors de mouvements de caméra rapides)
4. **Profondeur** : seules les relations de profondeur 1 sont chargées à la volée. L'utilisateur peut demander d'étendre à profondeur 2 ou 3 sur demande explicite

### Stratégie de cache

> **État actuel (✅ implémenté) :** cache 3 tiers fonctionnel — L1 mémoire frontend (Map, 10 min), L2 PostgreSQL (24h–30j par domaine), L3 tables dédiées labels (pid_labels, qid_labels, 30j).

**Cache mémoire (session)** : les entités visitées restent en mémoire pendant la session courante via `cacheService.js` frontend (Map avec TTL 10 min). Idéal pour la navigation aller-retour.

**Cache persistant (PostgreSQL)** : le backend Fastify met en cache les entités et leurs relations dans la table `cache_entries` avec TTL configurable. Wikidata = 24h, données culturelles = 7 jours, données géographiques = 30 jours. Le `labelResolver` utilise des tables dédiées (`pid_labels`, `qid_labels`) avec TTL 30 jours et batch-populate.

**Invalidation** : forçable manuellement par l'utilisateur via un bouton "Actualiser depuis la source". Utile pour les entités dynamiques (personnalités vivantes, données géopolitiques).

### Gestion des endpoints défaillants

Chaque requête a un timeout configurable (défaut : 5 secondes). En cas d'échec :

- Le nœud s'affiche en mode dégradé (données Wikidata seules)
- Une pastille visuelle indique que l'enrichissement n'est pas disponible
- Un retry automatique se déclenche après 30 secondes
- L'utilisateur peut forcer un retry via l'interface
- Les endpoints défaillants sont mis en liste noire temporaire (15 minutes) pour éviter de saturer les requêtes

### Normalisation des données inter-endpoints

Chaque endpoint a ses propres modèles de données (CIDOC-CRM pour les musées, EDM pour Europeana, schema.org pour DBpedia...). La couche de normalisation traduit tout vers un modèle interne unifié de Gexor :

- **Nœud** : identifiant canonique (Q-ID), label, type, propriétés clés, coordonnées temporelles, coordonnées géographiques, identifiants cross-sources
- **Relation** : source, cible, type sémantique normalisé, confiance, source de provenance
- **Source** : endpoint d'origine, URL de la ressource, licence, date de consultation

---

## 4. Moteur 3D — Architecture existante

### Ce qui est conservé intégralement

Le moteur de rendu existant est solide et directement réutilisable :

- **Stack R3F + Three.js + @antv/layout-wasm** : aucun changement
- **InstancedMesh pour nœuds et arêtes** : performances validées, enrichi avec pulse verte (nœuds ajoutés) et contour bleu (sélection)
- **SharedArrayBuffer + zero-copy** : communication layout → rendu
- **Zustand 5 slices** : architecture state conservée, **dataSlice** enrichi avec `nodeSettings` (paramètres par nœud), **pinSlice** réduit au verrouillage de position, **graphSlice** filtre direction par nœud
- **TrackballControls** : navigation orbitale conservée
- **LoD labels/sphères** : conservé et enrichi (contour sélection + pulse)
- **Pinning** : découplé — `pinSlice` = position lock uniquement, profondeur/direction/radial dans `nodeSettings`
- **BFS multi-sources** : racines = union de `pinnedNodes` + `nodeSettings` keys avec `depth > 0`
- **Undo/redo** : conservé, expand/collapse agrégats appelle `saveToHistory()`
- **Minimap** : conservée

### Évolutions requises

**Remplacement du data layer (✅ fait)**

Le `dataSlice` charge désormais les données depuis le backend Fastify via des appels API REST (`/api/entity/:qid/expand`, `/api/entity/:qid/incoming-aggregates`, etc.). Le pipeline classify-first classe chaque PID avant de récupérer les voisins, avec des budgets par tier (D→all, C promoted→all, unclassified→20, A→survivor). Le Context Resolver promeut automatiquement les PIDs context-dependent selon le type P31 de l'entité (20 familles dans `contextRules.json`). Les références entrantes sont regroupées par SPARQL (PID × P31 type × count) et affichées comme nœuds agrégateurs (hexagones violets).
**Paramètres par nœud (✅ fait)**

`dataSlice.nodeSettings` est un map `{ [uri]: settings }` contenant par nœud : `depth`, `explorationDirection` (défaut `'incoming'`), `renderMode`, `radialStrength`, etc. Créé via `defaultNodeSettings()`. La direction d’exploration n’est plus globale — chaque nœud pinné/expandé peut indépendamment fetcher sortant, entrant ou les deux. `graphSlice.isEdgeVisibleForDirection()` filtre les arêtes selon la direction du nœud. Paramètres configurés dans la section « Paramètres » du NodeDetailPanel (pas dans SettingsPanel).

**Système de mise en évidence (✅ fait)**

- **Contour bleu de sélection** (`SELECTION_OUTLINE_COLOR = '#3b82f6'`) : le nœud sélectionné reçoit un contour bleu dans `Node.jsx` et `InstancedNodes.jsx`
- **Pulse verte d’ajout** (`ADDED_PULSE_COLOR = '#22c55e'`, durée 1500ms) : les nœuds ajoutés par `addNodeToGraph` reçoivent une animation de pulse verte qui s’atténue
- `recentlyAddedNodes` dans `dataSlice` : map `{ [uri]: timestamp }` nettoyée après `ADDED_PULSE_DURATION`

**NodeDetailPanel redesign (✅ fait)**

Panneau de détails complètement repensé avec :
- **Sections repliables** (Propriétés, Paramètres, Agrégats) via composant `CollapsibleSection`
- **Mode édition inline** : bouton crayon pour afficher checkboxes + bouton X par relation (supprimer via `removeEdgeFromGraph`)
- **Paramètres par nœud** : direction d’exploration, profondeur BFS, mode radial, force radiale — controls via `NodeSettingsSection`
- **Références cliquables** : toutes les valeurs entités dans les propriétés sont cliquables (`selectNode` + `addNodeToGraph`)
- **Liste d’entités agrégées** : pour les nœuds agrégateurs, affiche les enfants via `AggregateEntityList`

`GroupInfoPanel` a été supprimé de `Gexor.jsx` — ses fonctionnalités sont désormais dans NodeDetailPanel.
**Couplage caméra → chargement**

Un nouveau hook observe en continu la position et l'orientation de la caméra. Quand la caméra se déplace au-delà d'un seuil, il calcule la zone d'intérêt et déclenche les requêtes SPARQL pour les nœuds qui entrent dans le frustum. Ce hook s'intercale entre les contrôles caméra et le data layer.

**Nœuds en état de chargement**

Quand une entité est dans le frustum mais pas encore chargée, elle s'affiche comme un nœud fantôme (opacité réduite, animation de pulsation). Les données arrivent progressivement et le nœud se "matérialise".

**Système de niveaux de détail étendu**

Le LoD existant (labels ↔ sphères) est étendu à plusieurs niveaux :
- **Niveau 0 (très lointain)** : point lumineux, pas de label
- **Niveau 1 (lointain)** : sphère instanciée colorée par type
- **Niveau 2 (moyen)** : sphère + label court
- **Niveau 3 (proche)** : sphère + label complet + icône de type
- **Niveau 4 (très proche / sélectionné)** : rendu enrichi avec aperçu propriétés, image si disponible, pastilles de sources

**Fog atmosphérique et effets de distance**

Le fog est utilisé comme masque naturel pour les zones non chargées. Les bords du graphe chargé fondent visuellement dans le vide plutôt que d'afficher une coupure nette.

**Gestion de la densité**

Pour les entités très connectées (Napoléon sur Wikidata a des centaines de propriétés), seules les relations les plus significatives (par score de confiance et degré) sont affichées par défaut. L'utilisateur peut choisir d'étendre la densité localement autour d'un nœud sélectionné.

**Contrôles caméra animés**

En plus des TrackballControls interactifs, un système d'animation programmatique de la caméra est ajouté pour les parcours. La caméra peut être pilotée par interpolation (lerp/slerp) vers une cible définie — position, orientation, zoom — sans interrompre les contrôles interactifs (l'utilisateur peut reprendre la main à tout moment).

---

## 5. Système de Parcours

### Concept

Un parcours est une **séquence ordonnée de nœuds** avec une trajectoire de caméra calculée algorithmiquement. Il relie des entités du graphe LOD selon un chemin calculé par pathfinding, sans narration générée par IA.

Un parcours n'est pas un mode séparé — c'est une couche posée sur l'exploration libre. L'utilisateur peut sortir d'un parcours à tout moment pour explorer librement, puis reprendre là où il l'a laissé.

### Algorithmes de pathfinding

Le cœur du système de parcours est un moteur de pathfinding qui opère sur le graphe LOD chargé en mémoire.

**BFS pondéré (chemin le plus court)**  
Trouve le chemin de connexions le plus court entre deux nœuds. Utile pour montrer comment deux entités distantes sont reliées dans le graphe. Le poids des arêtes est basé sur le score de confiance de la relation.

**Dijkstra sur graphe sémantique**  
Variante pondérée qui prend en compte la nature des relations. Certains types de relations ont plus de poids que d'autres selon le contexte (ex: une relation `a participé à` est plus forte narrativement qu'une relation `est contemporain de`). Les poids sont configurables par type de relation et peuvent varier selon le mode actif (mode historique vs mode géographique).

**A* avec heuristique thématique**  
Pour les parcours entre nœuds distants où le graphe n'est pas entièrement chargé, A* utilise des heuristiques basées sur les propriétés des nœuds (période temporelle, domaine thématique, type d'entité) pour orienter l'exploration vers des chemins probables sans avoir à charger tout le graphe intermédiaire.

**Expansion progressive**  
Quand aucun chemin direct n'existe entre les nœuds sélectionnés dans le graphe actuellement chargé, le système étend progressivement la profondeur de chargement SPARQL (profondeur 2, puis 3) jusqu'à trouver une connexion ou atteindre la limite de profondeur définie.

### Modes de création d'un parcours

**Mode sélection manuelle**  
L'utilisateur sélectionne N nœuds dans l'ordre qu'il souhaite (Ctrl+clic ou lasso). Chaque nœud devient une étape. Le pathfinding calcule les nœuds intermédiaires entre chaque paire d'étapes consécutives pour créer un chemin continu dans le graphe.

**Mode point à point**  
L'utilisateur sélectionne un nœud de départ et un nœud d'arrivée. Le pathfinding calcule le chemin optimal entre les deux selon l'algorithme choisi. Les étapes intermédiaires sont les nœuds traversés par le chemin calculé.

**Mode construction manuelle complète**  
L'utilisateur ajoute les étapes une par une depuis l'interface de création, sans pathfinding automatique. Chaque étape est un nœud choisi explicitement. Utile pour les créateurs de packs éditoriaux qui veulent un contrôle total.

**Mode enregistrement depuis l'exploration**  
Pendant une exploration libre, l'utilisateur peut activer l'enregistrement de parcours. Chaque nœud visité (cliqué) est ajouté automatiquement comme étape. L'utilisateur arrête l'enregistrement et obtient un parcours basé sur son chemin d'exploration réel.

### Trajectoire de caméra

La caméra ne se déplace pas en ligne droite entre deux nœuds. Elle suit une courbe spline calculée à partir des positions 3D des étapes successives :

- **Courbe de Bézier cubique** entre chaque paire d'étapes, avec points de contrôle calculés pour éviter les clusters denses
- **Altitude de vol adaptative** : plus la distance entre deux étapes est grande, plus la caméra monte en altitude avant de redescendre
- **Regard anticipé** : la caméra commence à orienter son regard vers l'étape suivante avant d'y arriver
- **Vitesse variable** : ralentissement à l'approche d'une étape, accélération entre les étapes
- **Reprise de contrôle** : si l'utilisateur touche les contrôles pendant l'animation, la caméra passe en mode interactif immédiatement. Un bouton "Reprendre le parcours" réapparaît.

### Interface du mode parcours

Pendant la lecture d'un parcours, l'interface affiche :
- Une barre de progression linéaire avec les étapes numérotées
- Le titre de l'étape courante et les propriétés clés du nœud visité (depuis le LOD)
- Les sources correspondant aux propriétés affichées (sourçage atomique)
- Des boutons Précédent / Pause / Suivant
- Un indicateur "Exploration libre" si l'utilisateur a repris le contrôle
- Un bouton "Revenir au parcours" en exploration libre

### Structure de données d'un parcours

Un parcours sauvegardé contient :
- Identifiant unique
- Titre et description (saisis manuellement)
- Liste ordonnée des étapes (chacune avec : Q-ID du nœud, position caméra cible, durée de pause à cette étape, note textuelle optionnelle saisie par le créateur)
- Métadonnées (auteur, date, langue, domaine thématique, niveau scolaire si applicable)
- Paramètres de trajectoire (vitesse de déplacement, type de courbe, altitude de vol)
- Type de parcours (manuel, BFS, Dijkstra, A*)

### Partage et export

Un parcours peut être :
- **Partagé via lien** : l'URL encode l'identifiant du parcours, quiconque l'ouvre voit le même parcours rejoué
- **Publié dans la marketplace** : monétisable par les créateurs
- **Exporté en vidéo** : enregistrement de la session avec la trajectoire de caméra (feature premium, sans narration — l'utilisateur ajoute son propre audio)

---

## 6. Modes de Visualisation & Plugins

### Concept de mode

Un mode est une **lentille de visualisation** sur le même graphe de données. Les nœuds et relations ne changent pas — leur disposition, apparence et les informations mises en avant changent selon le mode actif.

Les modes sont superposables partiellement (ex: mode temporel + coloration géographique) et switchables à la volée sans rechargement de données.

### Modes de base

**Mode Force-Directed (défaut)**  
Le layout physique actuel de Gexor. Les nœuds se repoussent et les relations créent des liens élastiques. Révèle les clusters naturels et les hubs fortement connectés.

**Mode Temporel**  
Les nœuds sont positionnés sur un axe temporel. L'axe X (ou Z) représente le temps, les axes perpendiculaires sont libres pour le layout force. Les entités sans date précise flottent dans une zone "atemporal". La caméra peut survoler la frise de gauche à droite. Nécessite la propriété date de naissance/création de Wikidata.

**Mode Géographique**  
Les nœuds sont projetés sur une carte 3D sphérique ou plane selon leurs coordonnées géographiques (GeoNames ID ou coordonnées Wikidata). Les entités sans géolocalisation flottent au-dessus de la carte. Permet de voir les concentrations spatiales d'entités liées.

**Mode Hiérarchique**  
Les relations de type `sous-classe de`, `partie de`, `membre de` sont utilisées pour construire une arborescence verticale. Révèle les structures taxonomiques et les héritages conceptuels.

**Mode Thématique / Constellation**  
Les nœuds sont regroupés par cluster thématique calculé par algorithme de détection de communautés (Louvain ou modularity clustering) sur la base des propriétés Wikidata. Chaque cluster forme une "constellation" avec un nœud central représentatif. Les connexions inter-clusters sont affichées comme des arcs lumineux.

**Mode Bipartite**  
Sépare visuellement deux types d'entités (ex: personnes d'un côté, événements de l'autre) pour rendre lisibles les relations entre catégories.

### Système de plugins

Un plugin est un module qui :
1. Active un ou plusieurs endpoints spécialisés
2. Peut modifier l'apparence des nœuds concernés
3. Peut ajouter des interactions spécifiques
4. Peut ajouter des filtres dédiés à l'UI

**Exemples de plugins intégrés :**

- **Plugin Antiquité** : active Pleiades (lieux antiques) + Nomisma (monnaies) + SNAP:DRGN (personnes). Les nœuds antiques reçoivent une apparence visuelle distincte.
- **Plugin Sciences de la vie** : active UniProt + ChEMBL + Reactome. Les entités biologiques affichent des propriétés spécifiques (séquences, voies métaboliques).
- **Plugin Patrimoine FR** : active BnF + Louvre + Europeana avec filtrage sur le patrimoine francophone.
- **Plugin Académique** : active OpenCitations + DBLP + CrossRef. Les publications et citations deviennent navigables.

**Marketplace de plugins (futur)** : les développeurs tiers peuvent créer et publier des plugins qui s'intègrent dans Gexor.

### Filtres globaux

Indépendants des modes, toujours disponibles :
- Par type d'entité (personne, lieu, événement, concept, organisation...)
- Par plage temporelle (slider double)
- Par langue de la source principale
- Par endpoint source
- Par degré de connexion
- Par confiance (seuil minimum sur le score de confiance des relations)
- Par domaine thématique (tags Wikidata)

---

## 7. Annotations & Blocs-notes 3D

### Concept

Les annotations sont des **objets ancrés dans l'espace 3D** de la scène, attachés à un nœud ou flottants à une position arbitraire. Elles persistent entre les sessions et sont propres à chaque utilisateur (ou partagées si l'utilisateur le choisit).

### Types d'annotations

**Bloc-note textuel**  
Fenêtre flottante avec éditeur de texte riche (markdown). Ancré à un nœud ou à une position dans l'espace. Redimensionnable. Peut contenir du texte, des listes, des liens vers d'autres nœuds Gexor.

**Marqueur**  
Simple indicateur visuel coloré sur un nœud, avec un label court. Utile pour marquer des entités à revisiter ou catégoriser manuellement.

**Annotation de relation**  
Texte attaché à une arête spécifique entre deux nœuds, pour commenter une relation ("à vérifier", "contre-exemple", "source contradictoire"...).

**Groupe visuel**  
Enveloppe translucide qui regroupe visuellement un ensemble de nœuds sélectionnés manuellement. Peut être nommé et coloré.

### Comportement dans la scène

Les annotations sont des objets billboarded (toujours face à la caméra) ou ancrés en 3D fixe selon la préférence de l'utilisateur. Elles respectent le LoD : à grande distance, elles se réduisent à une icône. En s'approchant, le contenu devient lisible.

Les annotations ne bloquent pas la navigation. Elles sont semi-transparentes et passent en arrière-plan visuel quand la caméra s'en éloigne.

### Stockage

Les annotations sont stockées côté serveur Gexor. Elles référencent les nœuds par leur Q-ID canonique, ce qui les rend robustes aux mises à jour des données LOD.

### Partage

Une annotation ou un ensemble d'annotations peut être exporté comme un "calque" partageable. Un autre utilisateur peut importer ce calque sur sa propre session d'exploration.

---

## 8. Sourçage Atomique

### Principe

Chaque information affichée dans Gexor porte son origine. "Atomique" signifie que le sourçage est au niveau de la propriété individuelle, pas au niveau du nœud entier.

Exemples :
- La date de naissance de Napoléon vient de Wikidata (P569) → pastille Wikidata
- Son portrait vient de Wikimedia Commons → pastille Commons avec licence CC0
- Une notice biographique vient de BnF → pastille BnF avec licence Gallica

### Affichage dans l'UI

**Pastilles discrètes** : chaque propriété dans le panneau de détail affiche une micro-icône de source (logo de l'endpoint + licence abrégée). Au survol, un tooltip affiche l'URL complète de la ressource, la date de consultation, et la licence détaillée.

**Indicateur global sur le nœud** : le nœud 3D porte un indicateur discret du nombre de sources qui le documentent. Plus il est documenté, plus son apparence visuelle peut être enrichie (brillance, taille légèrement augmentée).

**Panneau sources complet** : accessible depuis le panneau de détail, liste toutes les sources contribuant à ce nœud avec liens directs vers les ressources originales.

### Sourçage dans les parcours

Chaque étape d'un parcours affiche les propriétés clés du nœud avec leurs pastilles de source. Le créateur du parcours peut ajouter une note textuelle manuelle à chaque étape — cette note est clairement distinguée des données LOD (typographie différente, indicateur "note du créateur").

### Transparence sur les limites

Quand une propriété est manquante dans toutes les sources disponibles, l'UI l'indique clairement. L'utilisateur sait ce que Gexor sait et ce qu'il ne sait pas.

---

## 9. Modèle Économique & Tiers

### Tier Gratuit

**Accès inclus :**
- Exploration libre du graphe LOD (Wikidata + DBpedia, endpoints Tier 1)
- Modes Force-Directed, Temporel, Géographique
- Filtres de base
- LoD complet
- Création et sauvegarde de 3 parcours (jusqu'à 10 étapes chacun)
- Pathfinding BFS basique
- 10 annotations persistantes
- Sourçage atomique complet

**Limitations :**
- Endpoints Tier 2 et 3 non disponibles
- Plugins désactivés
- Parcours non partageables
- Pas d'export vidéo
- Algorithmes de pathfinding avancés (Dijkstra, A*) non disponibles
- Annotations non synchronisées entre appareils

### Tier Premium (mensuel / annuel)

**Accès inclus :**
- Endpoints Tier 2 et 3 (enrichissements complets)
- Tous les modes de visualisation
- Tous les plugins intégrés
- Parcours illimités, partageables, exportables
- Annotations persistantes et synchronisées multi-appareils
- Tous les algorithmes de pathfinding
- Export vidéo des parcours (sans narration — l'utilisateur ajoute son propre audio)
- Accès marketplace (achat de packs)

### Packs de contenu

**Packs thématiques définitifs (achat unique)**  
Ensembles de parcours éditoriaux sur un domaine : Histoire Moderne, Philosophie, Sciences Fondamentales... Achat une fois, accès à vie.

**Packs vivants (abonnement annuel)**  
Domaines en évolution : Géopolitique, Sciences Climatiques, Tech & Innovation. Mis à jour trimestriellement.

**Packs scolaires (abonnement année scolaire)**  
Alignés sur les curricula officiels. Incluent des outils enseignants : suivi de progression des élèves, création de parcours, export de rapports.

### Marketplace créateurs

Des créateurs externes peuvent publier et monétiser leurs propres parcours. Gexor prend une commission. Les créateurs conservent la propriété de leurs parcours.

---

## 10. Couche Contenu Éducatif

### Philosophie

Le style éducatif est la tonalité de toute la plateforme. Le graphe n'est pas juste beau : il est pédagogiquement intentionnel. Chaque micro-élément est sourcé.

### Parcours scolaires

**Structure d'un parcours scolaire :**
- Alignement sur un programme officiel (niveau, matière, compétence)
- Séquence de nœuds avec notes manuelles rédigées par l'éditeur à chaque étape
- Vocabulaire clé mis en avant avec définitions (saisi manuellement)
- Liens vers les notions prérequises et les approfondissements (autres nœuds du graphe)
- Questions de compréhension optionnelles (saisies manuellement)

**Outils enseignants :**
- Création de parcours personnalisés depuis l'interface Gexor
- Attribution de parcours à une classe
- Tableau de bord de suivi (nœuds explorés, temps passé, étapes complétées)
- Export des parcours en PDF ou présentation

### Export vidéo des parcours

Un parcours peut être enregistré en vidéo. Le processus :

1. La session de parcours est enregistrée (capture de la scène 3D avec la trajectoire de caméra)
2. Les images Wikimedia Commons disponibles pour les nœuds traversés sont intercalées si elles existent (CC0)
3. La vidéo est exportable sans narration — l'utilisateur ajoute sa propre voix, sous-titres, ou diffuse en screencast

### Cartes mentales exportables

La vue courante de la scène peut être exportée en carte mentale 2D (SVG ou PNG) pour des supports de cours ou des présentations.

---

## 11. Infrastructure & Performance

### Frontend

- **Framework** : React 19 (déjà en place)
- **Rendu 3D** : React Three Fiber + Three.js (déjà en place)
- **State management** : Zustand 5 slices (déjà en place, à étendre)
- **Layout WASM** : @antv/layout-wasm avec SharedArrayBuffer (déjà en place)
- **Bundler** : Vite 7 avec configuration COOP/COEP (déjà en place)
- **Styling** : Tailwind CSS 4 (déjà en place)

### Backend Gexor

> **État actuel (✅ implémenté) :** Backend Fastify fonctionnel (`server/`) avec PostgreSQL. Consolide les appels Wikidata (1 round-trip client→backend au lieu de 6-10 client→Wikidata), cache 3 tiers, proxy image COEP, classify-first fetch, SPARQL agrégation entrante.

**Responsabilités actuelles :**
- Consolidation des appels Wikidata (Action API + SPARQL)
- Cache PostgreSQL 3 tiers (mémoire → PG → API)
- Résolution de labels (PID/QID) avec batch-populate
- Classify-first fetch avec budgets par tier
- SPARQL agrégation des références entrantes (GROUP BY PID × P31 type)
- Proxy images Wikimedia Commons (headers CORP pour COEP)
- Rate-limiting côté serveur pour Wikidata

**Responsabilités futures :**
- Authentification et gestion des comptes
- Stockage des annotations utilisateurs
- Stockage des parcours sauvegardés
- Proxy vers les endpoints SPARQL Tier 2/3 (gestion des quotas, retry, fallback)
- Monitoring des endpoints (disponibilité, latence)

**Stack :**
- Node.js 22 + Fastify (choix final — cohérence avec l'écosystème JS du frontend)
- PostgreSQL pour le cache, les labels, et les futures données utilisateurs
- Redis envisagé pour les sessions et le cache haute-fréquence (futur)
- S3 ou équivalent pour les exports vidéo (futur)

### Gestion de la latence SPARQL

**Problème** : les endpoints publics ont des latences variables (100ms à 5s), incompatibles avec une UX fluide.

**Solutions en couches :**

1. **Cache Redis partagé côté serveur** : les requêtes SPARQL populaires sont mises en cache. La plupart des utilisateurs voient Napoléon sans jamais requêter Wikidata directement.
2. **Requêtes parallèles** : les enrichissements Tier 2 sont déclenchés en parallèle. Le nœud s'affiche avec les données disponibles et s'enrichit progressivement.
3. **Prefetching prédictif** : quand l'utilisateur est sur un nœud, les voisins directs sont prefetchés en arrière-plan.
4. **Dégradation gracieuse** : jamais d'écran de chargement bloquant. Le graphe est toujours interactif, même pendant les chargements.

### Contraintes SharedArrayBuffer

Les headers `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp` doivent être configurés sur le serveur de déploiement en production. Contrainte non négociable pour le layout WASM.

---

## 12. Roadmap d'Implémentation

### Phase 0 — Socle SPARQL (4–6 semaines) ✅ COMPLÉTÉE

**Objectif** : remplacer le JSON statique par un data layer Wikidata réel, sans toucher au moteur 3D.

**Réalisé :**
- ✅ Backend Fastify complet (`server/`) avec routes REST (`/api/search`, `/api/entity/:qid`, `/api/entity/:qid/expand`, `/api/entity/:qid/neighbors`, `/api/entity/:qid/incoming-aggregates`, `/api/entity/:qid/aggregate-children`, `/api/image`, `/api/sparql`)
- ✅ Service `wikidataClient.js` avec classify-first fetch, budgets par tier, déduplication A-axis, filtre Wikimedia noise (7 types)
- ✅ Context Resolver (`contextResolver.js` + `contextRules.json`) avec 20 familles de types P31
- ✅ Cache PostgreSQL 3 tiers (mémoire → `cache_entries` table → API Wikidata) + `labelResolver.js` (tables `pid_labels`, `qid_labels`)
- ✅ Proxy image Wikimedia Commons (`/api/image`) avec headers CORP pour COEP/SharedArrayBuffer
- ✅ Thin API client frontend (`src/services/queries/wikidata.js`) remplace les appels SPARQL directs
- ✅ `dataSlice.js` refactoré pour chargement asynchrone via API backend
- ✅ `graphSlice.js` réécrit avec classify-first PID filtering et `contextPromotedPids`
- ✅ Nœuds agrégateurs : modèle `AggregateNode`, rendu hexagonal violet dans `InstancedNodes.jsx`, expand/collapse dans `NodeDetailPanel.jsx`, expand/collapse appellent `saveToHistory()` pour undo/redo
- ✅ `propertyClassification.js` enrichi avec dedup, `WIKIMEDIA_NOISE_TYPES`, `isWikimediaNoise()`
- ✅ Docker Compose fonctionnel (frontend nginx + backend Fastify + PostgreSQL)
- ✅ Paramètres par nœud (`nodeSettings` dans `dataSlice`) : direction d’exploration, profondeur BFS, mode radial, force radiale — chaque nœud indépendant
- ✅ Direction d’exploration `'incoming'` par défaut (plus de direction globale)
- ✅ `pinSlice` découplé : position lock uniquement, profondeur/direction/radial délégués à `nodeSettings`
- ✅ BFS roots = union de `pinnedNodes` + `nodeSettings` keys avec `depth > 0`
- ✅ `isEdgeVisibleForDirection()` dans `graphSlice` : filtre arêtes selon direction par nœud
- ✅ NodeDetailPanel redesign : sections repliables, mode édition inline, paramètres par nœud, références cliquables, liste d’entités agrégées
- ✅ `GroupInfoPanel` supprimé de `Gexor.jsx` (intégré dans NodeDetailPanel)
- ✅ ConnectedNodesPanel : filtre nœuds visibles uniquement + fetch sortant, bouton « ajouter au graphe »
- ✅ AllPropertiesModal : références entités cliquables (`selectNode` + `addNodeToGraph`)
- ✅ Système de mise en évidence : contour bleu sélection (`SELECTION_OUTLINE_COLOR`), pulse verte ajout (`ADDED_PULSE_COLOR`, 1500ms)
- ✅ `addNodeToGraph(uri)` dans `dataSlice` : charge, pin, déclenche pulse
- ✅ `recentlyAddedNodes` pour suivi de l’animation pulse
- ✅ Fetch sortant à la demande dans `uiSlice.selectNode()` pour affichage propriétés

**Critère de succès** : ✅ naviguer dans le graphe Gexor avec des données Wikidata réelles, sans données JSON.

---

### Phase 1 — Couplage Frustum (3–4 semaines)

**Objectif** : le chargement des données est couplé à la caméra.

Livrables :
- Hook de surveillance du frustum caméra
- Déclenchement des requêtes SPARQL selon la zone d'intérêt
- Déchargement mémoire des nœuds hors zone
- Nœuds en état "chargement" (fantômes)
- Fog de distance sur les bords du graphe chargé
- Prefetching des voisins directs en arrière-plan

**Critère de succès** : l'exploration est fluide, les données arrivent progressivement à mesure qu'on navigue.

---

### Phase 2 — Endpoints Tier 2 & Normalisation (4–5 semaines)

**Objectif** : enrichissements cross-endpoints fonctionnels.

Livrables :
- Détection automatique des identifiants de liaison (VIAF, GeoNames, Getty...)
- Requêtes vers BnF, GeoNames, Getty, Europeana
- Couche de normalisation inter-formats (CIDOC-CRM, EDM, schema.org → modèle Gexor)
- Gestion des endpoints défaillants (timeout, retry, liste noire temporaire)
- Sourçage atomique dans le panneau de détail (pastilles par propriété)

**Critère de succès** : sélectionner un peintre du 17e siècle et voir ses données enrichies depuis Getty + Rijksmuseum + Europeana.

---

### Phase 3 — Modes de Visualisation (4–5 semaines)

**Objectif** : modes Temporel et Géographique fonctionnels.

Livrables :
- Mode Temporel (positionnement sur axe temps depuis propriétés Wikidata)
- Mode Géographique (projection sur carte 3D depuis coordonnées)
- Transition fluide entre modes (interpolation de positions)
- Filtres temporels (slider double)
- Filtres géographiques (zoom sur région)

**Critère de succès** : switcher entre force-directed et temporel sur un graphe de 200 entités sans rechargement des données.

---

### Phase 4 — Système de Parcours (5–6 semaines)

**Objectif** : création et lecture de parcours avec pathfinding et animation caméra.

Livrables :
- Multi-sélection de nœuds dans la scène (Ctrl+clic, lasso)
- Moteur de pathfinding BFS pondéré et Dijkstra sur le graphe chargé
- Implémentation A* avec heuristiques thématiques
- Expansion progressive du graphe pour les chemins inter-clusters
- Animation caméra spline (Bézier cubique, altitude adaptative, regard anticipé)
- Interface de construction et d'édition de parcours
- Mode enregistrement depuis l'exploration libre
- Lecture avec barre de progression et affichage propriétés LOD à chaque étape
- Pause/reprise et sortie en exploration libre
- Sauvegarde et chargement de parcours (backend)
- Partage via URL

**Critère de succès** : sélectionner "Révolution française" et "Napoléon Bonaparte", lancer le pathfinding, et voir la caméra naviguer à travers les nœuds intermédiaires calculés.

---

### Phase 5 — Annotations & Blocs-notes (3–4 semaines)

**Objectif** : annotations 3D persistantes.

Livrables :
- Création de blocs-notes ancrés à des nœuds
- Création de marqueurs colorés
- Comportement billboard + LoD des annotations
- Persistance backend (stockage par Q-ID)
- Partage de calques d'annotations

---

### Phase 6 — Plugins & Marketplace (5–6 semaines)

**Objectif** : système de plugins fonctionnel avec 3 plugins de lancement.

Livrables :
- Architecture plugin (endpoints + apparence + filtres)
- Plugin Antiquité (Pleiades + Nomisma)
- Plugin Patrimoine FR (BnF + Louvre)
- Plugin Académique (OpenCitations + CrossRef)
- Interface de gestion des plugins (activation/désactivation)
- Documentation développeur pour plugins tiers

---

### Phase 7 — Contenu Éducatif & Packs (ongoing)

**Objectif** : couche contenu et outils enseignants.

Livrables :
- Structure de données des parcours scolaires
- Outils de création de packs éditoriaux
- Dashboard enseignant
- 3 packs de lancement (Histoire Moderne, Géographie, Sciences)
- Export vidéo des parcours (feature premium)

---

## 13. Zones d'Ombre & Décisions Ouvertes

### Décisions techniques

**Backend Node.js ou Python ?**  
✅ **Décision prise : Node.js + Fastify.** Cohérence avec le frontend React, écosystème JS unifié, excellentes performances I/O. Implémenté dans `server/`.

**Format de stockage des parcours**  
JSON dans PostgreSQL vs table relationnelle complète. Le JSON est plus flexible pour les itérations rapides mais moins requêtable. À décider avant Phase 4.

**Algorithme de clustering pour le mode Constellation**  
Louvain vs modularity-based vs spectral clustering. Critères : qualité des clusters sur des graphes LOD hétérogènes, performance sur graphes de 500–5000 nœuds. À évaluer en Phase 3.

**Pathfinding sur graphe partiel**  
Le graphe en mémoire est toujours une vue partielle du LOD. Quand A* traverse des zones non chargées, la qualité du chemin dépend des heuristiques. À valider avec des cas réels en Phase 4.

### Décisions produit

**Accessibilité mobile**  
Version mobile dégradée (2D force-directed) ou mobile non supporté dans un premier temps ? À décider avant Phase 1.

**Modération des parcours dans la marketplace**  
Revue humaine, vérification algorithmique (Q-IDs valides, longueur minimale), ou modération a posteriori ? À définir avant Phase 7.

**Politique de données utilisateurs**  
Les annotations et parcours peuvent révéler des intérêts personnels. Politique de confidentialité à définir précisément.

**Ligne de démarcation pathfinding gratuit/premium**  
BFS simple en gratuit est-il suffisant pour démontrer la valeur du produit ? À trancher avant Phase 4.

### Risques identifiés

**Instabilité des endpoints publics**  
Si Wikidata est en maintenance, Gexor est partiellement inutilisable. Mitigation : cache agressif pour les entités les plus visitées.

**Qualité des données LOD**  
Wikidata est collaboratif et peut contenir des erreurs. Une indication des "propriétés contestées" (rang "déprécié" dans Wikidata) est à envisager.

**Pathfinding sur graphes très denses**  
Des entités comme "France" ont des centaines de relations. Le pathfinding peut retourner des chemins triviaux passant par les hubs les plus connectés. Un mécanisme de pénalisation des hubs trop génériques est nécessaire.

**Dépendance à Wikidata**  
Toute l'architecture est centrée sur les Q-IDs Wikidata. Risque faible (Wikimedia Foundation, CC0) mais à surveiller.

---

*Document vivant — à mettre à jour à chaque décision architecturale majeure.*  
*Pour l'implémentation IA future : voir `GEXOR_IA_FUTURE.md`*
