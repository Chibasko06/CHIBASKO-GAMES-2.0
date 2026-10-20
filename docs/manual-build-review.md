# Validation manuelle des builds

Le dispatcher reste sans cron. Aucun service permanent ni traitement lourd dans
une requête Next.js n'est nécessaire pour la revue manuelle. Le poste de revue
exécute le même validator que le futur consumer HTTP Pull.

## Mise en place

Appliquer par le processus de migration habituel la nouvelle migration
`20261020000100_manual_build_reviews.sql`, après les migrations distribution.
Elle ajoute une revue par upload, un historique de décisions et des RPC réservées
au backend. Les migrations déjà appliquées ne sont pas réécrites. Cette préparation
n'applique aucune migration distante.

Les routes admin vérifient le compte et `admin_users` côté serveur, puis les RPC
vérifient à nouveau l'acteur. Aucune permission de lecture directe n'est donnée aux
clients sur les nouvelles tables. Le suivi développeur vérifie l'auteur de l'upload
et ses permissions sur le jeu ; les réponses sont des projections explicites.

## Parcours

1. Le développeur envoie son ZIP via les API multipart existantes et finalise
   l'upload. Il reste `queued` dans `game_build_uploads`. L'outbox est conservée.
   La réponse contient `reviewUrl`, vers `/developer/builds/<upload-id>`.
2. L'admin ouvre **Administration → Publications de jeux**.
   `/admin/game-builds` présente les uploads par pages de 50 ; le filtre de statut
   porte sur la page courante. Le détail présente en premier le titre proposé,
   la version, le développeur et la prochaine action, puis les informations
   destinées au catalogue avec un aperçu de couverture.
3. Si une proposition catalogue existe, l'admin peut associer son identifiant.
   `game_submissions` n'avait aucune relation avec les uploads : le rapprochement
   est explicite, jamais déduit d'un email, d'un titre ou du manifest.
4. Sur le poste serveur de revue, exécuter la commande ci-dessous. Elle vérifie
   l'upload, prend le claim existant, télécharge uniquement son archive staging,
   valide/extrait statiquement, écrit les artifacts immuables et finalise la version.
   Un doublon déjà terminé réussit sans réécriture. Une lease active est refusée ;
   une lease expirée peut être reprise dans la limite des tentatives existantes.
5. Actualiser le détail admin : le résultat technique vient directement de la DB.
   Une réussite crée uniquement une version `draft`, sans publication.
6. Tester le build dans le GameRuntime isolé depuis la page détail. Le mode online
   exige une session online préparée compatible et un deployment ; la revue ne
   contourne pas l'admission. Les flags et la configuration runtime existants restent
   nécessaires. Aucun ZIP n'est exécuté sur le poste local.
7. Vérifier contenu, informations et comportement ; enregistrer la checklist.
   Cette décision humaine place la version `in_review` sans remplacer la sandbox.
8. **Publier** réalise dans une transaction les transitions
   `in_review → approved → published` puis `set_active_game_version`. Les octets,
   hashes et manifest ne changent pas. Un second appel ne réactive pas une ancienne
   version si une publication plus récente est devenue active entre-temps.

La visibilité catalogue reste gérée par l'admin jeux existant (`is_published`).
Publier conserve les artifacts immuables et la configuration multiplayer. Pour
une première soumission développeur, les métadonnées éditoriales approuvées sont
appliquées par le mécanisme catalogue existant ; une mise à jour de build laisse
la fiche inchangée.

## Interface de revue

Le dossier sépare quatre étapes : vérification technique, test, revue et décision.
La première affiche En attente, En cours, Réussie ou Échec. Les instructions de
la commande locale sont repliées sous « Voir les instructions de vérification »
puis « Mode avancé / Instructions techniques ». Le navigateur ne lance pas la
commande locale et n'accède à aucun credential serveur.

Le test est proposé seulement lorsqu'une version validée et prévisualisable
existe. Le bouton ouvre le player isolé existant. Le test multijoueur conserve
sa session préparée ; aucun contournement d'admission n'est ajouté.

