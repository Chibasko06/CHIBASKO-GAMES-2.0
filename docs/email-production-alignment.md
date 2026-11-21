# Réaligner les envois du portail et de la maintenance

Contrôle du 21 novembre 2026. Les lectures Cloudflare et Supabase décrites ici n’ont modifié aucun déploiement, réglage ou message. Aucun e-mail de test n’a été envoyé.

## Réalignement effectué le 21 novembre 2026

Le Worker `chibasko-session-maintenance` a été déployé à 15 h 24, heure de Paris, après les contrôles décrits ci-dessous. La version `a145ffc7-2a86-4936-b705-1e1a6b531576` remplace `e9c0849a-aa42-44c8-8253-fc87017509ba`, à 100 % du trafic. Le déploiement est `fdf535bb-ad26-42c6-8ada-f0d339346d90`.

Les adresses effectives sont désormais `GAME_SUBMISSION_NOTIFY_EMAIL=developers@chibaskogames.fr`, `MODERATION_APPEAL_EMAIL=contact@chibaskogames.fr`, `CONTACT_NOTIFY_EMAIL=contact@chibaskogames.fr` et `RESEND_FROM_EMAIL=noreply@chibaskogames.fr`. Les deux secrets requis sont présents. Les six flags, le cron, les trois bindings R2, le projet Supabase, les restrictions d’exposition et la date de compatibilité sont inchangés.

Le cycle naturel de 15 h 30 a été observé : résultat workerd `ok`, aucune exception, et dix tâches terminées (`sessions`, `previews`, `launches`, `social`, `moderation`, `uploads`, `contact`, `notifications`, `accounts`, `health`). Le compteur de notifications envoyées est zéro. Aucun appel artificiel, fausse soumission ou envoi de test n’a été effectué. Cette observation porte sur un cycle, pas sur une garantie d’absence d’incident futur.

Les six notifications historiques gardent leurs payloads, dates d’acquittement et nombres de tentatives. Les files de soumission et de modération ont été contrôlées avant et après le déploiement. Aucun payload ni historique n’a été réécrit. Le portail reste sur `ae354875-8ffc-4b24-9b59-0e67f63277de` ; le Gateway et le dispatcher n’ont pas été déployés. Aucun réglage DNS, Supabase, Resend ou LWS n’a été modifié.

Le build de maintenance, son dry-run et les 14 tests ciblés de préflight/workerd ont été relancés avec succès avant la livraison. Le paquet de retour arrière compatible reste disponible localement ; il n’a pas été utilisé.

La lecture des paramètres Workers Builds est refusée par l’API Cloudflare (HTTP 403). Le pipeline du portail est confirmé comme déclenché par un push sur `main` : le push est donc différé. Les scripts SQL manuels `inspect-test-game.sql` et `delete-test-game.sql` sont conservés et versionnés avec les autres changements, sans exécution.

## État relevé avant le déploiement

| Élément | Portail | Maintenance |
| --- | --- | --- |
| Worker | `chibasko-games-preview` | `chibasko-session-maintenance` |
| Version active, trafic 100 % | `ae354875-8ffc-4b24-9b59-0e67f63277de` | `e9c0849a-aa42-44c8-8253-fc87017509ba` |
| Déploiement, heure de Paris | 16 novembre, 20 h 32 | 1er novembre, 20 h 06 |
| From configuré | noreply@chibaskogames.fr | noreply@chibaskogames.fr |
| Destination des soumissions | developers@chibaskogames.fr | Ancienne adresse personnelle |
| Adresse des contestations | contact@chibaskogames.fr | Ancienne adresse personnelle |
| `CONTACT_NOTIFY_EMAIL` | contact@chibaskogames.fr | Variable absente |
| Site | https://chibaskogames.fr | https://chibaskogames.fr |
| Secrets Supabase serveur et Resend | Présents | Présents |
| Bindings R2 | Les trois buckets attendus | Les mêmes trois buckets |
| Cron | Aucun | `*/5 * * * *` |
| Date de compatibilité | `2026-10-07`, `nodejs_compat` | `2026-10-18`, aucun flag supplémentaire |

Les trois bindings sont `CHIBASKO_ASSETS` → `chibasko-assets`, `GAME_BUILDS_STAGING` → `chibasko-game-staging` et `GAME_BUILDS_ARTIFACTS` → `chibasko-game-artifacts`. Les URL Supabase configurées correspondent au même projet. Aucun binding service-vers-service n’est déclaré dans les deux versions actives. La maintenance utilise Supabase et Resend par HTTPS et R2 par bindings, sans appeler le Worker du portail.

