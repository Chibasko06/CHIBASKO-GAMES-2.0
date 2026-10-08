# Chibasko Playground local authentifié

Projet Node 24 autonome, TypeScript strict, hors build Cloudflare et sans workspace.
Supabase Auth valide les admissions ; PostgreSQL fournit le profil public.
Aucune clé service_role, aucun stockage R2, aucun déploiement du serveur de jeu.

## Configuration et lancement

Copier `.env.example` vers `.env.local` dans game-server et remplir uniquement
SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY avec la configuration publique du même
projet Supabase que le site. Les clés secret/service_role sont refusées.
`.env.local` reste ignoré par Git. Node le charge pour `dev`, sans dotenv.
Le script start attend les variables dans l'environnement du processus.

Depuis la racine :

```powershell
npm ci
npm --prefix game-server ci
# Terminal 1
npm run dev
# Terminal 2
npm --prefix game-server run dev
```

Se connecter sur http://localhost:3000/login puis ouvrir
http://localhost:3000/playground dans deux onglets du même navigateur.
La session du domaine de production n'est pas partagée avec localhost.
Cliquer Connexion dans chaque onglet : même userId/username/avatar, sessionId
distincts. Déplacer les joueurs et vérifier la synchronisation. Se déconnecter
de Chibasko doit fermer les connexions multijoueurs.

## Protocole et sécurité

Le JWT est envoyé uniquement dans Authorization de la requête HTTP POST
`/matchmake/joinOrCreate/playground`, avec corps `{}`. Le hook static onAuth
appelle getUser(token), puis lit profiles avec user.id. Profil absent/invalide,
token absent/invalide/expiré ou panne Supabase : admission refusée.
Client Supabase dédié à chaque admission ; aucun token global partagé.
L'expiration est décodée seulement après validation Auth.

Colyseus conserve l'identité privée dans une réservation de 10 secondes.
Le SDK consomme cette réservation sans client.auth.token et avec une URL contrôlée :
origine attendue, seul paramètre sessionId autorisé. Ticket à usage unique.
Ne jamais logger Authorization, objets requête/auth, URL complète ou query strings.
Le SDK peut afficher une erreur réseau générique sans réponse Supabase ni token.

État public : players[sessionId] = { userId, username, avatarUrl, x, y }.
Avatar SQL null devient une chaîne vide. Aucun email, JWT, expiresAt ou User.
Deux connexions du même compte sont autorisées. Position initiale (50,50),
16 joueurs maximum, patches toutes les 50 ms. Message move inchangé : exactement
x/y, entiers finis 0–100, une case orthogonale, intervalle minimum 100 ms.

Fermeture à l'expiration du JWT (code 4001), avec contrôle avant chaque move.
Reconnexion manuelle avec la session navigateur actualisée ; aucun refresh custom.
SignOut/changement de compte/démontage ferme la room, même si le join termine tard.
Un logout sur un autre appareil ne révoque pas immédiatement un JWT déjà accepté.

## Validation

```powershell
npm test
npm run lint
npm run build
npm run build:cloudflare
npm --prefix game-server test
npm --prefix game-server run test:auth
npm --prefix game-server run build
# Depuis game-server, démarrage compilé local
node --env-file=.env.local dist/index.js
```

Tests : Supabase simulé, horloge injectable et vrais clients HTTP/WebSocket locaux.
Aucun test automatisé ne contacte Supabase production. /playground reste 404
hors développement. Le serveur écoute uniquement 127.0.0.1:2567.

## Futur hébergement

Le helper accepte une origine explicite pour préparer HTTPS/WSS sur
game.chibaskogames.fr. Ne pas exposer ce prototype tel quel : prévoir TLS,
filtrage des origines, limitation des requêtes et masquage des tickets dans les
logs du proxy. Conserver HTTP authentifié / WebSocket sans JWT. Aucun VPS,
Redis, Docker ou système de tickets supplémentaire n'est installé ici.
