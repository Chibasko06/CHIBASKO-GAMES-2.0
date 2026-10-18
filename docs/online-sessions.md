# Online sessions

Le control plane gère l'identité, le lobby, la sélection du deployment et la
composition de session. Le data plane relie directement le jeu à son serveur.
Le même contrat s'applique aux jeux officiels, tiers, self-hosted et Chibasko-hosted.
Public/private reste une politique de découverte et d'admission au lobby.

## Ressources

Les salons et `GameSessionCoordinator` actuels sont en mémoire et liés aux
réservations Colyseus legacy. Ils ne constituent pas un registre de sessions
générique durable. Les nouvelles ressources ne dupliquent pas le catalogue ni
`game_versions` :

- `game_server_deployments` : jeu, endpoint TLS, mode d'hébergement, état, région.
- `game_server_deployment_versions` : compatibilité explicite avec chaque build.
- `game_online_sessions` : version exacte, deployment sélectionné, ready/closed.
- `game_online_participants` : correspondance privée Auth ↔ pseudonyme de session.
- `game_server_credentials` : hashes, expiration et révocation ; plusieurs actives
  sont possibles pendant une rotation.
- `game_connection_tickets` : hashes, launch/generation, participant et receipt
  d'exchange. Le deployment/jeu/version sont liés via la session et les FK.
- `game_exchange_limits` : compteurs transitoires anti-abus, sans secret.

`onlineSessionService.prepare()` est un port backend pour le lobby authentifié.
Il reçoit une version, un deployment sélectionné par le control plane et le roster
déjà autorisé. Il n'existe aucune API navigateur acceptant un roster ou un endpoint.
La DB vérifie la compatibilité version/deployment, les capacités et l'unicité des
participants. La limite opérationnelle est 4096 participants ; le schéma manifest
actuel borne déjà les capacités à 1024. Aucune hypothèse de jeu à deux joueurs.

Chaque session attribue `s_<32 hex>` et chaque participant `p_<32 hex>` avec UUID
aléatoires indépendants des identités Auth. Tous les lancements d'une même partie
partagent le même `s_...`. Un lancement online représente un participant authentifié.
Le partage d'un appareil entre plusieurs identités online nécessitera une admission
explicite de ces identités ; le navigateur ne peut pas s'attribuer leurs tickets.

## Lancement et START

1. Le lobby backend prépare la session et son roster, puis transmet sa référence
   opaque aux participants autorisés.
2. `POST /api/game-launches` résout le build et utilise réellement
   `onlineSessionService.authorize` pour vérifier le participant et projeter INIT.
3. INIT ne contient aucun endpoint ni ticket. Le SDK charge les ressources puis
   annonce READY. Le heartbeat continue pendant ce chargement.
4. Pour Bridge v2, le runtime appelle
   `POST /api/game-launches/{launchId}/start` avec `{controlToken,generation}`.
   Le token de contrôle reste dans le portail et n'atteint jamais le jeu.
5. La transaction revérifie la launch, les droits preview/publication, la session,
   le participant et le deployment. Elle crée un ticket de 256 bits, valable au
   plus trois minutes, uniquement hashé en DB.
6. GAMEPLAY_START transmet le bootstrap au document exact, avec l'origine exacte.
   Le jeu transmet le ticket dans le body HTTPS, le premier message WebSocket ou
   ses options de join. Le ticket ne doit pas figurer dans une URL ou des logs.

Une réponse START perdue peut être réessayée avant consommation : le nouveau ticket
révoque les précédents de cette launch. Après un exchange, aucune nouvelle admission
n'est créée pour cette launch. STOP/START visibilité réutilise le même contexte et
ne reconnecte pas le serveur. Retry du runtime crée une nouvelle launch/génération.
Les appels START sont single-flight, bornés par le budget descriptor (15 secondes),
et leurs réponses tardives sont ignorées après teardown.

## Exchange HTTP public serveur-à-serveur

```http
POST /api/game-server/v1/tickets/exchange
Authorization: Bearer <deployment-credential>
Content-Type: application/json

{"ticket":"<opaque-ticket>","requestId":"<operation-uuid>"}
```

Réponse : `{data:{gameId,gameVersionId,onlineSessionId,participant:{id,displayName}}}`.
Erreurs stables : `invalid_credential`, `invalid_ticket`, `ticket_expired`,
`ticket_replayed`, `rate_limited`, `service_unavailable`. Les réponses sont no-store,
sans CORS navigateur, clé R2, identifiant Auth, email ou détail SQL.

La credential est un secret aléatoire de 256 bits, distinct du ticket, configuré
dans l'environnement du serveur externe ou injecté dans le container hébergé.
Seul son SHA-256 est stocké. `createCredential()` est un port backend séparé qui
retourne le secret une seule fois au processus de provisioning, avec expiration
entre une heure et 90 jours. Cette phase n'en provisionne aucune réellement.
Une rotation ajoute une nouvelle credential,
met à jour le serveur, puis révoque l'ancienne. Les credentials ont une expiration.

