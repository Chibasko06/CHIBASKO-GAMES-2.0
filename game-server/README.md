# Serveur multijoueur Chibasko Games

Projet Node 24 / TypeScript strict autonome, hors build Next.js/Cloudflare.
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
sur d'autres lobbies. Création `{ gameId }`, join `{ expectedGameId }` obligatoires.
GameRegistry : chibasko-pong, 2 joueurs, aucune règle réseau choisie par navigateur.
Le manifeste catalogue est généré depuis ce registre.

WAITING → STARTING (3 s) → GameSessionCoordinator crée PongRoom privée et ses
réservations individuelles → admissions réelles → PLAYING.
Échec/timeout (10 s après countdown) ou départ : nettoyage et retour WAITING,
ready remis à false. Lobby connecté en parallèle. Lobby vide détruit.
PongRoom est un squelette d'admission, sans balle, raquette, score ou gameplay.
RESULTS est préparé dans les types seulement.

## Production et exploitation

Voir [PRODUCTION.md](PRODUCTION.md) : configuration, origines HTTP/WS, IP proxy,
limites, health, arrêt 20 s, logs sûrs, releases, rollback, systemd et Caddy.
Les exemples sous deploy/ sont uniquement des modèles à adapter/valider.
Aucun déploiement, DNS ou publication de Chibasko Pong automatique.
Rooms et sessions en mémoire : redémarrer interrompt les parties sans récupération.
