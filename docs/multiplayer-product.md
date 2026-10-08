# Lobby Chibasko Games — local

Le site et le serveur restent deux projets npm autonomes. Aucun gameplay, serveur
de production, publication automatique, migration SQL ou secret supplémentaire.

## Configuration locale

Le site utilise `http://127.0.0.1:2567` **uniquement en développement**. Une autre
origine peut être fournie dans le `.env.local` racine ignoré par Git :
`NEXT_PUBLIC_GAME_SERVER_URL`. C'est une configuration publique de build ; elle
accepte HTTPS, ou HTTP loopback uniquement en développement. En production, sans
valeur HTTPS explicite, les actions restent désactivées et le catalogue public reste accessible.

Créer manuellement `game-server/.env.local` (ignoré) à partir de `.env.example`, avec
`SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` du même projet que le site. Utiliser
exclusivement une clé publishable/anon, jamais service_role. Ne pas copier l'ensemble
des secrets du site vers le serveur de jeu.

Dans deux terminaux :

```sh
npm run dev
```

```sh
cd game-server
npm run dev
```

Le test manuel exige une fiche **publiée** de type `multiplayer_chibasko` associée
au registre réel. Le code ne crée ni ne publie automatiquement Chibasko Pong.
Si aucun jeu multi n'est publié, utiliser les tests réseau déterministes et les
playgrounds DEV ONLY. Ne pas publier un prototype sans gameplay comme un jeu final.

## Parcours

A se connecte sur localhost, ouvre la fiche, crée et attend son admission comme
hôte. La session racine survit à `/games/[slug]` → `/games/[slug]/lobby/[code]`.
B, avec un compte distinct dans un autre profil navigateur, rejoint depuis la
fiche, le lien partagé ou `/multiplayer`. Chaque joueur se prépare ; l'hôte lance.
Le lobby reste connecté pendant les admissions privées ; « Partie prête » exige
PLAYING et une GameRoom READY avec tous les joueurs.

Un refresh ou lien direct propose une admission explicite. Aucun auto-join ni
reconnexion transparente n'est promis. Un doublon temporaire se résout en fermant
l'ancienne connexion, attendant son départ, puis réessayant. Quitter, signOut,
changement de compte, sortie vers un autre jeu ou démontage global nettoient les
connexions. Les joins asynchrones devenus obsolètes sont fermés dès leur résolution.

## Sécurité et confidentialité

Le JWT n'est envoyé que dans Authorization des requêtes HTTP authentifiées.
Le WebSocket ne contient que la réservation Colyseus habituelle, sans JWT ni
_authToken. Les réservations privées ne figurent ni dans l'URL produit, ni dans les
schémas synchronisés, ni dans localStorage. Le jeu attendu est vérifié serveur.

`POST /lobbies/:code` est authentifié, sans listing, limité à dix tentatives par
minute par adresse socket (sans confiance en X-Forwarded-For), et ne retourne que
`gameId` ou une erreur générique. Limiteur en mémoire, adapté au process local
unique ; revoir la configuration proxy avant un futur VPS.

Les routes lobby sont noindex, hors sitemap, sans données structurées privées.
Google Analytics n'est pas chargé sur une arrivée directe dans un lobby ; les
collectes sont désactivées avant le passage produit vers un lobby. Les URL et
referrers fournis à l'initialisation sont nettoyés. Aucun événement métier ne
contient de code. Vérifier les paramètres de mesure améliorée lors d'un futur
déploiement public du serveur ; les journaux d'accès réseau restent susceptibles
de contenir le chemin HTTP partagé, qui n'est pas un secret.

## Vérification

`npm test` inclut les tests interface/auth/redirection et lifecycle client.
Dans `game-server`, `npm test` inclut un vrai flow réseau à deux identités simulées,
sans dépendance à Supabase production. Les suites existantes couvrent le timeout
partiel, les admissions, l'expiration et l'absence de JWT dans le WebSocket.
