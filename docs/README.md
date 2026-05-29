# Documentation Gexor

Documentation de conception, d'architecture et de vision du projet **Gexor** (explorateur 3D de graphes de connaissances Wikidata).

Pour la prise en main, l'installation et l'aperçu technique, voir le [README racine](../README.md).
Pour les conventions de code et l'architecture courante, voir [CLAUDE.md](../CLAUDE.md).

## Arborescence

```
docs/
├── vision/         Stratégie produit, roadmap et vision long-terme
├── architecture/   Conception technique du moteur et des données
└── ui/             Spécifications des composants d'interface
```

## Vision & Stratégie

| Document | Description |
|----------|-------------|
| [Roadmap d'implémentation](vision/roadmap.md) | Documentation d'implémentation complète, organisée par phases. |
| [Vision post-lancement](vision/vision-post-lancement.md) | Orientations produit envisagées après le lancement. |
| [Marketplace & modèle hub](vision/marketplace.md) | Modèle de marketplace de plugins et stratégie de hub. |
| [Portail éducatif](vision/portail-educatif.md) | Analyse produit du contexte scolaire (exploration libre vs. curriculum). |
| [Modularité future](vision/modularite-future.md) | Vision long-terme de la modularité ; vérifie que la refonte plugin-first absorbe les cas d'usage à 12-24 mois. |

## Architecture

| Document | Description |
|----------|-------------|
| [Pipeline Wikidata](architecture/pipeline-wikidata.md) | Rapport d'architecture du pipeline de gestion des données Wikidata. |
| [Filtres — Filter IR & SPARQL](architecture/filtres-ir-sparql.md) | Représentation intermédiaire des filtres et stratégie de traduction SPARQL. |
| [Refonte plugin-first](architecture/refonte-plugin-first.md) | Plan détaillé pour transformer Gexor en plateforme core + plugins. |
| [Endpoints SPARQL publics](architecture/sparql-endpoints.md) | Liste exhaustive des endpoints SPARQL publics exploitables. |

## UI / Composants

| Document | Description |
|----------|-------------|
| [InfoPanel + RightPanel](ui/infopanel-rightpanel.md) | Spécification d'implémentation de l'architecture à deux panneaux. |
| [InfoPanel — liste des plugins](ui/infopanel-plugins.md) | Inventaire des plugins à implémenter pour l'InfoPanel. |
| [SearchModal — spécification idéale](ui/searchmodal-ideal.md) | Cible fonctionnelle complète de la recherche avancée. |
| [SearchModal — plan de refonte](ui/searchmodal-refonte.md) | Plan de refonte concret basé sur l'audit existant. |
| [Plugin cluster-shared](ui/plugin-cluster-shared.md) | Plan d'implémentation du plugin d'entités similaires. |
