# Accès online public et privé

Les capacités `online.access` de la version active publiée contrôlent les liens
catalogue et les routes. Un compte Chibasko Games est nécessaire au multijoueur.
L'API valide l'identité serveur, les quotas, les memberships et le statut du jeu.
Un code privé identifie un groupe ; il n'est jamais un ticket gameplay.

Le directory est PostgreSQL, paginé et limité aux salons publics waiting ouverts.
Les opérations sont transactionnelles et multi-instance. Les anciennes rooms
lobby/annuaires Colyseus process-locaux et leur serveur portail sont supprimés.
Le gameplay a un transport distinct vers le deployment sélectionné.

Voir [multiplayer-sessions.md](multiplayer-sessions.md) et
[online-sessions.md](online-sessions.md).
