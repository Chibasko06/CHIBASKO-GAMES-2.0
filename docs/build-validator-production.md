# Build Validator production

Service Node.js 24 autonome, sans route HTTP entrante. Un conteneur traite un seul
upload à la fois. Le dispatcher et le Gateway ne sont ni intégrés ni modifiés.
Le consumer HTTP Pull existant de `chibasko-game-builds` reste la source des messages ;
les RPC Supabase et leurs leases sont la source de vérité du traitement.

## Configuration

Le modèle sans valeurs sensibles est
`services/build-validator/production.env.example`. Créer le fichier réel hors du
dépôt, avec droits restreints, par le mécanisme de secrets de l'hébergeur.

| Nom | Valeur / portée |
| --- | --- |
| `SUPABASE_URL` | Origine HTTPS du projet production |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret backend, droit d'exécuter les RPC distribution |
| `GAME_BUILDS_R2_ACCOUNT_ID` | ID du compte Cloudflare contenant R2 et la Queue, 32 hex |
| `GAME_BUILDS_R2_ACCESS_KEY_ID` | Identifiant de credential R2 injecté au runtime |
| `GAME_BUILDS_R2_SECRET_ACCESS_KEY` | Secret R2 injecté au runtime |
| `GAME_BUILDS_STAGING_BUCKET` | `chibasko-game-staging` |
| `GAME_BUILDS_ARTIFACTS_BUCKET` | `chibasko-game-artifacts`, obligatoirement distinct du staging |
| `GAME_BUILDS_QUEUE_ID` | ID de `chibasko-game-builds`, pas son nom ni celui de la DLQ |
| `GAME_BUILDS_QUEUE_TOKEN` | Secret API Cloudflare autorisant pull/ack sur le compte concerné |
| `GAME_BUILDS_SCRATCH_DIR` | `/scratch` dans le conteneur ; chemin local dédié hors conteneur |

La credential R2 doit permettre la lecture staging et son cleanup (delete/abort
multipart), ainsi que read/head/write conditionnel/list/delete sur le bucket final
pour retry et collecte des orphelins. Limiter sa portée aux deux buckets. Aucun bucket
public, URL signée fournie par le navigateur ou endpoint libre dans un message Queue.
L'account ID R2 est aussi celui de l'API Queue dans l'adapter actuel.
Les secrets du dispatcher ou du Gateway ne sont pas automatiquement hérités.

## Exécution et décisions Queue

1. Pull par lot de un, visibilité de deux heures, requêtes bornées à trente secondes.
2. Validation stricte du message puis `distribution_claim` transactionnel.
3. Lecture de `staging/uploads/<uploadId>/source.zip` seulement, avec ETag figé.
4. Téléchargement streaming, quotas, extraction statique dans un processus enfant.
5. Checkpoint, écritures conditionnelles des fichiers validés, archive originale
   privée et inventory ; finalisation DB seulement après toutes les écritures.
6. Nettoyage temporaire avant retour du job, puis ack.

Un ZIP invalide est un traitement correctement terminé lorsque `distribution_fail`
a persisté son rejet : le message est acké. Un incident retryable déjà enregistré
par cette RPC remet l'upload queued et réarme l'outbox ; le message peut également
être acké, la reprise métier étant durable en DB. Un doublon sans claim est acké.
Les exceptions non persistées, erreurs de nettoyage et interruptions demandent un
retry Queue de soixante secondes. Si l'ack/retry HTTP échoue, la visibilité expire
et la Queue redélivre. Un message malformé est retryé vers la DLQ, jamais traité.
La limite de redelivery/DLQ doit être configurée sur le consumer HTTP Pull existant.
Les trois tentatives métier DB sont distinctes de ces redeliveries Queue.

Les réponses HTTP et erreurs externes ne sont jamais loggées : seulement des codes
fixes `build_validator_*`. Les logs ne contiennent pas de corps de message, lease,
clé R2, URL signée, credential ou exception brute. Le parseur reçoit un environnement
minimal, sans credentials, et ne lance pas le JS du jeu.

## Arrêt, scratch et health

SIGTERM/SIGINT arrêtent les nouveaux pulls et annulent le job courant. Le parseur
est arrêté puis attendu jusqu'à fermeture avant suppression de ses fichiers. Le
job enregistre un échec retryable avec sa lease, puis le message est remis en retry.
Une course avec une finalisation déjà commitée peut produire un doublon sans effet.
Une limite dure de quatre-vingts secondes protège l'arrêt ; configurer Docker avec
un délai d'au moins quatre-vingt-dix secondes. Si SIGKILL/crash empêche le nettoyage,
la lease DB expire et les répertoires de spool sont récupérés au démarrage suivant.

Le scratch appartient exclusivement à **une instance**. Ne jamais partager ce montage
entre deux conteneurs/replicas. Le démarrage retire seulement les répertoires
`chibasko-build-*` de cette racine, refuse les symlinks et conserve les autres fichiers.
Les chemins ZIP ne deviennent jamais des chemins locaux : les spools sont numérotés.
Le quota logique borne archive/extraction et un contrôle d'espace libre exige avant
download `taille archive + maxTotalBytes + 1 GiB`. Un filesystem/quota disque dédié
reste obligatoire : `statfs` ne remplace pas une limite OS ni une réservation de disque.

Le healthcheck lit un heartbeat local atomique, sans ouvrir de port. Il vérifie que
la boucle de supervision vit et que le service n'est pas en arrêt, pas que Supabase,
R2 et Queue sont accessibles. Surveiller séparément les erreurs répétées et le backlog.
Docker ne redémarre pas automatiquement un conteneur simplement unhealthy : prévoir
une alerte/supervision et une policy de restart pour les sorties du process.

