# Gexor — Roadmap d'Implémentation

> **Version** : 2.0
> **Mise à jour** : Avril 2026
> **Phase 0 (socle Wikidata + moteur 3D) : ✅ COMPLÉTÉE** — voir `CLAUDE.md` pour l'architecture actuelle.

---

## Table des matières

1. [Vision & Positionnement](#1-vision--positionnement)
2. [Phase 1 — Couplage Frustum](#2-phase-1--couplage-frustum)
3. [Phase 2 — Endpoints Tier 2 & Sourçage Atomique](#3-phase-2--endpoints-tier-2--sourçage-atomique)
4. [Phase 3 — Modes de Visualisation](#4-phase-3--modes-de-visualisation)
5. [Phase 4 — Système de Parcours](#5-phase-4--système-de-parcours)
6. [Phase 5 — Annotations & Blocs-notes 3D](#6-phase-5--annotations--blocs-notes-3d)
7. [Phase 6 — Plugins & Marketplace](#7-phase-6--plugins--marketplace)
8. [Phase 7 — Contenu Éducatif & Packs](#8-phase-7--contenu-éducatif--packs)
9. [Backend — Évolutions requises](#9-backend--évolutions-requises)
10. [Modèle Économique & Tiers](#10-modèle-économique--tiers)
11. [Zones d'Ombre & Décisions Ouvertes](#11-zones-dombre--décisions-ouvertes)

---

## 1. Vision & Positionnement

**Gexor** est un **navigateur immersif du savoir mondial** qui explore le Linked Open Data (LOD) cloud en temps réel, dans une scène 3D interactive.

**Ce que Gexor n'est pas :**
- Un moteur de recherche (pas d'index propriétaire)
- Une encyclopédie (pas de contenu hébergé)
- Un outil réservé aux experts

**Ce que Gexor est :**
- Un layer de navigation sur le LOD cloud existant
- Une UX d'exploration que le LOD n'a jamais eu
- Un outil éducatif qui rend la connaissance structurée accessible au grand public

**Utilisateurs cibles :**
- Autodidactes curieux (25–45 ans), passionnés d'histoire, géopolitique, sciences
- Étudiants en recherche exploratoire
- Enseignants construisant des parcours pédagogiques

---

## 2. Phase 1 — Couplage Frustum

**Objectif** : le chargement des données est couplé à la position caméra. (3–4 semaines)

### Frustum-driven loading

Un hook surveille en continu la position et orientation de la caméra. Quand la caméra dépasse un seuil, il calcule la zone d'intérêt et déclenche les requêtes pour les nœuds entrant dans le frustum.

- **Zone d'intérêt** : frustum étendu d'un facteur de marge
- **Priorité de chargement** : nœuds proches du centre du frustum en premier
- **Déchargement** : nœuds hors zone libèrent leur mémoire après un délai de grâce

### Nœuds fantômes

Quand une entité est dans le frustum mais pas encore chargée, elle s'affiche en mode fantôme (opacité réduite, pulsation). Les données arrivent progressivement et le nœud se « matérialise ».

### Niveaux de détail étendus (LoD 0–4)

Le LoD actuel (labels ↔ sphères) est étendu :
- **Niveau 0 (très lointain)** : point lumineux, pas de label
- **Niveau 1 (lointain)** : sphère instanciée colorée par type
- **Niveau 2 (moyen)** : sphère + label court
- **Niveau 3 (proche)** : sphère + label complet + icône de type
- **Niveau 4 (très proche / sélectionné)** : rendu enrichi avec aperçu propriétés, image si disponible, pastilles de sources

### Fog atmosphérique

Le fog est utilisé comme masque naturel pour les zones non chargées. Les bords du graphe chargé fondent dans le vide plutôt qu'une coupure nette.

### Animation de caméra programmatique

En plus des TrackballControls interactifs, un système d'animation pilote la caméra par interpolation (lerp/slerp) vers une cible définie — nécessaire pour le Système de Parcours (Phase 4). L'utilisateur peut reprendre la main à tout moment.

**Livrables :**
- Hook de surveillance du frustum caméra
- Déclenchement des requêtes selon la zone d'intérêt
- Déchargement mémoire des nœuds hors zone
- Rendu des nœuds fantômes
- Fog de distance
- LoD 0–4 complet
- Contrôles caméra animés (lerp/slerp)

**Critère de succès** : exploration fluide, données qui arrivent progressivement à mesure qu'on navigue.

---

## 3. Phase 2 — Endpoints Tier 2 & Sourçage Atomique

**Objectif** : enrichissements cross-endpoints et traçabilité des données. (4–5 semaines)

### Hiérarchie des endpoints

**Tier 1 — Hub central (✅ actif)**
- Wikidata (`query.wikidata.org`) : identités, propriétés, identifiants de liaison vers les autres endpoints.

**Tier 2 — Enrichissement automatique (à implémenter)**
- Si l'entité a un VIAF ID → requête BnF, LoC, GND
- Si l'entité a un GeoNames ID → données géographiques enrichies
- Si l'entité a un Getty ULAN ID → données artistiques
- Si l'entité a un DOI/ORCID → OpenCitations pour données académiques
- Si l'entité a un Europeana ID → patrimoine culturel

**Tier 3 — Endpoints spécialisés (activés par plugin, Phase 6)**
- Pleiades : entités de l'Antiquité gréco-romaine
- UniProt + ChEMBL : entités biologiques et chimiques
- Louvre, Rijksmuseum, British Museum : œuvres d'art
- PeriodO : périodes historiques
- Nomisma : numismatique

### Gestion des endpoints défaillants

Chaque requête a un timeout configurable (défaut : 5s). En cas d'échec :
- Le nœud s'affiche en mode dégradé (données Wikidata seules)
- Pastille visuelle indique que l'enrichissement n'est pas disponible
- Retry automatique après 30 secondes
- Endpoints défaillants mis en liste noire temporaire (15 min)

### Normalisation inter-formats

Chaque endpoint a ses propres modèles (CIDOC-CRM, EDM, schema.org…). La couche de normalisation traduit tout vers le modèle Gexor :
- **Nœud** : identifiant canonique (Q-ID), label, type, propriétés clés, coordonnées temporelles/géo, identifiants cross-sources
- **Relation** : source, cible, type sémantique normalisé, confiance, provenance
- **Source** : endpoint d'origine, URL, licence, date de consultation

### Sourçage Atomique

Chaque information affichée porte son origine au niveau de la propriété individuelle (pas du nœud entier).

- **Pastilles discrètes** : micro-icône source (logo endpoint + licence abrégée) par propriété dans le panneau de détail. Tooltip au survol : URL complète, date de consultation, licence détaillée.
- **Indicateur global sur le nœud 3D** : nombre de sources documentant ce nœud. Plus documenté = apparence enrichie (brillance, taille légèrement augmentée).
- **Panneau sources complet** : accessible depuis le panneau de détail, liste toutes les sources avec liens vers les ressources originales.
- **Transparence sur les limites** : propriété manquante dans toutes les sources → l'UI l'indique clairement.

**Livrables :**
- Détection automatique des identifiants de liaison (VIAF, GeoNames, Getty…)
- Requêtes vers BnF, GeoNames, Getty, Europeana
- Couche de normalisation inter-formats
- Gestion des endpoints défaillants (timeout, retry, liste noire)
- Sourçage atomique dans le panneau de détail

**Critère de succès** : sélectionner un peintre du 17e siècle et voir ses données enrichies depuis Getty + Rijksmuseum + Europeana.

---

## 4. Phase 3 — Modes de Visualisation

**Objectif** : modes Temporel et Géographique fonctionnels. (4–5 semaines)

Un mode est une **lentille de visualisation** sur le même graphe. Les nœuds et relations ne changent pas — leur disposition, apparence et les informations mises en avant changent selon le mode. Les modes sont superposables et switchables à la volée sans rechargement.

### Modes à implémenter

**Mode Temporel**
Les nœuds sont positionnés sur un axe temporel. L'axe X (ou Z) représente le temps, les axes perpendiculaires sont libres pour le layout force. Les entités sans date flottent dans une zone « atemporal ». La caméra peut survoler la frise de gauche à droite.

**Mode Géographique**
Les nœuds sont projetés sur une carte 3D sphérique ou plane selon leurs coordonnées géographiques (GeoNames ID ou coordonnées Wikidata). Les entités sans géolocalisation flottent au-dessus de la carte.

**Mode Hiérarchique**
Relations `sous-classe de`, `partie de`, `membre de` construisent une arborescence verticale. Révèle les structures taxonomiques et héritages conceptuels.

**Mode Thématique / Constellation**
Nœuds regroupés par cluster thématique (Louvain ou modularity clustering) selon les propriétés Wikidata. Chaque cluster forme une « constellation » avec un nœud central représentatif. Connexions inter-clusters affichées comme arcs lumineux.

**Mode Bipartite**
Sépare visuellement deux types d'entités (ex: personnes d'un côté, événements de l'autre) pour rendre lisibles les relations entre catégories.

### Filtres globaux (indépendants des modes)

- Par type d'entité (personne, lieu, événement, concept, organisation…)
- Par plage temporelle (slider double)
- Par langue de la source principale
- Par endpoint source
- Par degré de connexion
- Par confiance (seuil minimum)
- Par domaine thématique

**Livrables :**
- Mode Temporel (positionnement sur axe temps depuis propriétés Wikidata)
- Mode Géographique (projection sur carte 3D)
- Transition fluide entre modes (interpolation de positions)
- Filtres temporels et géographiques

**Critère de succès** : switcher entre force-directed et temporel sur un graphe de 200 entités sans rechargement des données.

---

## 5. Phase 4 — Système de Parcours

**Objectif** : création et lecture de parcours avec pathfinding et animation caméra. (5–6 semaines)

### Concept

Un parcours est une **séquence ordonnée de nœuds** avec une trajectoire de caméra calculée. Il relie des entités du graphe LOD selon un chemin calculé par pathfinding, sans narration générée par IA.

Un parcours est une couche posée sur l'exploration libre — l'utilisateur peut en sortir à tout moment pour explorer librement, puis reprendre.

### Algorithmes de pathfinding

**BFS pondéré** — chemin le plus court entre deux nœuds. Poids des arêtes basé sur le score de confiance de la relation.

**Dijkstra sur graphe sémantique** — pondéré par la nature des relations (certains types ont plus de poids narratif). Poids configurables par type de relation et par mode actif.

**A* avec heuristique thématique** — pour les parcours entre nœuds distants où le graphe n'est pas entièrement chargé. Heuristiques basées sur : période temporelle, domaine thématique, type d'entité.

**Expansion progressive** — quand aucun chemin direct n'existe dans le graphe chargé, le système étend progressivement la profondeur SPARQL (profondeur 2, puis 3) jusqu'à trouver une connexion ou atteindre la limite.

**Pénalisation des hubs génériques** — mécanisme pour éviter les chemins triviaux passant par des entités trop génériques (ex: « France » avec 500 relations).

### Modes de création

- **Sélection manuelle** : Ctrl+clic ou lasso pour sélectionner N nœuds dans l'ordre. Pathfinding calcule les nœuds intermédiaires entre chaque paire.
- **Point à point** : nœud de départ + nœud d'arrivée → chemin optimal calculé.
- **Construction manuelle complète** : ajout d'étapes une par une sans pathfinding, pour un contrôle total.
- **Enregistrement depuis l'exploration** : l'utilisateur active l'enregistrement, chaque nœud cliqué devient une étape. Arrêt → parcours basé sur le chemin réel.

### Trajectoire de caméra

- **Courbe de Bézier cubique** entre chaque paire d'étapes, points de contrôle calculés pour éviter les clusters denses
- **Altitude de vol adaptative** : plus la distance est grande, plus la caméra monte avant de redescendre
- **Regard anticipé** : la caméra commence à orienter son regard vers l'étape suivante avant d'y arriver
- **Vitesse variable** : ralentissement à l'approche d'une étape, accélération entre les étapes
- **Reprise de contrôle** : si l'utilisateur touche les contrôles pendant l'animation, passage immédiat en mode interactif

### Interface du mode parcours

Pendant la lecture :
- Barre de progression linéaire avec étapes numérotées
- Titre de l'étape courante + propriétés clés du nœud (depuis LOD)
- Sourçage atomique des propriétés affichées
- Boutons Précédent / Pause / Suivant
- Indicateur « Exploration libre » si l'utilisateur a repris le contrôle
- Bouton « Revenir au parcours »

### Structure de données d'un parcours

```js
{
  id, title, description,
  steps: [{ qid, cameraTarget, pauseDuration, note }],
  metadata: { author, date, lang, domain, schoolLevel },
  trajectory: { speed, curveType, altitude },
  type: 'manual' | 'bfs' | 'dijkstra' | 'astar'
}
```

### Partage et export

- **Partage via lien** : URL encode l'identifiant du parcours
- **Publication en marketplace** : monétisable par les créateurs
- **Export vidéo** : enregistrement de la scène avec trajectoire caméra (feature premium, sans narration)

**Livrables :**
- Multi-sélection (Ctrl+clic, lasso)
- Moteur BFS pondéré + Dijkstra + A* avec heuristiques
- Expansion progressive du graphe
- Animation caméra spline
- Interface de construction et d'édition
- Mode enregistrement depuis l'exploration libre
- Lecture avec barre de progression
- Sauvegarde + chargement (backend)
- Partage via URL

**Critère de succès** : sélectionner « Révolution française » et « Napoléon Bonaparte », lancer le pathfinding, voir la caméra naviguer à travers les nœuds intermédiaires calculés.

---

## 6. Phase 5 — Annotations & Blocs-notes 3D

**Objectif** : annotations 3D persistantes ancrées dans la scène. (3–4 semaines)

### Types d'annotations

**Bloc-note textuel** — fenêtre flottante avec éditeur markdown, ancrée à un nœud ou à une position dans l'espace. Redimensionnable. Peut contenir texte, listes, liens vers d'autres nœuds Gexor.

**Marqueur** — indicateur visuel coloré sur un nœud avec label court. Pour marquer des entités à revisiter ou catégoriser manuellement.

**Annotation de relation** — texte attaché à une arête spécifique (« à vérifier », « source contradictoire »…).

**Groupe visuel** — enveloppe translucide regroupant un ensemble de nœuds sélectionnés manuellement. Nommable et colorable.

### Comportement dans la scène

- Objets billboardés (toujours face à la caméra) ou ancrés en 3D fixe selon préférence
- Respectent le LoD : à grande distance → icône. En s'approchant → contenu lisible
- Semi-transparents, passent en arrière-plan quand la caméra s'éloigne
- Ne bloquent pas la navigation

### Stockage et partage

- Stockées côté backend par Q-ID canonique (robuste aux mises à jour LOD)
- Export / import comme « calque » partageable

**Livrables :**
- Création de blocs-notes ancrés à des nœuds
- Création de marqueurs colorés
- Comportement billboard + LoD
- Persistance backend (par Q-ID)
- Partage de calques d'annotations

---

## 7. Phase 6 — Plugins & Marketplace

**Objectif** : système de plugins fonctionnel avec 3 plugins de lancement. (5–6 semaines)

### Architecture plugin

Un plugin est un module qui :
1. Active un ou plusieurs endpoints spécialisés (Tier 3)
2. Peut modifier l'apparence des nœuds concernés
3. Peut ajouter des interactions spécifiques
4. Peut ajouter des filtres dédiés à l'UI

### Plugins de lancement

- **Plugin Antiquité** : Pleiades (lieux antiques) + Nomisma (monnaies) + SNAP:DRGN (personnes). Nœuds antiques avec apparence visuelle distincte.
- **Plugin Sciences de la vie** : UniProt + ChEMBL + Reactome. Entités biologiques avec propriétés spécifiques (séquences, voies métaboliques).
- **Plugin Patrimoine FR** : BnF + Louvre + Europeana avec filtrage sur le patrimoine francophone.
- **Plugin Académique** : OpenCitations + DBLP + CrossRef. Publications et citations navigables.

### Marketplace de plugins

- Les développeurs tiers peuvent créer et publier des plugins
- Documentation développeur pour plugins tiers
- Système de revue / modération

**Livrables :**
- Architecture plugin (endpoints + apparence + filtres)
- Plugin Antiquité (Pleiades + Nomisma)
- Plugin Patrimoine FR (BnF + Louvre)
- Plugin Académique (OpenCitations + CrossRef)
- Interface de gestion des plugins (activation/désactivation)
- Documentation développeur

---

## 8. Phase 7 — Contenu Éducatif & Packs

**Objectif** : couche contenu et outils enseignants. (ongoing)

### Structure d'un parcours scolaire

- Alignement sur un programme officiel (niveau, matière, compétence)
- Séquence de nœuds avec notes manuelles rédigées par l'éditeur à chaque étape
- Vocabulaire clé mis en avant avec définitions
- Liens vers notions prérequises et approfondissements
- Questions de compréhension optionnelles

### Outils enseignants

- Création de parcours personnalisés depuis l'interface Gexor
- Attribution de parcours à une classe
- Tableau de bord de suivi (nœuds explorés, temps passé, étapes complétées)
- Export des parcours en PDF ou présentation

### Export vidéo des parcours

1. Session de parcours enregistrée (capture scène 3D + trajectoire caméra)
2. Images Wikimedia Commons disponibles intercalées (CC0)
3. Exportable sans narration — l'utilisateur ajoute sa propre voix

### Cartes mentales exportables

La vue courante peut être exportée en carte mentale 2D (SVG ou PNG) pour supports de cours.

**Livrables :**
- Structure de données des parcours scolaires
- Outils de création de packs éditoriaux
- Dashboard enseignant
- 3 packs de lancement (Histoire Moderne, Géographie, Sciences)
- Export vidéo des parcours (feature premium)

---

## 9. Backend — Évolutions requises

Le backend Fastify actuel (Phase 0) gère Wikidata + cache PostgreSQL. Évolutions nécessaires pour les phases suivantes :

| Fonctionnalité | Phase | Notes |
|----------------|-------|-------|
| Authentification + gestion des comptes | 5+ | Nécessaire pour annotations/parcours utilisateurs |
| Stockage des annotations utilisateurs | 5 | Par Q-ID canonique dans PostgreSQL |
| Stockage des parcours sauvegardés | 4 | JSON dans PostgreSQL vs table relationnelle — décision à prendre |
| Proxy vers endpoints SPARQL Tier 2/3 | 2 | Gestion des quotas, retry, fallback |
| Monitoring des endpoints (dispo, latence) | 2 | Liste noire temporaire côté serveur |
| Redis pour sessions + cache haute-fréquence | 2+ | Remplacement du cache PostgreSQL pour les requêtes les plus fréquentes |
| S3 ou équivalent pour exports vidéo | 7 | Stockage des rendus vidéo des parcours |

---

## 10. Modèle Économique & Tiers

### Tier Gratuit

- Exploration libre du graphe LOD (Wikidata, Tier 1 uniquement)
- Mode Force-Directed, Temporel, Géographique
- Filtres de base + LoD complet
- Création et sauvegarde de 3 parcours (jusqu'à 10 étapes)
- Pathfinding BFS basique
- 10 annotations persistantes
- Sourçage atomique complet

**Limitations :** endpoints Tier 2/3 non disponibles, plugins désactivés, parcours non partageables, pas d'export vidéo, pathfinding avancé (Dijkstra, A*) non disponible, annotations non synchronisées entre appareils.

### Tier Premium (mensuel / annuel)

- Endpoints Tier 2 et 3 (enrichissements complets)
- Tous les modes de visualisation
- Tous les plugins intégrés
- Parcours illimités, partageables, exportables
- Annotations persistantes et synchronisées multi-appareils
- Tous les algorithmes de pathfinding
- Export vidéo des parcours
- Accès marketplace (achat de packs)

### Packs de contenu

- **Packs thématiques définitifs (achat unique)** : Histoire Moderne, Philosophie, Sciences Fondamentales…
- **Packs vivants (abonnement annuel)** : Géopolitique, Sciences Climatiques, Tech & Innovation — mis à jour trimestriellement
- **Packs scolaires (abonnement année scolaire)** : alignés sur curricula officiels, avec outils enseignants

### Marketplace créateurs

Créateurs externes publient et monétisent leurs parcours. Gexor prend une commission. Les créateurs conservent la propriété de leurs parcours.

---

## 11. Zones d'Ombre & Décisions Ouvertes

### Décisions techniques

**Format de stockage des parcours (avant Phase 4)**
JSON dans PostgreSQL vs table relationnelle complète. Le JSON est plus flexible pour les itérations rapides mais moins requêtable.

**Algorithme de clustering pour le mode Constellation (avant Phase 3)**
Louvain vs modularity-based vs spectral clustering. Critères : qualité sur graphes LOD hétérogènes, performance sur 500–5000 nœuds.

**Pathfinding sur graphe partiel (à valider en Phase 4)**
Le graphe en mémoire est toujours une vue partielle du LOD. Quand A* traverse des zones non chargées, la qualité du chemin dépend des heuristiques. À valider avec des cas réels.

### Décisions produit

**Accessibilité mobile (avant Phase 1)**
Version mobile dégradée (2D force-directed) ou mobile non supporté dans un premier temps ?

**Modération des parcours dans la marketplace (avant Phase 7)**
Revue humaine, vérification algorithmique (Q-IDs valides, longueur minimale), ou modération a posteriori ?

**Politique de données utilisateurs**
Les annotations et parcours peuvent révéler des intérêts personnels. Politique de confidentialité à définir précisément.

**Ligne de démarcation pathfinding gratuit/premium (avant Phase 4)**
BFS simple en gratuit est-il suffisant pour démontrer la valeur du produit ?

### Risques identifiés

**Instabilité des endpoints publics** — si Wikidata est en maintenance, Gexor est partiellement inutilisable. Mitigation : cache agressif pour les entités les plus visitées.

**Qualité des données LOD** — Wikidata est collaboratif et peut contenir des erreurs. Indication des propriétés « dépréciées » (rang `deprecated` dans Wikidata) à envisager.

**Pathfinding sur graphes très denses** — entités comme « France » ont des centaines de relations. Le pathfinding peut retourner des chemins triviaux via les hubs génériques. Mécanisme de pénalisation nécessaire.

**Dépendance à Wikidata** — toute l'architecture est centrée sur les Q-IDs Wikidata. Risque faible (Wikimedia Foundation, CC0) mais à surveiller.

---

*Document vivant — à mettre à jour à chaque décision architecturale majeure.*
*Pour l'implémentation IA future : voir `GEXOR_IA_FUTURE.md`*