Les domaines personnalisés du portail sont `chibaskogames.fr` et `www.chibaskogames.fr` ; son accès workers.dev et ses previews sont actifs. La maintenance n’a ni domaine personnalisé ni route, et workers.dev ainsi que les previews y sont désactivés. Les fichiers versionnés conservent ces réglages.

Les six flags de maintenance sont déjà à `1` : sessions, uploads, soumissions, nettoyage contact, suppression des comptes et modération. Ils correspondent au fichier versionné. Aucun ne doit être ajouté ou activé à l’occasion de cette livraison. Le dispatcher de validation automatique reste à `0` dans sa configuration ; il n’est pas déployé par cette opération.

La comparaison des variables versionnées avec les versions actives donne :

- Portail : aucune différence. `MODERATION_CLOSED_RETENTION_DAYS` et `MODERATION_TURNSTILE_SITE_KEY` existent uniquement à distance ; `keep_vars=true` les conserve. Ne pas les supprimer.
- Maintenance : ajouter `CONTACT_NOTIFY_EMAIL=contact@chibaskogames.fr`, corriger `GAME_SUBMISSION_NOTIFY_EMAIL=developers@chibaskogames.fr` et `MODERATION_APPEAL_EMAIL=contact@chibaskogames.fr`. Ce sont déjà les valeurs du fichier versionné.
- Les deux secrets nécessaires à la maintenance sont présents sous les noms `SUPABASE_SERVICE_ROLE_KEY` et `RESEND_API_KEY`. Leurs valeurs n’ont pas été affichées ou comparées. Leur présence ne prouve pas les permissions effectives d’une clé fournisseur ; aucun envoi n’a été fait pour les tester.

Le module JavaScript actif de maintenance a été lu : 31 121 octets, SHA-256 `a9a67bf2da8b9c7a7911af649084086b50c1f1eb97a735e03266abf5939ef99a`. Il envoie du texte seul, conserve les clés `submission-review/` et ne contient pas le modèle HTML actuel. Il utilise aussi `GAME_SUBMISSION_NOTIFY_EMAIL` pour les alertes administratives de modération. Le code actuel sépare correctement ces alertes vers `CONTACT_NOTIFY_EMAIL`. Le déploiement doit donc porter sur le code et les variables, pas seulement sur l’adresse des soumissions.

Cloudflare ne fournit pas ici de commit Git associé à la version active. La date d’un déploiement ne constitue pas une preuve de son commit source. Le contrôle des messages ci-dessous porte sur les payloads réellement enregistrés.

## Messages enregistrés et scores antispam

La lecture limitée de `game_submission_notifications` a couvert les six lignes présentes : six acquittées (`sent_at` renseigné), aucune en attente, aucun lease actif. Les deux files de modération `moderation_mail` et `moderation_measure_mail` ne contiennent ni message `pending` ni message `attention_required` au moment du contrôle.

| Période de création | Notifications | Destination enregistrée | Modèle enregistré |
| --- | --- | --- | --- |
| 21 octobre, 10 et 12 novembre | 4 | Ancienne adresse personnelle | Texte seul |
| 20 novembre | 2 | developers@chibaskogames.fr | HTML et texte actuels, logo e-mail actuel, palette `light only` |

Les deux payloads du 20 novembre ont été reconstruits en mémoire avec leurs données persistées et les constructeurs locaux. Les valeurs de `from`, `to`, `reply_to`, `subject`, `text` et `html` sont exactement identiques ; aucun champ supplémentaire n’est enregistré. Aucun contenu privé du développeur n’est inclus dans ce rapport.

Le Worker obsolète est donc un défaut réel à corriger, mais il ne démontre pas la cause des scores élevés du 20 novembre. Une reprise aurait conservé le payload déjà préparé par le portail, même depuis l’ancien Worker. Le schéma ne conserve ni l’identité du Worker préparateur, ni un `prepared_at`, ni l’identifiant Resend de la réponse dans cette file. `sent_at` est un acquittement applicatif, pas une preuve de distribution dans la boîte de réception.

Les résultats communiqués sont : 10/10 Mail-Tester pour les deux modèles, 5,81 LWS pour l’administratif et 4,92 pour le modèle de soumission simulé. Les scores LWS historiques 6,50, 8,79 et 9,62 n’ont pas de détail de règles disponible. Sans correspondance précise avec les messages reçus et leurs en-têtes, on ne peut pas attribuer chaque score à une ligne SQL, ni établir une cause liée à l’IP, au Reply-To ou au contenu réel. Les deux échelles de scores ne se comparent pas directement.

