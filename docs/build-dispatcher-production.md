# Dispatcher des builds en production

Le Worker dédié `chibasko-build-dispatcher` utilise l'entrée existante
`cloudflare/build-dispatcher.ts` et `dispatchUploads` dans
`services/build-validator/queue.ts`. Le Gateway et le portail ne sont pas impliqués
dans son exécution. Le validateur Node reste un service HTTP Pull séparé.

## Source de vérité et livraison

Le dispatcher est volontairement désactivé : la configuration production contient
`triggers.crons: []`. La validation des builds est actuellement manuelle. L'application
de cette configuration retire la planification distante sans supprimer le Worker,
son code, son binding `BUILD_VALIDATIONS` ou la Queue. Aucun changement distant
n'a lieu avant le déploiement de cette configuration.

La planification sera réactivée lorsqu'un Build Validator permanent sera déployé
et opérationnel : remettre `"* * * * *"` dans `triggers.crons`, puis redéployer
avec la même commande. Le workflow automatique décrit ci-dessous s'applique alors.

Lors de chaque cycle, `distribution_pending()` récupère les uploads queued éligibles
dans l'outbox, au plus 100. Cette RPC existante récupère aussi les leases expirées
et expire les uploads incomplets ; elle n'est pas une lecture SQL pure.
Le dispatcher traite au plus 20 identifiants par cycle, avec cinq jobs simultanés.
Il publie via le binding natif Cloudflare `BUILD_VALIDATIONS` un message texte JSON :

```json
{"type":"validate_game_build","uploadId":"<UUID de l'upload>"}
```

Le message est construit côté serveur à partir d'un UUID vérifié, sans corps navigateur,
archive ou credential. Après résolution de `send`, et seulement après, le dispatcher
appelle `distribution_dispatched(p_id)`. Cette RPC met à jour dispatched_at ; aucune
entrée outbox n'est supprimée par le dispatcher.