## Dimensionnement d'une instance

| Ressource | Minimum de départ | Recommandation |
| --- | --- | --- |
| CPU | 2 vCPU 64 bits | 4 vCPU pour parsing, hashing et I/O |
| RAM hôte | 4 GiB disponibles pour ce service | 8 GiB, notamment sur machine avec Docker et autres agents |
| Limite conteneur | 4 GiB RAM, heap parent 768 MiB + enfant 384 MiB | Mesurer RSS/external buffers sur builds représentatifs |
| Scratch SSD | 24 GiB réellement disponibles et dédiés | 32 GiB avec quota et alerte à 80% |
| Disque système/image/logs | Espace supplémentaire distinct | Au moins 20 GiB en plus du scratch ; logs rotatifs |
| Architecture | Linux amd64 ou arm64 | Exécution native sur la cible, pas d'émulation en production |

Justification disque : policy actuelle 500 MiB d'archive + 16 GiB extraits, avec marge
pour metadata/inventory/filesystem. Ne pas monter ce scratch de 24–32 GiB en tmpfs
sur une machine de 4–8 GiB RAM. Le test local ne simule pas 16 GiB ni 50 000 fichiers :
ces ressources sont une estimation de capacité, pas une garantie de débit ou de RSS.
Confirmer le budget d'une heure/job et les quinze minutes de parsing sur les builds
réels avant d'ouvrir l'upload général. Chaque replica exige son propre scratch/budget.

## Build et lancement

Depuis la racine du dépôt, Node 24 :

```sh
npm ci
npm run build:validator
npm run test:validator
node scripts/production-preflight.mjs --component=validator
```

Le preflight lit l'environnement du shell ; il ne charge pas le fichier de secrets.
Hors conteneur, après injection externe de l'environnement :

```sh
node --max-old-space-size=768 .distribution/validator/main.mjs
```

Image locale, sans push :

```sh
docker build -f services/build-validator/Dockerfile -t chibasko-build-validator:production .
```

Le build multi-stage utilise la plateforme du builder pour esbuild et ne copie que
trois bundles JS dans l'image Node 24 cible. Aucun node_modules, source, fichier env
ou credential dans l'image finale. L'allowlist Dockerfile.dockerignore exclut les
autres sources et configurations du contexte. Aucun EXPOSE ni mapping de port.
Avant release, conserver le digest de l'image testée et celui de la base Node ;
le tag `node:24-bookworm-slim` est mutable pour recevoir les correctifs.

Export OCI amd64/arm64 sans registre, avec builder Buildx adapté :

```sh
docker buildx build --platform linux/amd64,linux/arm64 -f services/build-validator/Dockerfile -t chibasko-build-validator:production --output type=oci,dest=build-validator.oci.tar .
```

Les étapes runtime RUN exigent des workers natifs ou l'émulation du builder pour
chaque cible. La compatibilité multiarchitecture doit être testée sur les cibles.
Voir [builds multi-plateformes Docker](https://docs.docker.com/build/building/multi-platform/).

Lancement Linux, **uniquement après préparation manuelle du volume et des secrets** :

```sh
docker run -d --name chibasko-build-validator --init \
  --restart unless-stopped --read-only --cap-drop ALL \
  --security-opt no-new-privileges=true --pids-limit 128 \
  --memory 4g --memory-swap 4g --cpus 2 --stop-timeout 90 \
  --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --mount type=bind,src=/srv/chibasko-validator/scratch,dst=/scratch \
  --env-file /etc/chibasko/build-validator.env \
  chibasko-build-validator:production
docker inspect --format '{{.State.Health.Status}}' chibasko-build-validator
docker stop --time 90 chibasko-build-validator
```

Préparer `/srv/chibasko-validator/scratch` sur un disque/quota dédié, propriétaire
UID/GID 1000:1000, mode 0700. Restreindre `/etc/chibasko/build-validator.env` et ne pas
le copier dans Git. La commande n'effectue aucun provisioning de volume/quota/secrets.
Le conteneur reste non-root, sans Docker socket, sans accès entrant et avec sorties
HTTPS limitées à Supabase/R2/Cloudflare API par l'infrastructure.
Le modèle de permissions Node est une protection supplémentaire, pas une sandbox
contre une compromission du parseur : conserver l'isolation OS et la veille sécurité.

## Recette restante avant production

- Vérifier compte/Queue ID, token pull/ack, DLQ et rétention ; aucun nouveau consumer.
- Vérifier les deux buckets privés, leurs droits, les RPC et le projet Supabase.
- Construire/exécuter réellement l'image Linux sur l'architecture choisie ; tester
  health, permissions, téléchargement/écriture R2 et stop/restart pendant parsing.
- Faire une recette staging avec archive valide, rejetée, doublon, incident DB/R2,
  perte d'ack, manque de disque, SIGTERM puis crash et récupération du scratch.
- Mesurer CPU/RAM/disque/durée sur un gros build ; configurer alertes health, erreurs,
  backlog, DLQ, scratch et redémarrages. Ne pas activer un flux non supervisé.

Validation locale : 30 tests réussis (loop, ack/retry, réponse invalide, ZIP,
quotas/traversal/symlinks, doublons, abort/cleanup). Les deux handlers SIGTERM/SIGINT
ont été exercés dans un vrai sous-processus Node par émission des événements, avec
fetch fixtures. Cela ne certifie pas la transmission des signaux Unix via Docker.
Docker absent sur le poste : aucune image Linux/amd64/arm64 construite ou exécutée.
Aucun service déployé, aucune migration ni ressource distante modifiée.
