# PONG-MIGRATION-1

## Frontière finale

Le portail consomme des versions de builds Web, jamais des packages de jeux.
Son unique dépendance Chibasko Games est le SDK npm public 0.3.0.
Le client et le serveur authoritative Pong vivent exclusivement dans le dépôt
Pong. Le même pipeline sert les jeux officiels et tiers.

| Ancien consommateur supprimé | Responsabilité | Remplacement |
| --- | --- | --- |
| games/clientRegistry.ts et players React multiplayer | chargement du code client/local | active_version_id, capabilities publiées, GameRuntime iframe |
| MultiplayerProvider, productSession et connexions Colyseus portail | directory, admission, présence process locale | API lobby durable PostgreSQL |
| game-server et adaptateur Pong | lobby Colyseus, réservation, moteur | control plane durable et serveur autonome dans le dépôt jeu |
| build-pong, extraction/manifest source scripts | vérification de package Git et registre source | boundaries génériques, validation des artefacts, E2E inter-dépôts facultatif |
| package Pong et override SDK historique | consommation Git privée | aucune dépendance jeu dans package.json/lockfile |

Les jeux classiques externes conservent leur intégration iframe catalogue.
Les anciens tests de physique/driver sont conservés dans Pong, pas dupliqués
dans le portail. Les tests de sécurité, catalogue, admission, lobby, Bridge,
artefacts et runtime restent ici. Aucun changement du moteur Pong partagé.

## Parcours

- `/games/{slug}/local` : version active publiée, capacité local, GameRuntime.
- `/games/{slug}/online` : capacité public, compte authentifié, lobby durable.
- `/games/{slug}/private` : capacité private, création ou code privé du même jeu.
- `/games/{slug}/lobby/{id}` : membership durable restauré après refresh.

Un jeu sans version active compatible est indisponible ; aucun import historique
ne sert de secours. `get_published_game_runtimes()` retourne uniquement UUID du
jeu, UUID de version active et capabilities des jeux/versions publiés. Les labels
et liens catalogue ne connaissent ni registre de sources ni classes serveur.
L'identifiant catalogue historique reste une metadata, jamais un nom de module.

## Admission gameplay

READY déclenche START v2 et un ticket frais. Pong envoie le ticket et un requestId
dans le body HTTPS `/admission`, sans cookie ni ticket dans l'URL. Le serveur
utilise le helper SDK public pour l'exchange authentifié par deployment.

`GET /api/game-server/v1/sessions/{onlineSessionId}` fournit ensuite le roster
opaque figé au deployment authentifié. Cette projection générique évite que le
serveur fasse confiance à un nombre de joueurs ou à un roster du navigateur.
La credential est hashée avant la RPC, le deployment doit être actif et lié à
la session, les participants retirés invalident l'admission. API/RPC privées,
quota partagé 600/minute, aucun actor Auth UUID dans la réponse.

Pong choisit/crée sa room après ces contrôles. Deux premiers arrivants concurrents
sont coalescés dans le process authoritative. Une session est routée vers un seul
process deployment ; une future flotte gameplay doit fournir ce routage sticky
avant de lancer plusieurs instances du même deployment. Le portail ne route pas
directement une room Colyseus. Public/privé ne change pas l'admission gameplay.

Le serveur notifie playing/results par l'API lifecycle existante. Results ferme
la online session ; replay conserve le lobby et crée une nouvelle session.
Le ticket initial n'est pas un token de reconnexion. Pong applique actuellement
une politique sans reconnect automatique : déconnexion après début = forfait,
avant début = annulation ; le groupe peut rejouer avec une nouvelle session.

## Configuration et activation production

Le runbook opérationnel courant est [production-activation.md](production-activation.md)
avec sa [checklist](production-activation-checklist.md). Il précise les contrôles
de drift, la frontière PSL, la préactivation sur une cible parallèle et le rollback
du premier artefact ; les étapes ci-dessous résument seulement les dépendances.

1. Sauvegarder/auditer le schéma cible et appliquer uniquement les migrations
   manquantes dans l'ordre : distribution versions/uploads/previews, launch
   sessions/renewals, online sessions, multiplayer lobbies, puis
   `20261018000300_artifact_catalogue_and_server_roster.sql`. Aucun reset historique.
2. Activer l'infrastructure de validation, stockage R2 privé/final et gateway.
   Configurer le domaine de contenu indépendant avec wildcard DNS/TLS et la
   frontière cookies PSL exigée par GameRuntime. Aucun domaine réel n'est choisi ici.
3. Construire le serveur autonome Pong, fournir les secrets à l'exécution,
   configurer TLS et les origins autorisées. Enregistrer le deployment et sa
   compatibilité avec la version exacte ; aucune credential dans le build Web.
4. Récupérer l'UUID officiel du catalogue. Aucun UUID officiel n'est déductible
   de manière fiable des données versionnées ; le fournir explicitement au build
   avec une version SemVer indépendante. L'UUID fixture est refusé en production.
5. Valider/uploader le build, review/publier la version, approuver uniquement les
   origins réseau du deployment, puis sélectionner active_version_id.
6. Activer les flags runtime/gateway et vérifier local, public, privé, replay,
   révocation et lazy assets avant d'ouvrir les liens du catalogue.

Ne pas pousser ce changement sur une branche déclenchant un déploiement automatique
avant la préparation de ces ressources : aucun parcours package fallback subsiste.
Une installation/build réussie ne constitue pas une activation produit.

## Recettes locales