La confirmation du binding est sa Promise résolue, pas un champ HTTP `success` à
réinterpréter. Cloudflare garantit alors l'écriture durable. Les métadonnées éventuelles
de retour ne sont pas journalisées. Une réponse de transport invalide est un rejet
du binding, traité comme échec ; aucun second client REST producteur n'est ajouté.
Référence : [API JavaScript Queues](https://developers.cloudflare.com/queues/configuration/javascript-apis/).

Chaque opération attend au plus dix secondes. Le cycle cesse de prendre des jobs
après cinquante secondes ; les cinq jobs déjà commencés peuvent terminer leurs
deux opérations, soit un budget d'attente maximal d'environ soixante-dix secondes.
Les timers ne peuvent pas annuler un envoi natif en cours : un timeout est ambigu,
donc aucun mark ne suit cet envoi même s'il termine tard. Le prochain cycle reprend
l'outbox. Une RPC mark déjà envoyée peut elle aussi finir après timeout, mais elle
n'a été lancée qu'après confirmation de publication.

Un échec sur un job ne bloque pas les autres. Les jobs différés restent en DB. Les
20 jobs limitent le cycle à 41 opérations externes logiques (une lecture RPC,
20 sends, 20 marks), sans boucle de retry en mémoire. La cadence et le backlog
doivent être surveillés ; une hausse des limites relève d'une mesure de capacité.

Deux crons concurrents, un crash après send ou un mark perdu peuvent produire des
doublons. Ils conservent le même uploadId. `distribution_claim` verrouille la ligne
upload et ne prend que le statut queued ; le validateur ignore un claim absent.
Les leases clôturent les écritures de validation. La livraison est at-least-once,
pas exactly-once. Ce mécanisme repose sur les RPC des migrations distribution.
Un upload queued déjà dispatché redevient éligible après son redispatchSeconds
(3600 secondes dans la policy actuelle). Le cron ne garantit pas un retry instantané.

## Configuration production

Fichier : `cloudflare/wrangler.dispatcher.production.jsonc`.

| Nom | Type / valeur |
| --- | --- |
| `SUPABASE_URL` | Variable Worker, URL du projet production ; préférer l'origine HTTPS |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Cloudflare propre à ce Worker, jamais dans Git |
| `BUILD_VALIDATIONS` | Binding producteur vers la Queue existante `chibasko-game-builds` |

`keep_vars: true` conserve les variables du dashboard. Aucune valeur Supabase n'est
versionnée. Les variables/secrets d'un autre Worker ne sont pas hérités : les vérifier
sur ce dispatcher. Aucun token Queue ni queue ID n'est nécessaire au producteur natif.
`GAME_BUILDS_QUEUE_ID`, `GAME_BUILDS_QUEUE_TOKEN` et l'account ID actuellement fourni
par `GAME_BUILDS_R2_ACCOUNT_ID` restent destinés au validateur HTTP Pull.

Le Worker n'a aucune route publique, workers.dev/preview URLs sont désactivées et
son handler HTTP retourne 404. La liste explicite de crons vide désactive la planification au déploiement. Il n'a
ni binding R2, ni consumer Worker, ni secret de jeu. Les logs ne contiennent que
des compteurs et durées : build_dispatch_cycle, build_dispatch_failed. Les exceptions
brutes, URLs, corps RPC, tokens, credentials et identifiants upload ne sont pas loggés.
Un cycle partiellement échoué est signalé en échec ; la reprise dépend du cron et
de l'outbox, pas d'une hypothèse de retry automatique du Cron Trigger.

## Validation et déploiement

Depuis la racine du dépôt :

```powershell
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
$env:WRANGLER_SEND_METRICS = 'false'
npm run test:game-uploads
node scripts/production-preflight.mjs --component=dispatcher
npx --no-install wrangler deploy --config cloudflare/wrangler.dispatcher.production.jsonc --dry-run --outdir .distribution/dispatcher-production
```

Le preflight existant vérifie les noms/forme Supabase, sans lire Cloudflare ni
certifier le binding distant. Fournir les variables dans le shell par le mécanisme
habituel ; ne pas écrire de secrets dans une commande versionnée.

Commande de déploiement :

```text
npx --no-install wrangler deploy --config cloudflare/wrangler.dispatcher.production.jsonc
```

Avant cette commande :

1. Vérifier le compte Cloudflare et le Worker cible `chibasko-build-dispatcher`.
2. Configurer la variable Supabase et son secret sur ce Worker, avec accès aux RPC
   existantes. Les secrets sont propres à chaque Worker.
3. Vérifier la Queue `chibasko-game-builds`, son consumer HTTP Pull existant et son
   association DLQ vers `chibasko-game-builds-dlq`, les retries et la rétention.
   Le fichier déclare uniquement un producteur et ne remplace pas le consumer Pull.
4. Préparer le validateur avant un flux réel continu. La rétention Queue doit couvrir
   ses indisponibilités ; ne pas laisser accumuler des builds sans surveillance.
5. Après application de la configuration actuelle, vérifier l'absence de Cron Trigger
   sur le Worker et la conservation du binding producteur. Lors de la réactivation,
   vérifier le cron minute, les compteurs, l'âge du backlog, la DLQ et le parcours
   send → dispatched → claim sur une recette contrôlée.

Après réactivation, alerter sur cycle échoué, aucun succès depuis cinq minutes, backlog croissant ou DLQ
non vide. Un résultat sans pending est un succès, pas une absence d'exécution.
Le fichier Wrangler déclare le producteur ; vérifier séparément la Queue, la DLQ
et les secrets nécessaires.

## Validation locale

Les 30 tests uploads/dispatcher passent, dont huit tests dédiés à l'outbox : vide,
ordre send/mark, échec partiel, timeout avec résolution tardive, redelivery concurrente,
réponse invalide, bornes et redaction. Les quatre tests preflight, TypeScript et lint
ciblé passent. Le dry-run Wrangler valide le binding vers `chibasko-game-builds` et
produit un Worker de 6,23 KiB (2,33 KiB gzip). Aucun test n'appelle Supabase production
ni la vraie Queue ; la recette distante reste à effectuer après déploiement autorisé.