Ne modifier ni DNS, ni HTML, ni filtres antispam sur cette seule base. Pour une comparaison ultérieure, rapprocher l’heure, l’objet et l’identifiant fournisseur dans Resend des en-têtes reçus : Authentication-Results, IP, Return-Path et règles LWS. Les données personnelles restent à examiner dans les outils autorisés, sans les copier dans le dépôt.

## Circuit et reprise

Une soumission ZIP classique ou SDK crée une entrée par le trigger de soumission. Une révision URL utilise le trigger externe introduit par `20261112000600_external_submission_notifications.sql`. Tous alimentent la même file et le même service `deliverSubmissionNotifications`.

Le portail programme ce service après la réponse HTTP. La maintenance reprend les entrées réservables au cron. Pour un message neuf, tous deux utilisent `submissionEmailMessage`, puis `distribution_prepare_submission_email`. Cette RPC conserve `message=coalesce(message,p_message)` et retourne le payload à transmettre. Une reprise n’utilise donc pas les nouvelles variables pour réécrire un ancien corps.

La clé reste `submission-review/<submission_id>`. Les leases, le verrouillage `skip locked`, les huit tentatives maximum, la fenêtre de 23 heures et le backoff SQL restent inchangés. Un résultat fournisseur accepté mais non acquitté peut être repris avec le même corps et la même clé dans la fenêtre prévue. Cela ne garantit pas une distribution exactement une fois dans tous les scénarios d’un fournisseur externe.

Il n’y a actuellement aucune entrée problématique à réparer. Ne réémettre aucun des six messages acquittés. Pour une inspection ultérieure, utiliser [la lecture anonymisée de la file](../scripts/sql/email-outbox-audit.sql). Une entrée ancienne en attente ne doit pas être réinitialisée sans vérifier les logs Resend, son lease, son âge et l’éventuelle acceptation déjà survenue. Un changement de destinataire ou de payload ne constitue pas une reprise idempotente. Aucun script de réécriture ou de remise en file n’est fourni.

## Autres circuits

L’[inventaire des e-mails](email-inventory.md) décrit les déclencheurs, les destinataires et leurs protections. Les cinq transports trouvés dans le code applicatif sont le contact, les soumissions, la modération, la messagerie administrative et le code de réinitialisation.

| Circuit | From / destination / réponse | Transport et protections conservées |
| --- | --- | --- |
| Contact | noreply@ → contact@ ; Reply-To auteur | Resend HTTP, réservation SQL, fingerprint, quotas, lease et clé `contact/`. Le format historique réservé est conservé. Le nettoyage de maintenance ne renvoie pas le formulaire. |
| Soumissions ZIP classique, SDK et URL | noreply@ → developers@ ; Reply-To développeur | Même service, file et constructeur ; reprises détaillées ci-dessus. |
| Modération, accusés, décisions et recours | noreply@ → contact@ pour les alertes internes, ou destinataire enregistré pour les communications individuelles ; réponse contact@ lorsqu’attendue | Resend HTTP, deux flux SQL, payload figé, leases, backoff et clés `moderation/` ou `moderation-measure/`. La maintenance actuelle sait traiter les deux flux. |
| Messagerie administrative | Contact ou Developers → destinataire choisi ; réponse à l’identité choisie | Resend HTTP, autorisation admin, confirmation, réservation unique, cinq tentatives/minute et cinquante/24 h. Une suppression d’historique conserve la réservation technique. |
| Code de réinitialisation du portail | noreply@ → titulaire ; sans Reply-To | SDK Resend, clé `password-reset/<request_id>`, quota SQL, code expirant après dix minutes, invalidation en cas d’échec. Pas de reprise par la maintenance. |
| Confirmation d’inscription et notifications Auth configurées | Dépend du tableau de bord Supabase | Circuit fournisseur distinct. Contenu des modèles, SMTP, hooks et notifications optionnelles non inspectés à distance dans cette intervention. Ne rien modifier à l’aveugle. |

Aucun circuit d’e-mail dédié n’a été trouvé pour la suppression de compte, les résultats de build, les décisions de publication ordinaires ou les notifications sociales. Leurs états restent disponibles dans le portail. Une mesure de modération, y compris une dépublication, peut en revanche alimenter le flux de modération. Aucun client SMTP/IMAP LWS ni appel SQL réseau d’envoi n’est présent dans les sources inspectées.

## Diagnostic local et qualification

