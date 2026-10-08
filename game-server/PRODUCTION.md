# Production Chibasko Games — préparation, aucun déploiement automatique

Architecture : navigateur HTTPS/WSS → Caddy → Node 24 sur 127.0.0.1:2567.
Une instance, un VPS, systemd. Pas de Redis, Docker ou cluster.
Toutes les rooms, transitions, réservations et limites sont en mémoire.
Un redémarrage interrompt les parties ; aucune reconnexion/récupération garantie.
Supabase conserve Auth et PostgreSQL ; R2 et Resend ne sont pas utilisés ici.

## Configuration

Installer une version corrective maintenue de Node 24 LTS depuis une distribution
officielle, vérifier son origine/signature et `node --version`. Le projet conserve
`engines.node >=24` volontairement ; ne pas changer de majeure sans recette.

Fichier privé `/etc/chibasko-games/game-server.env`, hors Git, propriétaire root,
mode 0600 (systemd lit EnvironmentFile avant changement d'utilisateur) :

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=2567
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
ALLOWED_ORIGINS=https://chibaskogames.fr,https://www.chibaskogames.fr
ENABLED_GAME_IDS=
```

Compléter uniquement URL et clé publique du projet Supabase. Aucune service_role,
clé secret Supabase, R2, Resend, refresh token ou credential frontend nécessaire.
La clé publique est validée : publishable ou ancien JWT de rôle anon uniquement.
La configuration invalide fait échouer le démarrage sans afficher ses valeurs.
HOST accepte une IP explicite, PORT 1–65535. Origines exactes séparées par virgules,
sans chemin, wildcard, credentials ; HTTPS obligatoire en production. DEBUG y est interdit.

`ENABLED_GAME_IDS` vide désactive les jeux ; pour une recette contrôlée seulement,
`ENABLED_GAME_IDS=chibasko-pong` active le squelette technique sans publier sa fiche.
Le registre reste autoritaire. Publier une fiche en DB n'active pas le serveur,
et masquer une fiche ne constitue pas une permission serveur.
En dev, omettre ENABLED_GAME_IDS active les jeux connus ; une valeur vide les désactive.

Le frontend configure séparément `NEXT_PUBLIC_GAME_SERVER_URL=https://game.chibaskogames.fr`
au build Cloudflare. Aucun fallback localhost en production. Pas de publicAddress
Colyseus à ajouter : les réservations restent sur la même origine publique.

## Origines, proxy et limites

Le filtre HTTP passe devant les routes Colyseus, y compris /matchmake et OPTIONS.
Les origines inconnues sont refusées. En production, Origin absent est refusé
sur les routes navigateur ; GET /health reste utilisable sans Origin.
WebSocket vérifie Origin avant upgrade et refuse Authorization et _authToken.
Le JWT reste exclusivement dans Authorization du matchmaking HTTP.
En développement/test, l'absence d'Origin est autorisée pour les clients Node.

La seule IP transférée lue est X-Real-IP, seulement depuis 127.0.0.1 ou ::1
(IPv4-mapped normalisée), et seulement si c'est une IP valide unique. Sinon,
adresse socket. Un processus local est donc dans la frontière de confiance.
Caddy remplace X-Real-IP par l'adresse réseau réelle et supprime les alternatives.
Ne pas réutiliser cet exemple derrière Cloudflare proxied sans revoir cette chaîne.

Fenêtres fixes en mémoire, 60 secondes : resolver 10/IP, création lobby 10/IP,
autre matchmaking 60/IP en production. Dev : création 100, matchmaking 600.
Maps bornées à 10 000 clés chacune, expirées à la prochaine requête et vidées à l'arrêt.
HTTP 429, Retry-After 60. Pas de limite de gameplay via ce mécanisme.
Maximum 3 lobbies actifs créés par compte, quota rendu à la destruction de la room,
y compris expiration de réservation non consommée. Les lobbies d'autres créateurs
restent rejoignables. Les quotas par IP peuvent affecter des utilisateurs derrière NAT.

## Health, arrêt et logs

GET /health : 200 {"status":"ok"}, ou 503 {"status":"shutting_down"} pendant
l'arrêt avant fermeture réseau. Aucun appel Supabase. / et /__healthcheck : 404.
PlaygroundRoom n'est pas enregistrée en production ; pages frontend playground DEV ONLY.

SIGTERM/SIGINT : état draining immédiat, nouvelles admissions refusées,
nettoyage coordinateur puis Colyseus, attente fermeture HTTP ; délai maximum 20 s.
Succès exit 0, erreur/timeout exit 1 ; second signal force exit 1.
uncaughtException/unhandledRejection : événement fatal, arrêt borné, exit 1.
Un arrêt après erreur fatale est best-effort, jamais une garantie de récupération.
systemd TimeoutStopSec 30 laisse de la marge. Les parties ne sont pas terminées.

Logs JSON à noms d'événements fixes ; pas d'objet Error/message/stack brut,
JWT, email, identité, réservation ou URL. Le logger Colyseus jette ses arguments.
Le fetch Supabase traduit les pannes en réponse générique sans exception réseau
brute imprimée par le SDK ; budget réseau commun 7 s pour Auth et profil.
Ne pas activer DEBUG, access logs ou log_credentials lors de la recette.
L'exemple Caddy conserve des événements runtime minimaux sans requête ni message
libre ; ne pas retirer ces filtres pour diagnostiquer avec de vrais tokens.

## Releases et service (commandes à exécuter plus tard sur Linux)

Créer un utilisateur de déploiement et un utilisateur runtime non privilégié
`chibasko-games`. Code détenu par le déployeur, lisible mais non modifiable par runtime.
Structure : `/opt/chibasko-games/releases/<sha>` et `current` symlink vers une release.
Les exemples deploy/systemd et deploy/caddy doivent être adaptés et validés.
Ne jamais installer/compiler comme root. Ne pas copier de .env du poste de travail.

Pour une nouvelle release, depuis un clone de déploiement propre :

```sh
# SHA exact revu et disponible sur GitHub ; jamais un checkout sale en service.
git fetch origin
git worktree add --detach /opt/chibasko-games/releases/<sha> <sha>
cd /opt/chibasko-games/releases/<sha>/game-server
npm ci
npm test
npm run build
# Optionnel après build/tests : npm prune --omit=dev
```

Les devDependencies sont nécessaires à TypeScript. L'ancienne release reste active
pendant l'installation. Pour activation atomique, avec droits de déploiement :

```sh
ln -s /opt/chibasko-games/releases/<sha> /opt/chibasko-games/current.next
mv -Tf /opt/chibasko-games/current.next /opt/chibasko-games/current
sudo systemctl restart chibasko-games-server
curl --fail http://127.0.0.1:2567/health
```

Avant premier démarrage : installer l'exemple systemd comme unité réelle,
adapter le chemin Node et l'utilisateur, daemon-reload, enable. Vérifier ensuite
restart, SIGTERM et journalctl. Ne pas créer GitHub Actions à ce stade.

Rollback : mêmes deux commandes de symlink avec le SHA précédent, restart,
health, puis recette HTTP/WSS rapide. Conserver cette release et sa configuration
compatible. Aucune SQL dans cette phase, aucune donnée métier à restaurer ici.

## Réseau et recette du futur VPS

Ouvrir SSH (clé, restreindre IP si possible), TCP 80/443. Autoriser SSH avant
activation du firewall. Bloquer 2567 publiquement, appliquer aussi IPv6.
Sortie DNS/HTTPS et horloge système correcte nécessaires pour Supabase/TLS/JWT.
Caddy conserve son répertoire de données inscriptible pour les certificats.
DNS A game → IPv4 VPS, DNS only initialement. AAAA seulement avec IPv6 opérationnel.
Ne rien changer au domaine principal. Caddy obtient/renouvelle le certificat.

```sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl status chibasko-games-server
sudo journalctl -u chibasko-games-server --since today
curl --fail https://game.chibaskogames.fr/health
```

Valider sur Linux les exemples (Caddy/systemd ne sont pas exécutés par les tests Node).
Tester Origin refusée, deux IP, deux comptes, création/join/ready/start/admissions,
JWT absent WS, shutdown et absence de logs sensibles. Ne pas publier Chibasko Pong.
Surveiller CPU/RAM/disque, health, redémarrages et rétention journalctl.
Sauvegarder configurations privées hors Git, code via Git ; pas les rooms mémoire.

## Limite single instance

Le resolver utilise des rooms locales et le coordinateur conserve callbacks/maps.
Plusieurs processus nécessiteront présence/driver distribués, coordination et
routage vers le processus propriétaire. Ajouter Redis seul ne suffira pas.
