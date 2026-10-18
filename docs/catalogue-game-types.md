# Catalogue et versions exécutables

Les champs éditoriaux `game_type`, `multiplayer_game_id`, `is_beta`, titre,
description, catégories et médias ne sélectionnent jamais un module source.
Le modèle historique classic/multiplayer reste compatible avec les données
existantes ; aucune ligne ni identité catalogue n'est remplacée par la migration.

Un jeu classic externe conserve son URL iframe validée. Un jeu artifact utilise
`games.active_version_id`. La projection publique `get_published_game_runtimes`
associe uniquement jeu publié, version active publiée et capabilities techniques.
La projection doit correspondre à la version active lue ; sinon aucun mode n'est
annoncé. Les liens local/public/private et les capacités joueurs en découlent.

Le formulaire admin accepte un identifiant catalogue sûr sans liste codée de jeux.
L'API refuse les endpoints gameplay, classes, room types et capacités arbitraires.
Le backend lobby revalide manifest et version, indépendamment de cette metadata.
Les migrations catalogue historiques ne sont ni réécrites ni rejouées.

Voir [PONG-MIGRATION-1](pong-migration.md) pour l'ordre d'activation et
`npm run test:catalogue-db` pour la préservation du schéma/données catalogue.