```powershell
npm ci
npm test
npm run test:game-runtime-browser
npm run test:multiplayer-db
$env:PONG_TEST_REPOSITORY='C:\Users\chiba\ChibaskoGames\chibasko-pong'
npm run test:pong-e2e
```

L'E2E exige un dépôt Pong construit indépendamment (`build:server`,
`build:web:fixture`) et n'intervient ni dans npm ci ni dans le build du portail.
Il crée son propre PostgreSQL jetable. Chrome utilise deux contextes distincts,
le vrai SDK npm embarqué, le vrai runtime et gateway, les vraies RPC de lobby,
launch, ticket et exchange, et le serveur Pong loopback. Les fichiers R2 sont
un adapter mémoire et les domaines HTTPS sont interceptés localement ; aucun
DNS, bucket, deployment ou credential réel n'est créé. Un proxy WebSocket de test
relaie les vrais frames au serveur local, sans copier l'implémentation du runtime.
L'accélération appelle uniquement le driver de la fixture, sans endpoint de triche.

Les builds Cloudflare doivent être vérifiés sur une copie sans node_modules,
.next ni .open-next et sans accès Git. Aucun `skipNextBuild` ne prouve une
installation propre. Les versions historiques/taggées des dépôts restent intactes.

## Validation locale du 18 octobre 2026

| Contrôle | Résultat |
| --- | --- |
| Portail npm ci | réussi, SDK npm exact 0.3.0, aucun package Pong installé |
| Copie neuve indépendante | 708 packages installés ; Git désactivé, configurations npm vides, aucun .env ou ancien node_modules/.next/.open-next copié |
| Next par défaut | Turbopack réussi, sans workaround de cache Webpack hérité |
| Next Webpack | réussi avec le cache normal |
| Cloudflare fresh | build complet réussi, nouvelle compilation Turbopack puis bundle Worker ; aucun skipNextBuild |
| TypeScript / lint ciblé | réussis |
| npm test portail | 142 tests réussis, dont distribution, upload, gateway, runtime, online, lobby, catalogue et sécurité admin |
| Runtime Chrome | 16 scénarios réussis, isolation, responsive, preview et lazy assets après 45 minutes |
| Lobby PostgreSQL + Chrome | concurrence join/START, deux instances, 128 participants, public/privé, refresh et replay réussis |
| Nouveau roster serveur | RLS, projection publique, binding deployment, révocation, session fermée et erreurs HTTP sûres vérifiés |
| Pong autonome | build client/server, typecheck, 25 tests, configuration production, admission HTTP/WebSocket et forfait réussis |
| Pong local Chrome | trois scénarios, clavier/touch, START/STOP, victoire/replay et quatre viewports réussis |
| E2E deux joueurs | runtime/gateway réels, SDK npm public 0.3.0, tickets/exchange réels dans PostgreSQL jetable, même room, inputs, score 5, replay et forfait réussis |
| Retry admission | réponse HTTP perdue après réservation puis retry avec le même requestId ; aucune seconde admission |
| Local dans le vrai runtime | lancement anonyme, aucun serveur gameplay contacté |
| Copie Pong hors dépôts | npm ci/typecheck/pack publics réussis, ZIP identique octet pour octet |
| Runtime serveur production | import serveur/SDK réussi après npm prune --omit=dev dans cette copie externe |
| Docker | Docker absent ; image non construite et non déployée, recette Linux/container encore nécessaire avant activation |
| Boundaries / secrets / diff | contrôles réussis, aucune dépendance Git/file/workspace ; aucun credential réel trouvé ; aucun changement moteur/client/local gameplay |

Un test d'horloge de renouvellement attend désormais la fin du hash WebCrypto
avant d'avancer à l'intervalle suivant ; le runtime lui-même n'est pas modifié.
Le test de catalogue refuse les identifiants dangereux, tout en acceptant un
nouveau jeu sans registre de sources. La dépendance React reste propre au jeu.

Pong prépare le package 0.3.0, SDK 0.3.0, Bridge 2 et integrationVersion 1.
L'artefact fixture est `0.3.0-test.1`, avec l'UUID de test réservé, jamais un
artefact production : neuf fichiers, 430331 octets décompressés, ZIP 140107 octets.
SHA-256 ZIP : `55d834be8bb63d3b1cae65d6975b912269aa8963c8eb6b617f64a80c0455e0a6`.
JS : 393120 octets ; CSS : 17982 octets ; notices : 17853 octets. Aucune source map.

L'ancienne erreur Cloudflare Git privée est supprimée à sa cause : tous les
resolved du lockfile sont npm publics, sans package Pong ni override. Le build
OpenNext sous Windows signale toujours ses réserves Windows/middleware Node,
sans échec de compilation. npm ci signale 17 alertes d'audit du portail
(1 faible, 4 modérées, 12 élevées), non corrigées par cette migration ; aucun
npm audit fix automatique n'est exécuté. L'installation Pong ne signale aucune
vulnérabilité dans cette recette.

Le SDK de référence reste inchangé. Les tags historiques v0.1.0 sont vérifiés
aux commits déjà publiés ; aucun nouveau tag, commit, push, upload, publication,
déploiement, domaine, credential réel ou migration production n'est créé/appliqué.

Inventaire exact des changements du portail :
[pong-migration-files.md](pong-migration-files.md). Le dépôt Pong possède son
propre inventaire `docs/pong-migration-files.md` et ses rapports ignorés dans
`dist/reports`. Les répertoires temporaires de recette ne sont pas distribués.
