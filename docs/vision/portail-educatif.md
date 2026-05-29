# Portail Éducatif — Analyse abstraite

## La tension fondamentale
Gexor est un outil d'exploration non-linéaire, curiosity-driven. L'école est un système linéaire, curriculum-driven. Ces deux philosophies sont structurellement opposées.
Le Portail Éducatif n'est pas une feature de Gexor — c'est un context switch complet sur le même moteur. Le même graphe, mais avec une couche de contraintes, de visibilité et d'intentionnalité pédagogique posée dessus.
La question centrale est donc : comment concilier la liberté d'exploration avec les exigences d'un programme officiel, sans trahir l'un ni l'autre ?

Les acteurs et leurs rôles réels
Il y en a quatre, avec des besoins profondément différents :
L'établissement ne s'intéresse pas au produit — il s'intéresse à la conformité (alignement programme), à la facturation (cycle scolaire, septembre-juin), et à la responsabilité légale (données de mineurs). C'est un acheteur, pas un utilisateur.
L'enseignant est à la fois consommateur de contenu (il utilise des packs existants) et créateur (il construit ses propres séquences). Il a besoin de visibilité sur ce que font ses élèves, mais il n'a pas le temps d'apprendre un outil complexe. Son critère #1 : est-ce que ça me fait gagner du temps ?
L'élève ne s'intéresse pas à l'outil — il s'intéresse à ce qu'il doit faire pour valider. Il explorera librement si et seulement si l'interface l'y invite sans friction.
Le curriculum n'est pas un acteur humain mais une contrainte sémantique : un ensemble de notions, de compétences et de progressions qui doivent être couverts. C'est lui qui donne leur sens aux parcours scolaires — un parcours Gexor "Première Guerre Mondiale" n'est éducatif que s'il mappe sur les compétences officielles attendues en Terminale.

La vraie question de philosophie produit
Quand un élève suit un parcours assigné dans Gexor, que se passe-t-il s'il s'écarte du chemin et explore un nœud adjacent ?
Il y a trois réponses possibles :
Option 1 — Jardin fermé : l'élève ne peut explorer que les nœuds du parcours. C'est propre, facile à tracer, mais ça tue l'âme de Gexor. Tu transformes un navigateur en diaporama.
Option 2 — Liberté guidée : le parcours est la colonne vertébrale, l'élève peut toujours brancher sur le graphe libre, et le prof voit tout — ce qui était assigné ET les explorations spontanées. C'est fidèle à l'esprit Gexor et potentiellement très riche pédagogiquement (l'élève qui creuse Bismarck alors que le cours portait sur Napoléon III mérite d'être vu).
Option 3 — Checkpoints libres : l'élève explore librement mais doit "valider" certains nœuds obligatoires. L'ordre est libre, l'obligation est précise.
L'option 2 est la plus cohérente avec la vision Gexor. Mais elle crée une exigence de tracking non triviale : il faut distinguer dans les données ce qui était assigné de ce qui a été exploré spontanément.

Structure abstraite du portail
Quatre couches distinctes, pas des features mais des espaces :
La licence institutionnelle : gestion des sièges (N élèves, M profs), cycle de facturation calqué sur l'année scolaire, isolation des données par établissement (contrainte RGPD pour les mineurs).
L'espace enseignant : création/assignation de parcours à une classe, tableau de bord de progression, et — si on choisit l'option 2 — visualisation des explorations spontanées. C'est aussi là que l'enseignant accède aux packs scolaires certifiés depuis la marketplace.
L'espace élève : vue simplifiée de Gexor. Le moteur 3D complet, mais avec les parcours assignés mis en évidence (pas cachés, mis en évidence). L'élève sait où il doit aller, et il peut aller ailleurs.
Le contenu scolaire certifié : c'est le vrai actif stratégique. Des packs alignés sur les programmes officiels (par niveau, par matière, par compétence), distincts de la marketplace grand public. Ce contenu peut venir de Gexor en interne (éditorial) ou d'enseignants certifiés tiers. La certification est la différence — un pack "scolaire" répond à des critères vérifiés, pas juste publiés.

Ce qui est vraiment difficile
Le mapping curriculum → LOD est le problème le plus dur. Les programmes officiels utilisent un vocabulaire ("La France de 1848 à 1870", "les équilibres climatiques") qui ne correspond pas directement aux Q-IDs Wikidata. Il faut un travail éditorial sérieux pour faire ce mapping, et c'est là que la vraie valeur est créée — pas dans la technologie.
L'authoring enseignant doit être extrêmement simple. Un prof de lycée qui passe plus de 20 minutes à créer un parcours dans Gexor abandonnera. L'outil de création doit donc être un cas d'usage prioritaire du design, pas une afterthought.
La gestion des données de mineurs (RGPD, CNIL) est un blocage commercial si elle n'est pas traitée dès le début. L'établissement est responsable légal, pas Gexor — mais Gexor doit lui donner les outils pour l'être.

Positionnement marché
Le portail éducatif n'est pas en compétition avec Pronote ou les LMS (Moodle, Canvas). Ces outils gèrent l'administration scolaire et la remise de devoirs. Gexor gère l'exploration de la connaissance structurée. Ce sont des couches complémentaires, pas concurrentes — ce qui ouvre une piste d'intégration (parcours Gexor assignés depuis Pronote, résultats remontés dans le LMS).