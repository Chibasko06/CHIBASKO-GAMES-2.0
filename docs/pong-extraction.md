# Extraction de Chibasko Pong

Le code du jeu et son historique restent dans le dépôt Pong séparé. Le portail
ne consomme plus son ancien package Git : client, moteur, CSS, types gameplay,
registre et serveur legacy ont été retirés. Aucun override SDK n'est nécessaire.

La distribution finale est `build Web → validation → R2 → Artifact Gateway →
GameRuntime`. Le serveur authoritative se construit et se déploie séparément.
Les tags historiques ne sont pas modifiés. Le contexte et les recettes de
l'ancienne extraction de package restent consultables dans l'historique Git.

Voir [PONG-MIGRATION-1](pong-migration.md) pour l'admission v2, les validations,
le routage et les prérequis d'activation production.
