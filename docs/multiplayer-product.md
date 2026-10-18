# Parcours multijoueur

Le parcours public et privé repose sur le [lobby durable](multiplayer-sessions.md).
Le membership PostgreSQL survit au refresh ; les capacités et la version sont
figées depuis le build publié. START crée une session et un roster opaques.
GameRuntime charge le build et émet START v2 après READY, avec un ticket frais.

La plateforme n'héberge aucun moteur gameplay ni serveur de jeu dans son dépôt.
Le serveur déployé échange le ticket, exécute la partie et notifie playing/results.
Le même lobby permet le replay vers une nouvelle session et de nouveaux tickets.
Voir [PONG-MIGRATION-1](pong-migration.md) pour la recette et l'activation.