`scripts/email-diagnostic.mjs` réutilise les constructeurs purs extraits dans `lib/emailMessages.ts`. L’extraction ne change ni le texte, ni le HTML, ni les paramètres métier. Elle n’ajoute aucune route publique. Le module des constructeurs ne dépend ni de Supabase, ni du scheduler, ni d’un transport réseau.

Le CLI impose un destinataire unique explicite et une confirmation interactive avant un envoi unique. Les tests n’effectuent aucun envoi réel. `.distribution/`, les aperçus, `.env*` et `.dev.vars*` sont exclus de Git. Le script et ses rapports ne sont pas importés par le portail ou la maintenance ; leur exclusion du graphe applicatif est également vérifiée par les builds.

Les tests ajoutés exécutent le Worker dans workerd/Miniflare avec les RPC et Resend interceptés : mêmes messages que le portail pour les trois types, puis ancien message conservé après perte d’acquittement avec la même clé. Le test SQL vérifie explicitement qu’une seconde préparation ne remplace pas le premier payload. Le test de préflight a été actualisé aux 52 migrations déjà présentes ; aucune migration n’a été ajoutée.

| Vérification exécutée | Résultat |
| --- | --- |
| `npm run test:email-diagnostic` | 7 réussis |
| Notifications, contacts développeur et Worker (`test:maintenance`, complété par les nouveaux tests workerd) | 20 réussis |
| `npm run test:contact` | 8 réussis |
| `npm run test:admin` | 28 réussis |
| Modération, mesures et fiabilité Auth | 51 réussis |
| `tests/security.test.mjs`, dont réinitialisation et erreurs Resend | 10 réussis |
| `tests/production-preflight.test.mjs` | 9 réussis |
| `npm run test:go-live-db` | Réussi sur PostgreSQL jetable : 52 migrations, permissions, files, leases, concurrence, backoff, quotas et historique |
| `npx tsc --noEmit` | Réussi |
| ESLint sur constructeurs, services modifiés, diagnostic et tests JS concernés | Réussi |
| `git diff --check` | Réussi |
| `npm run build:maintenance` et `npm run check:maintenance` | Réussis ; second contrôle en dry-run seulement |
| `npm run build:cloudflare` sous Linux | Réussi avec Supabase simulé ; smoke test du vrai runtime OpenNext réussi |
| Paquet de retour arrière | 5 tests workerd et dry-run réussis |

Les 133 tests ciblés comptabilisés ci-dessus n’ont aucun échec ni test ignoré. Les cinq tests du paquet de retour arrière sont comptés séparément. Les simulations interceptent le transport : elles ne mesurent ni la réception LWS, ni la délivrabilité réelle, ni les modèles Supabase Auth distants.

## Fichiers du changement local

| Fichier | Intervention |
| --- | --- |
| `lib/emailMessages.ts` | Extraction préexistante conservée et qualifiée : constructeurs partagés sans dépendance de transport. |
| `lib/game-distribution/submission-notifications.ts` | Raccordement préexistant au constructeur, sans changement de réservation ni de reprise. |
| `lib/server/adminMailRequest.ts` | Même extraction préexistante pour le message administratif. |
| `scripts/email-diagnostic.mjs`, `scripts/email-diagnostic-core.mjs` | Utilitaire préexistant conservé, contrôles de sécurité et fidélité testés. |
| `package.json` | Commandes locales de diagnostic et de test préexistantes, aucun hook d’envoi automatique. |
| `tests/email-diagnostic.test.mjs` | Tests préexistants du diagnostic, exécutés sans envoi réel. |
| `tests/maintenance-worker.test.mjs` | Nouveaux tests du vrai Worker pour les trois modes et la reprise d’un ancien payload. |
| `tests/maintenance-db.sql` | Assertions ajoutées pour le `coalesce` et le message retourné lors d’une reprise. |
| `tests/production-preflight.test.mjs` | Inventaire attendu actualisé de 47 à 52 migrations existantes. |
| `scripts/sql/email-outbox-audit.sql` | Nouvelle lecture anonymisée, sans fonction de réparation ni écriture. |
| `docs/email-inventory.md` | Distinction entre configuration versionnée et état actif réellement inspecté. |
| `docs/email-deliverability-diagnostic.md` | Ajout du résultat vérifié et des limites de causalité. |
| `docs/email-production-alignment.md` | Ce relevé, qualification et procédure de livraison. |

Les configurations Wrangler sont déjà correctes localement et n’ont pas été modifiées. Le modèle HTML, les migrations et les deux scripts SQL préexistants concernant le jeu de test sont inchangés. Les snapshots et résultats dans `.distribution/email-release/` restent locaux et ignorés par Git.