Les quatre cases de revue se distinguent de leur enregistrement serveur :
« Revue complète » signifie que les contrôles sont cochés. « Prêt à publier »
nécessite aussi leur enregistrement, la date de revue et le statut de version
attendu. Les autorisations et préconditions DB restent la source de vérité.
Refuser ou archiver ouvre une zone dédiée au motif visible par le développeur.

« Détails techniques » regroupe UUID, états bruts, tentatives, taille, dates,
manifeste, commande, association historique et historique détaillé. Ces données
ne sont plus mêlées aux informations éditoriales principales.

L'ancien panneau de propositions est retiré de `/admin`. Les demandes sans ZIP
restent accessibles sous « Archives — propositions sans build » dans
`/admin/game-builds`, avec leurs notes et opérations historiques. Les propositions
déjà liées à un upload n'y apparaissent pas : leur revue passe par le dossier de
publication. Aucun endpoint ni donnée historique n'est supprimé.

Les tests d'interface s'exécutent avec `npm run test:build-review-ui` et
`npm run test:build-review-browser`. Pour contrôler le rendu avec le CSS compilé,
définir `ADMIN_REVIEW_VISUAL=1` avant le test navigateur, après un build Next.js.
Les fixtures ne déclenchent aucune publication réelle.

## Commande locale

Node.js 24, dépendances installées avec `npm ci`. Le lanceur charge uniquement
`.env.review.local` à la racine du projet, ignoré par Git. Copier le modèle
`services/build-validator/review.env.example` vers ce fichier et renseigner les
valeurs localement par la gestion habituelle des secrets. Les variables déjà
injectées dans le processus prennent priorité. Aucun secret Cloudflare n'est
récupéré automatiquement ; `.env.local` de Next.js n'est pas chargé.

| Variable | Usage |
| --- | --- |
| `SUPABASE_URL` | Origine HTTPS du projet, sans `/rest/v1/` |
| `SUPABASE_SERVICE_ROLE_KEY` | Credential backend locale |
| `GAME_BUILDS_R2_ACCOUNT_ID` | Compte R2 |
| `GAME_BUILDS_R2_ACCESS_KEY_ID` | Credential R2 |
| `GAME_BUILDS_R2_SECRET_ACCESS_KEY` | Secret R2 |
| `GAME_BUILDS_STAGING_BUCKET` | `chibasko-game-staging` |
| `GAME_BUILDS_ARTIFACTS_BUCKET` | `chibasko-game-artifacts` |
| `GAME_BUILDS_SCRATCH_DIR` | Facultatif : disque temporaire dédié ; sinon temp OS |

Aucun token Queue n'est nécessaire. `SUPABASE_URL` est prioritaire ;
`NEXT_PUBLIC_SUPABASE_URL` peut servir de fallback si fourni dans l'environnement
ou le fichier dédié. L'URL doit être l'origine du projet, sans `/rest/v1/`.
La credential locale est une capacité serveur privilégiée ; ne pas la distribuer
aux développeurs ni la saisir dans l'interface admin.

Contrôler la présence et les formats locaux sans RPC, claim, téléchargement ou
modification distante :

```sh
npm run review:game -- --check-config
```

Cette commande ne prouve pas que les credentials distants ont les permissions
requises. Elle ne vérifie pas non plus l'espace disque ; le traitement conserve
son contrôle d'espace et de quotas existant. Le scratch facultatif doit disposer
de la taille archive + quota décompressé + 1 Gio de marge, vérifiée après le claim.

```sh
npm run review:game -- <upload-id>
```

Exemple de syntaxe avec un identifiant fictif, à remplacer par celui du détail admin :

```sh
npm run review:game -- 12121212-1212-4212-8212-121212121212
```

Le script compile un entrypoint local et le parseur, sans créer de deuxième
validator. Il relit l'état DB après traitement : un rejet technique, un conflit,
une erreur persistée ou une validation concurrente retourne un code non nul.
La sortie contient uniquement upload ID, version ID et résultat technique.
Le champ `published:false` indique que la commande n'effectue aucune publication.

