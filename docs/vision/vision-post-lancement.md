# Gexor — Vision Post-Lancement

> **Date** : Mars 2026  
> **Statut** : Document de réflexion produit — issu de sessions de brainstorming  
> **Périmètre** : Trajectoire produit depuis le lancement jusqu'à la maturité

---

## 1. Version de Lancement

### Priorité absolue : la pertinence du moteur

Avant toute feature ou partenariat, le moteur doit être irréprochable. Un graphe qui retourne du bruit ne justifie aucun abonnement. Les cinq problèmes structurels du pipeline Wikidata (limit aveugle, absence de Context Resolver, PIDs non classifiés exclus, pas d'agrégateurs) sont des bugs de *pertinence*, pas de performance — ils doivent être résolus avant le lancement.

### Ce qui est disponible au lancement

- Exploration LOD 3D (Wikidata + enrichissements Tier 2)
- Marketplace avec packs éditoriaux internes (amorçage cold-start)
  - Filtres SPARQL thématiques
  - Parcours curatorisés
  - Seeds de démarrage
  - Modes visuels
  - Calques d'annotation expertes
- Hub utilisateur (spaces, annotations, achats)
- Tiers Gratuit / Premium / Éducation

### Ce que le lancement n'est pas

Le lancement n'est pas le moment d'aller chercher des partenariats ou de lancer des features spectaculaires. C'est le moment de valider que le moteur convainc des inconnus.

---

## 2. Phase Post-Lancement — Consolidation

### Feedback + itération moteur

Les premiers retours utilisateurs orienteront les corrections de pertinence et d'UX. Priorité absolue sur la qualité de navigation avant d'élargir le scope.

### Enrichissement de la marketplace

Continuer à publier des packs internes de référence tout en ouvrant progressivement aux créateurs tiers :

- Nouveaux filtres et configurations SPARQL
- Parcours thématiques supplémentaires
- Plugins et modes visuels
- **Niche fact-checking** : bundle de filtres/plugins orientés réseaux d'influence, affiliations, financement d'organisations — segment journalistes et fact-checkers, solvable et légitime
- Endpoints institutionnels (universités, musées, bibliothèques)

### Gexor-Endpoint

Construction de l'endpoint propriétaire Gexor via scraping + IA, avec **sources obligatoires** sur chaque donnée. Trajectoire : agréger des endpoints tiers d'abord → construire l'audience → lancer l'endpoint Gexor natif en premium quand la base est là.

---

## 3. Partenariats Éducatifs — Première Priorité Partenariat

### Pourquoi avant le public/privé classique

Les partenariats institutionnels publics/privés classiques (collectivités, grandes institutions culturelles) sont longs à conclure — 18 à 24 mois minimum. Les partenariats éducatifs sont plus accessibles, plus rapides, et génèrent des retours qualitatifs précieux.

### Cibles

- Universités et départements de recherche (histoire, géopolitique, sciences)
- Lycées et collèges (packs curriculum alignés sur programmes officiels)
- Instituts de recherche spécialisés

### Proposition de valeur

Un département d'histoire qui adopte Gexor ramène des centaines d'étudiants actifs et une légitimité éditoriale non achetable. Les besoins : visualiser des corpus LOD, construire des parcours pédagogiques sur des domaines pointus, connecter leurs propres endpoints SPARQL. Gexor répond à ça nativement.

### Modèle

Abonnement année scolaire / licence institutionnelle. Outils enseignants : suivi de progression des élèves, création de parcours assignés, export de rapports.

---

## 4. Video to Parcours

### Principe

Un documentaire est fondamentalement un parcours linéaire dans un espace de connaissance. Le transformer en parcours Gexor, c'est lui donner une deuxième vie interactive — et créer du stock marketplace sans dépendre de créateurs tiers.

### Brique technique

Combinaison de l'expertise pipeline endpoint (extraction, structuration) et du système de parcours existant. Le processus : transcription → extraction d'entités → mapping Q-IDs Wikidata → génération d'un parcours structuré → curation humaine → publication marketplace.

### Partenaires cibles

Acteurs avec des problèmes de *valorisation de catalogue* : Arte, INA, équivalents internationaux. Argument : des milliers d'heures de documentaires avec une durée de vie numérique courte. Un parcours Gexor dérivé = vie permanente pour un contenu éphémère.

### Modèle envisagé

Co-branding ou licence de contenu. Le partenaire apporte le catalogue, Gexor apporte la structuration et la distribution. Revenue share sur les packs générés.

---

## 5. Parcours to Documentary

### Principe

Un parcours Gexor = une structure narrative sur un domaine de connaissance. En théorie, c'est un brief documentaire : séquence d'entités, relations clés, angles interprétatifs.

### Positionnement

Pas un produit grand public — un outil B2B vendu à des producteurs, journalistes et créateurs de contenu pour générer des traitements éditoriaux structurés depuis le graphe.

### Risque à surveiller

Passer de la navigation à la production, c'est changer de métier. À développer uniquement si la demande B2B le justifie organiquement, pas comme feature proactive.

---

## 6. MCP + Embed Chatbot

### Principe

Un serveur MCP Gexor expose des outils directement utilisables par les LLMs :

- `explore_entity(q_id)` — charger et afficher un nœud
- `find_path(entity_a, entity_b)` — pathfinding entre deux entités
- `load_parcours(id)` — ouvrir un parcours marketplace
- `apply_filter(filter_id)` — appliquer un filtre SPARQL

Un utilisateur demande à Claude ou GPT "montre-moi les relations entre la Révolution française et Napoléon" → le graphe 3D Gexor s'ouvre en embed dans le chat.

### Embed général

Au-delà des chatbots : un widget 3D embarquable dans des articles de presse, cours en ligne, musées virtuels. Pas une simple iframe — un composant interactif qui s'ouvre depuis un mot cliqué dans un texte.

### Cercle vertueux

LLM génère de la demande → Gexor convertit en comptes premium → les parcours marketplace deviennent des assets que les LLMs peuvent recommander nommément → plus de demande.

### Modèle

Distribution organique gratuite. Conversions premium trackées via referral embed. Option : licence embed pour médias et éditeurs (whitelabel).

---

## 7. B2B — Sujet à Développer

### Cas d'usage identifiés

- **Cabinets de conseil en stratégie** : cartographie concurrentielle, réseaux d'influence
- **Rédactions et médias** : investigations, couverture électorale, fact-checking structuré
- **Équipes R&D** : veille technologique, mapping de domaines de recherche
- **Universités et instituts** : voir section Partenariats Éducatifs

### Features différenciantes pour le B2B

- Spaces partagés en équipe
- Annotations collaboratives sur nœuds et relations
- Versioning des spaces (fork, branches, diff, contributions)
- Permissions granulaires (qui voit quoi dans l'équipe)
- Confidentialité des annotations (calques privés vs partagés)
- Export structuré (JSON, RDF, CSV)

### Note

Les features B2B valorisent exactement les mêmes briques que le produit grand public, dans un contexte collaboratif. Peu de développement spécifique requis — c'est principalement une couche de permissions et d'interface de gestion d'équipe.

### À développer

Modèle de pricing B2B (par siège, par équipe, par organisation), cycle de vente, positionnement vs outils existants (Kumu, Gephi, Palantir pour les plus ambitieux), et identification des early adopters B2B.

---

## 8. Séquence Recommandée

```
Lancement
    ↓
Feedback + itération moteur (priorité absolue)
    ↓
Consolidation marketplace (filtres, parcours, fact-checking, endpoint)
    ↓
Partenariats éducatifs / universitaires
    ↓
MCP + embed (distribution organique)
    ↓
Video to Parcours (pilotes médias)
    ↓
B2B collaboratif
    ↓
Parcours to Documentary (si demande B2B justifiée)
    ↓
Partenariats public/privé institutionnels (18–24 mois)
```

---

*Document vivant — à enrichir lors des sessions de réflexion produit.*  
*Le B2B mérite une session dédiée pour être développé en détail.*