## Phase B, après autorisation

Le portail actif a déjà les bonnes variables et génère les payloads actuels. Le réalignement urgent porte donc sur la maintenance. Aucun déploiement du Gateway, du dispatcher ou changement Supabase n’est nécessaire. L’extraction partagée pourra suivre le pipeline habituel du portail ; ne pas lancer en parallèle un autre déploiement manuel du portail.

Lors d’une prochaine modification d’un modèle partagé ou de son transport, inclure explicitement la maintenance dans la checklist de livraison. Un déploiement du portail ne met pas à jour ce Worker séparé. Les tests de configuration vérifient les valeurs versionnées ; ils ne prouvent pas à eux seuls qu’une version a été déployée.

Depuis la racine du dépôt du portail, dans PowerShell :

```powershell
git status --short
git diff --check
git diff -- lib/game-distribution/submission-notifications.ts lib/server/adminMailRequest.ts package.json tests/maintenance-worker.test.mjs tests/maintenance-db.sql tests/production-preflight.test.mjs docs/email-inventory.md
node node_modules/wrangler/bin/wrangler.js deployments list --config cloudflare/wrangler.maintenance.production.jsonc --json
npm run build:maintenance
npm run check:maintenance
```

Examiner aussi les nouveaux fichiers non suivis, notamment les constructeurs et le diagnostic. Les deux scripts SQL de suppression/inspection du jeu de test préexistaient à ce travail : ils ne font pas partie de cette livraison. Si la version active, les variables, les bindings ou le cron ont changé depuis le relevé, arrêter pour refaire la comparaison avant déploiement. Ne pas copier de `.env.local` vers Cloudflare.

Le dry-run doit montrer exactement les trois bindings R2, les adresses professionnelles, la même URL Supabase, les six flags inchangés et le cron de cinq minutes. `keep_vars=true` conserve les secrets et les variables distantes non déclarées ; les variables déclarées sont remplacées par les valeurs versionnées. Ne pas exécuter de commande `secret put`, `secret delete` ou de synchronisation globale de variables.

Une fois la phase B expressément autorisée :

```powershell
npm run deploy:maintenance
node node_modules/wrangler/bin/wrangler.js deployments list --config cloudflare/wrangler.maintenance.production.jsonc --json
node node_modules/wrangler/bin/wrangler.js secret list --config cloudflare/wrangler.maintenance.production.jsonc
```

Dans Cloudflare, contrôler la nouvelle version à 100 %, les deux noms de secrets toujours présents, les trois variables de destination, les bindings R2 et le cron. Au cycle suivant, vérifier les journaux structurés de maintenance : tâches attendues, absence de `configuration_missing`, de panne RPC et de hausse des erreurs. Refaire la lecture anonymisée de la file ; elle ne doit pas réexpédier les anciennes lignes acquittées. Ne créer aucune fausse soumission et ne déclencher aucun envoi de test sans autorisation distincte. Lors d’une prochaine vraie soumission, vérifier le destinataire et l’acquittement ; une acceptation Resend ne suffit toujours pas à conclure au classement en boîte de réception.

### Retour arrière

Un `rollback` vers la version du 1er novembre rétablirait les anciennes adresses, le texte seul et le routage commun des alertes de modération et de soumission. Ce n’est pas le retour arrière recommandé.

Un paquet local de retour arrière compatible est préparé dans `.distribution/email-release/rollback/`. Il compile le constructeur de soumission de `HEAD` (`a26c7464538d7a512b61aa0f7678c96a0626611f`), antérieur à l’extraction, avec les dépendances courantes et les variables professionnelles corrigées. Il conserve les flags, bindings, dates de compatibilité et cron. Le code distant ancien est conservé séparément comme preuve, sans servir de cible à cette configuration. Les cinq tests workerd de maintenance et le dry-run ont aussi réussi sur ce paquet.

Avant de livrer, conserver ce dossier localement et vérifier `manifest.json`. Après autorisation, en cas de régression imputable au candidat :

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config .distribution/email-release/rollback/wrangler.jsonc --dry-run
node node_modules/wrangler/bin/wrangler.js deploy --config .distribution/email-release/rollback/wrangler.jsonc
```

Ce retour arrière ne modifie pas SQL et ne réinitialise aucun message. Il ne corrigerait pas une panne Supabase ou Resend. En cas d’envoi incertain, examiner le fournisseur avant toute action sur la file. Le dossier est ignoré par Git et n’est pas un mécanisme automatique : s’il est perdu, il faut reconstruire et requalifier le paquet avant de s’en servir.