L'exchange verrouille la ligne ticket et vérifie toutes les associations et états.
Une autre credential de deployment ne peut pas l'échanger. Pendant 30 secondes
au maximum et avant expiration du ticket, la même credential et le même requestId
retrouvent les mêmes claims. Un autre requestId, une autre credential même en
rotation ou un retry plus tardif est un rejeu. La clé doit être conservée par le
serveur pour réessayer une admission, jamais partagée avec le client du jeu.
Le serveur associe ce receipt à une seule admission interne, y compris lors de
deux appels simultanés. L'idempotence ne dispense pas le serveur de cette unicité.

Après admission, la durée du ticket n'affecte plus la connexion. Reconnect et
résultats relèvent du serveur gameplay et de leur futur contrat. La révocation
bloque les nouveaux exchanges, sans prétendre fermer une socket déjà établie.

## Sécurité, exploitation et limites

RLS interdit tout accès anon/authenticated aux tables et RPC sensibles. Seul le
backend service_role manipule les hashes. Les endpoints client utilisent HTTPS/WSS,
sans userinfo/query/fragment. Les IP littérales, noms locaux et schémas dangereux
sont refusés. Cette validation concerne une destination navigateur ; elle ne suffit
pas pour un futur appel backend sortant : celui-ci devra ajouter protection SSRF,
résolution DNS/IP et contrôle des redirections. Aucun appel vers le deployment
n'est effectué par la plateforme ici.

La policy CSP approuvée de la version doit autoriser l'origine gameplay/signaling
avant activation. `chibasko.json` ne choisit ni endpoint ni accès réseau. Le routage
de deployment ne contourne pas la policy du gateway. Les origines API Auth et
admin ne doivent jamais être ajoutées à la policy d'un jeu.

Limites atomiques actuelles : 60 émissions par utilisateur/minute, 600 exchanges
par credential/minute et 10000 échecs d'authentification/minute au total. Les refus
retournés comme valeurs SQL conservent les compteurs même en cas d'échec. Les
credentials valides utilisent des compteurs indépendants par deployment-credential ;
elles ne partagent pas un verrou global d'exchange entre jeux.
Une protection edge/réseau s'ajoute lors de l'activation, sans remplacer le contrôle
DB. Aucune IP arbitraire du navigateur n'est utilisée comme identité serveur.

Les logs d'accès doivent exclure Authorization et les bodies ; les identifiants
de corrélation, codes et statuts suffisent. Aucun ticket/credential brut en logs.
`distribution_cleanup_online()` supprime tickets expirés depuis une heure,
compteurs anciens et sessions fermées depuis un jour sans ticket restant. Le
control plane ferme les sessions terminées ; le nettoyage se planifie avec les
autres jobs backend lors de l'activation. Une panne DB refuse l'admission et se
réessaie avec le même requestId. Aucune validation n'est effectuée en mémoire
comme substitut à la transaction SQL.

## Compatibilité et migration

SDK 0.2.0 publié : Bridge v1 inchangé, START sans contexte réseau.
SDK 0.3.0 préparé : Bridge v2, contexte START discriminé local/online.
integrationVersion reste 1. Le host verrouille la version au premier HELLO valide.
Bridge v1 ne reçoit jamais un ticket caché dans INIT ou un champ supplémentaire.

Avant PONG-MIGRATION : adapter le lobby générique à `prepare`, sélectionner et
provisionner un deployment compatible, appliquer les migrations par le processus
de déploiement, activer la policy réseau, publier séparément le SDK 0.3.0, puis
adapter le client et le serveur Pong à ce contrat. Le legacy n'est pas modifié
dans cette phase. Les dépendances Git privées et le blocage Cloudflare associé
restent destinés à disparaître avec la migration finale.

## Recette locale

`npm run test:online-session`, `npm run test:online-session-db`,
`npm run test:game-runtime` et `npm run test:game-runtime-browser`.
`tests/online-session.browser.test.mjs` exige deux consommateurs externes installés
via `SDK_V1_CONSUMER_DIRECTORY` (npm 0.2.0 publié) et
`SDK_V2_CONSUMER_DIRECTORY` (tarball 0.3.0). Tous les endpoints navigateur de cette
recette sont interceptés localement. PostgreSQL jetable n'utilise aucune URL Supabase.


Les ports backend `closeSession()`, `removeParticipant()` et `revokeCredential()`
exposent les transitions sans endpoint de provisioning navigateur. L'API écrit
uniquement des événements structurés requestId/operation/status/code, jamais
les bodies, Authorization ou contexte START.
