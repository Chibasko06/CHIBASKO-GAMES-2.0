# Serveur multijoueur Chibasko Games

Processus Node 24 / TypeScript strict autonome, hors build Next.js/Cloudflare.
Le package frère packages/game-sdk est une dépendance locale : conserver ce
dossier dans chaque release. Les précommandes build/test/dev le compilent sans
React via tsconfig.server.json. Aucun build Next.js n'est nécessaire côté VPS.
Le moteur pur games/chibasko-pong/shared est également une dépendance locale ;
conserver ce dossier dans la release. Les mêmes précommandes le compilent.
Online reste autoritaire : seul le serveur applique ce moteur aux inputs réseau.
Le mode local navigateur utilise la même source, sans accès à l'admission ni
au coordinateur ; ses résultats ne sont ni envoyés ni persistés.
Une instance Colyseus 0.18, sans workspace, Redis ou Docker.

## Développement

Copier `.env.example` vers `.env.local` (ignoré par Git) et compléter SUPABASE_URL
et SUPABASE_PUBLISHABLE_KEY du même projet que le site. Aucune service_role.
Conserver les origines locales explicites. Omettre ENABLED_GAME_IDS en dev pour
activer les jeux connus ; une valeur vide les désactive.

Depuis la racine, dans deux terminaux séparés :

```sh
npm --prefix game-server ci
npm --prefix game-server run dev
```

```sh
npm run dev
```

Le serveur écoute par défaut sur 127.0.0.1:2567. Le site utilise localhost:3000.
Se connecter localement ; les sessions du domaine production ne sont pas partagées.
/playground et /lobby-playground restent des outils DEV ONLY.

```sh
npm --prefix game-server test
npm --prefix game-server run test:auth
npm --prefix game-server run build
```

`npm start` lance dist/index.js et attend les variables dans le processus ;
il ne charge pas .env.local. En local après compilation :

```sh
cd game-server
node --env-file=.env.local dist/index.js
```

## Architecture et sécurité

Auth Supabase pendant HTTP matchmaking, JWT dans Authorization uniquement.
Le WebSocket n'utilise pas de JWT ni _authToken. Identité issue de getUser,
username/avatar issus de profiles sous RLS. Expiration serveur ; signOut client
ferme les connexions. Aucun User complet/email/token synchronisé.

PlaygroundRoom : déplacement validé et état public, en dev/test seulement.
LobbyRoom : code 6 caractères sans I/O/0/1, créateur hôte garanti après admission,
ready strict, transfert au plus ancien, un userId par lobby. Même compte permis
sur d'autres lobbies. Création `{ gameId, visibility }`, join `{ expectedGameId }`
obligatoires. Visibilité public/private fixée à la création, capacités vérifiées
côté serveur. Le directory public authentifié ne contient que des snapshots
minimaux de salons WAITING rejoignables. Voir [accès online](../docs/online-access.md).
GameRegistry : chibasko-pong, 2 joueurs, aucune règle réseau choisie par navigateur.
Le manifeste catalogue est généré depuis ce registre.

WAITING → STARTING (3 s) → GameSessionCoordinator crée PongRoom privée et ses
réservations individuelles → admissions réelles → PLAYING.
Échec/timeout (10 s après countdown) ou départ : nettoyage et retour WAITING,
ready remis à false. Lobby connecté en parallèle. Lobby vide détruit.
PongRoom est un prototype technique local 1v1 : simulation serveur 30 Hz,
terrain 1000 × 600, premier à 5, countdown 3 s et pause entre points 1 s.
Le seul input client est `set_input { direction: -1 | 0 | 1 }`.
La GameRoom attribue les côtés et décide de toute la physique et du résultat.
Abandon pendant countdown/jeu/pause : victoire adverse, sans score enregistré.
Le coordinateur reçoit `completed(result)` puis le lobby passe RESULTS.
L'hôte envoie `return_to_lobby` : destruction de la GameRoom, WAITING et ready false.
Les connexions lobby restent ouvertes ; chacun se prépare pour une nouvelle partie.

## Test Pong local avec deux comptes

Lancer le site et le game-server, puis connecter deux comptes distincts sur
http://localhost:3000 (deux profils/navigateurs). Ouvrir /lobby-playground dans
les deux : A crée, B rejoint avec le code, les deux prêts, A lance.
Cliquer le canvas ou y placer le focus : ↑/W et ↓/S. Premier à 5 → résultats.
L'hôte revient à la salle d'attente, chacun Ready, nouvelle partie.
Le canvas conserve le ratio 1000/600 sur mobile ; contrôles tactiles disponibles.
La page réutilise le produit sans aucune fiche/catalogue publiée ou SQL.
Chibasko Pong reste un jeu technique non publié, non déployé et désactivé par défaut
en production. Le VPS reste en pause.

## Production et exploitation

Voir [PRODUCTION.md](PRODUCTION.md) : configuration, origines HTTP/WS, IP proxy,
limites, health, arrêt 20 s, logs sûrs, releases, rollback, systemd et Caddy.
Les exemples sous deploy/ sont uniquement des modèles à adapter/valider.
Aucun déploiement, DNS ou publication de Chibasko Pong automatique.
Rooms et sessions en mémoire : redémarrer interrompt les parties sans récupération.
