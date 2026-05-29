# Gexor — Marketplace & Modèle Hub

> **Version** : 1.0
> **Date** : Février 2026
> **Statut** : Document de vision — issu d'une session de réflexion produit

---

## 1. Positionnement

**Le moteur 3D d'exploration LOD reste le produit principal.** La marketplace et le hub sont une couche de valeur ajoutée construite au-dessus, pas l'inverse.

Le hub centralise tout ce qui est propre à l'utilisateur : son compte, ses spaces, ses parcours, ses annotations, ses achats marketplace. Il constitue la colonne vertébrale SaaS de Gexor.

---

## 2. Le Hub Utilisateur

### Ce que le hub stocke

Gexor ne stocke jamais de connaissance (elle vit dans le LOD cloud). Le hub stocke uniquement la couche personnelle :

- Profil utilisateur public/privé
- Spaces d'exploration sauvegardés
- Parcours créés
- Annotations et calques
- Achats et licences marketplace
- Préférences et configurations

### Versioning des Spaces (feature future)

Un space Gexor = une séquence de Q-IDs + paramètres caméra + filtres actifs. Le versionner façon git permet :

- **Fork** : reprendre le space d'un autre comme point de départ
- **Branches** : explorer une tangente sans perdre l'espace principal
- **Diff** : voir l'évolution d'un graphe dans le temps (données LOD)
- **Contributions** : proposer une amélioration d'un parcours public

Note : on versionne la *requête*, pas la *réponse* — ce qui est plus propre et cohérent avec la nature dynamique du LOD.

---

## 3. La Marketplace

### Catalogue de produits

#### Parcours & Spaces éditoriaux
Le cœur de la marketplace. Travail humain de curation, mise en récit, sélection dans un graphe de milliards de nœuds. Non-reproductible par une IA seule.

- Parcours thématiques (Histoire, Sciences, Géopolitique, Philosophie...)
- Spaces pré-configurés sur un domaine
- Packs scolaires alignés sur des curricula officiels

#### Filtres
Des configurations SPARQL avancées pré-packagées, testées, compatibles avec l'architecture Gexor, nommées et catégorisées.

Exemples : "Relations diplomatiques entre États 1900–1950", "Flux migratoires Europe XIXe", "Généalogies dynastiques"

La valeur n'est pas dans la rareté de la création (une IA peut en générer), mais dans la **qualité, la compatibilité garantie et la découvrabilité**.

#### Modes Visuels
Shaders, layouts alternatifs, thèmes de rendu designés pour l'esthétique de Gexor. Travail créatif à part entière.

Modèle : thèmes VS Code, brushes Procreate, presets Lightroom — la reproductibilité n'empêche pas la monétisation.

#### Calques d'Annotation Expertes
Distinct d'un parcours. Un expert annote des centaines de nœuds avec son regard. L'utilisateur explore librement avec cette expertise superposée. Non-reproductible par une IA.

Exemple : un historien spécialiste du IIIe Reich annote 400 nœuds — tu achètes son *regard*, pas un chemin guidé.

#### Seeds de Démarrage
Points d'entrée curatorisés dans le graphe : bons filtres déjà actifs, bonne perspective caméra, bons endpoints chargés. Équivalent d'un tableau de bord pré-configuré. Valeur élevée pour les débutants.

#### Endpoints
Configurations d'endpoints SPARQL tiers (universités, musées, bibliothèques institutionnelles) avec documentation et filtres associés. Segment B2B potentiellement lucratif.

**Trajectoire endpoint natif** : agréger des endpoints tiers d'abord → construire audience → lancer l'endpoint Gexor natif en premium quand la base est là.

#### Bundles (Lentilles Thématiques)
Un bundle = filtre + mode visuel + seed + parcours d'exemple, packagés autour d'un thème cohérent.

Une lentille encode un *point de vue interprétatif* : la même entité "Napoléon" vue par la lentille "flux économiques", "réseaux familiaux", ou "géographie militaire". Valeur perçue plus élevée que les éléments séparés.

---

## 4. Modèle Économique

### Tiers d'accès

| Tier | Accès | Marketplace |
|------|-------|-------------|
| **Gratuit** | Exploration LOD basique, 3 parcours, 10 annotations | Packs gratuits uniquement |
| **Premium** | Tout débridé, sync multi-appareils, pathfinding avancé | Accès complet marketplace |
| **Éducation** | Outils enseignants, suivi élèves, packs curriculum | Packs scolaires |

### Sources de revenus

- **Abonnement Premium** (mensuel/annuel) : récurrent, prévisible, scalable
- **Commission Marketplace** : sur chaque vente par un créateur tiers
- **Packs thématiques** : achat unique (collections définitives) ou abonnement annuel (domaines vivants)
- **Packs scolaires** : abonnement année scolaire
- **Endpoints B2B** : configurations institutionnelles

### Amorçage de la marketplace

Gexor est à la fois la plateforme et le premier créateur de référence : publier des packs éditoriaux de qualité en interne pour amorcer la pompe avant d'ouvrir aux créateurs tiers. Résout le problème classique de marketplace à deux faces.

---

## 5. Communautés de Créateurs

Trois profils naturellement distincts :

- **Pédagogues & éditeurs** → parcours, spaces, seeds
- **Experts SPARQL** → filtres avancés, configurations endpoints
- **Designers & développeurs** → modes visuels, shaders, thèmes

---

## 6. Ce qui est hors scope (décisions actées)

- ~~Export vidéo des parcours~~ : hors scope
- ~~Profils d'exploration comme produit marketplace~~ : valeur perçue trop faible, à revoir
- Les filtres et modes visuels restent dans la marketplace malgré la reproductibilité IA (la valeur = curation + compatibilité + découverte)

---

*Document vivant — à consolider dans GEXOR_IMPLEMENTATION.md lors de la prochaine mise à jour architecturale.*