Les erreurs locales affichent des codes distincts pour configuration manquante,
configuration invalide, compilation, lancement, scratch, état incompatible et
échec de validation. Les diagnostics de traitement ajoutent la phase et les seuls
codes R2 sûrs, sans exception brute, chemin privé, ticket ou credential. Une erreur
de configuration intervient avant `distribution_review_job` et `distribution_claim`.
Le même upload en attente peut être validé après correction, sans nouveau ZIP,
gameId ou upload. Une validation déjà terminée reste idempotente ; une lease active
ne peut pas être contournée et un rejet technique persistant exige son traitement
normal depuis l'administration.

Les quotas et protections du service restent inchangés. Prévoir jusqu'à 24–32 GiB
de scratch dédié pour les limites maximales actuelles ; voir
[le dimensionnement du validator](build-validator-production.md). Les fichiers sont
nettoyés à la fin, y compris en cas d'erreur. Chaque commande utilise un répertoire
unique. SIGTERM/SIGINT déclenchent l'annulation avec une limite dure de 80 secondes.
Après SIGKILL/crash, nettoyer les seuls répertoires `chibasko-review-*` abandonnés
après vérification qu'aucune commande correspondante ne tourne.

## Refus, archivage et reprise

Le refus exige un motif visible au développeur. Il bloque une validation encore
en attente et empêche la publication d'une version rejetée. Refuser pendant une
validation active est interdit : attendre son résultat. Une version déjà publiée
se retire par **Archiver**, qui efface son pointeur actif dans la même transaction.
Les artifacts validés ne sont pas supprimés. Un nouveau dépôt/version constitue
le chemin de correction ; aucun écrasement de version existante.

Le suivi affiche Reçu, En attente de vérification, Vérification en cours,
Vérification technique réussie, Refusé, Publié ou Archivé. Le délai indicatif de
24 à 48 h ne promet aucune publication automatique. Le navigateur n'obtient aucun
staging key, lien R2, lease, hash de credential ou credential serveur.

La commande ne consomme ni n'acke la Queue. Un ancien message concernant un upload
terminé sera un doublon sans claim lors de sa future consommation. L'outbox reste
la source de vérité pour le futur dispatcher. Le nettoyage distant staging et des
artefacts partiels reste assuré par le mécanisme de cleanup existant ; prévoir son
exécution opérationnelle séparée tant que le validator permanent est désactivé.

## Vérifications locales

```sh
npm run test:build-reviews
npm run test:build-reviews-db
node --test tests/build-review-cli.test.mjs
npm run test:validator
```

Les tests DB créent un PostgreSQL jetable. Les tests de commande utilisent des
réponses Supabase/R2 fictives, avec le vrai parseur et les adapters de production.
Aucune commande de test ne contacte le projet production.

## Fichiers du workflow

Créés :

- `app/admin/game-builds/page.tsx`
- `app/admin/game-builds/[id]/page.tsx`
- `app/api/admin/game-builds/route.ts`
- `app/api/admin/game-builds/[id]/route.ts`
- `app/api/developer/uploads/[uploadId]/review/route.ts`
- `app/developer/builds/[id]/page.tsx`
- `components/admin/BuildReviews.tsx`
- `components/BuildReviewStatus.tsx`
- `lib/game-distribution/review.ts`
- `lib/server/adminBuilds.ts`
- `services/build-validator/review.ts`
- `services/build-validator/review-job.ts`
- `scripts/review-game.mjs`
- `supabase/migrations/20261020000100_manual_build_reviews.sql`
- `tests/build-review.test.mjs`
- `tests/build-review-cli.test.mjs`
- `tests/build-review-db.sql`
- `docs/manual-build-review.md`

Modifiés :

- `app/admin/page.tsx`
- `lib/game-distribution/uploads/contracts.ts`
- `lib/game-distribution/uploads/service.ts`
- `lib/server/developerUploads.ts`
- `services/build-validator/README.md`
- `tests/game-distribution-db.mjs`
- `package.json`
