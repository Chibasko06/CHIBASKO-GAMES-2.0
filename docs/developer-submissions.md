# Soumission de builds Web

`/publier-un-jeu` nécessite un compte pour déposer un ZIP. Connexion et inscription
conservent le retour vers cette page. `/developer/submissions` liste les uploads
du compte connecté, avec pagination et actualisation explicite.

## Parcours

1. Choisir l’onglet « Publier un nouveau jeu » ou « Mettre à jour un jeu existant ».
   Le premier ne présente aucune liste de catalogue. Le second liste uniquement
   les memberships du compte, même pour un administrateur ; les droits backend
   étendus de l’administration restent inchangés.
   Les réservations dont aucune première version n’est encore publiée restent
   dans le parcours nouveau jeu et ne peuvent pas contourner les champs requis
   en passant par une soumission de mise à jour.
   Pour un nouveau jeu, réserver son identité avec son titre.
   La réservation crée un jeu non publié et un membership `owner`, puis fournit
   son UUID. Elle est idempotente et limitée à cinq nouveaux jeux par compte et
   par jour. Le type historique de catalogue `multiplayer_chibasko` désigne ici
   le parcours runtime géré ; les capacités local/online viennent du manifeste
   validé, sans hypothèse sur le nombre de joueurs.
2. Construire le ZIP avec ce `gameId` et une version SemVer non utilisée dans
   `chibasko.json`. Le formulaire demande ces deux valeurs pour cibler l’upload ;
   la validation serveur contrôle leur concordance avec le manifeste.
3. Pour un nouveau jeu, renseigner titre, studio, date de sortie, description,
   une à huit catégories, compatibilité mobile oui/non et technologie. Joindre
   une couverture ; le site HTTPS reste facultatif. Le contact provient du compte
   authentifié. La communauté reste calculée par la plateforme.
   Une mise à jour demande uniquement le jeu géré, sa version, son ZIP et la
   confirmation des droits. Elle ne modifie aucune métadonnée du catalogue.
4. Envoyer le ZIP directement vers R2 staging à l’aide des URLs signées des API
   developer existantes. Aucun ZIP complet ne transite par Next.js. La limite
   vient de `UPLOAD_POLICY` : actuellement 500 Mio et parties de 32 Mio.
5. Finaliser l’upload, puis lier les informations éditoriales à cet upload.
   `game_submissions.build_upload_id` est unique et la revue admin est liée
   dans la même transaction. La confirmation n’apparaît qu’après cette liaison.
6. L’administration retrouve le build dans `/admin/game-builds`, lance
   `npm run review:game -- <upload-id>` localement, puis effectue la revue humaine
   et la décision explicite de publication. À cette décision, les métadonnées
   du nouveau jeu approuvées sont appliquées dans la même transaction que la
   publication de version et le pointeur actif. La visibilité catalogue reste
   activée explicitement dans l’administration du jeu. Le dispatcher reste désactivé.

La vérification peut prendre 24 à 48 h. Une validation technique réussie ne
garantit pas la publication. Aucun upload ne crée directement une game_version
ou ne rend un jeu visible. La publication de la version, le pointeur actif et
la visibilité éditoriale restent contrôlés par les procédures admin existantes.

## Reprise et suivi

L’onglet conserve en sessionStorage les identifiants d’upload, les caractéristiques
du fichier et les SHA-256 des parties effectivement envoyées. Après interruption,
sélectionner le même ZIP. Une partie distante n’est réutilisée que si sa taille
et l’empreinte locale mémorisée correspondent. Les URLs signées et tokens ne sont
jamais persistés. La reprise reste limitée à la durée de vie de l’upload et aux
données conservées dans cet onglet ; elle n’est pas une reprise interappareils.

Si le ZIP est reçu mais que la liaison éditoriale a échoué, « Terminer les
informations éditoriales » dans Mes soumissions permet de réessayer sans nouvel
envoi du ZIP. Les propositions anciennes sans build sont conservées dans l’admin.
Elles ne sont pas attribuées automatiquement à un compte par rapprochement email.

## API et autorisations

- `GET /api/developer/games?offset=0` : memberships réels, 50 par page, limite ZIP.
- `POST /api/developer/games` : `{title}`, en-tête `Idempotency-Key` UUID.
- `GET /api/developer/submissions?offset=0` : liste privée des uploads du compte.
- `GET /api/developer/submissions?uploadId=<uuid>` : contexte de récupération
  éditoriale d’un upload reçu, réservé à son auteur autorisé.
- `POST /api/developer/submissions` : multipart borné, avec champ JSON `metadata`
  contenant `{uploadId,kind,metadata,ownership}`. `kind` vaut `new` ou `update`.
  Pour `new`, `metadata` contient `title`, `studio`, `releaseDate` (YYYY-MM-DD),
  `description`, `categories` (UUID), `mobile` (booléen), `technology`, `website`,
  et le champ fichier `cover` est obligatoire. Pour `update`, `metadata` vaut
  `{}` et aucun fichier cover n’est accepté. JSON seul reste accepté pour update.
- Les sessions, parties signées et finalisations utilisent les API uploads existantes.

Chaque API vérifie le bearer auprès de Supabase. L’identité est dérivée de cette
vérification, jamais du corps JSON. Les RPC sont réservées au service serveur ;
la nouvelle table est protégée par RLS sans accès navigateur. Les réponses de
suivi projettent uniquement les champs utiles : aucun staging_key, multipart_id,
lease_token, checkpoint ni credential. Les décisions admin restent indépendantes.

## Migration

Appliquer selon le processus DB la nouvelle migration
`20261020000200_developer_submissions.sql`, après les migrations distribution et
la revue manuelle. Le fichier de revue manuelle présent dans ce checkout porte
le nom `20261019000100_manual_build_reviews.sql.sql` ; son contenu et son nom
n’ont pas été modifiés ici. Vérifier sa présence dans l’historique de migration
avant activation. La nouvelle migration ajoute une relation nullable pour
préserver les soumissions historiques. Aucune migration distante n’est exécutée
par les tests ou par le formulaire.

La séparation des parcours ajoute ensuite
`supabase/migrations/20261020000300_submission_catalogue.sql` (20 octobre 2026).
Le fichier contient le SQL exact à appliquer, après la migration précédente.
Il ajoute les champs éditoriaux manquants, une provenance catalogue distincte,
des RPC réservées au serveur et un trigger d’application lors de la décision
admin. Les anciens champs, propositions et providers importés sont conservés.
Seuls les jeux présents dans le registre des créations développeur reçoivent
la provenance `developer_submission` lors du rattrapage. Cette provenance affiche
« Source : Soumission développeur » ; les anciens jeux GameMonetize gardent leur
provider d’origine.

## Configuration

La limite ZIP est définie dans `UPLOAD_POLICY.maxArchiveBytes` (524288000 octets).
La RPC `distribution_create_upload` vérifie la policy fournie par le serveur et
la stocke dans `game_build_uploads.policy` pour cette session. Il n’existe pas de
limite ZIP indépendante dans une policy JSON ou une RPC. Ce changement ne
nécessite aucun SQL de production ; les uploads déjà créés conservent leur
instantané de policy. La limite décompressée reste de 16 Gio.

Réutiliser les variables serveur existantes, sans nouvelles credentials :

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` : client d’auth.
- `SUPABASE_SERVICE_ROLE_KEY` : serveur uniquement.
- `GAME_DISTRIBUTION_UPLOADS_ENABLED=1` : ouverture des mutations de dépôt.
- `GAME_BUILDS_R2_ACCOUNT_ID`, `GAME_BUILDS_R2_ACCESS_KEY_ID`,
  `GAME_BUILDS_R2_SECRET_ACCESS_KEY` : signature serveur R2.
- `GAME_BUILDS_STAGING_BUCKET=chibasko-game-staging`.

Le flag de dépôt est désactivé si sa valeur est absente ou différente de `1`.
Dans ce cas, la création d’identité retourne `503 service_unavailable` avant
tout appel à `distribution_register_game`, même si la lecture des jeux fonctionne.
Pour un test local, définir `GAME_DISTRIBUTION_UPLOADS_ENABLED=1` dans `.env.local`
(ignoré par Git), puis redémarrer Next.js. Cela ne configure aucun environnement
distant et ne publie aucun jeu.

Les erreurs serveur 5xx produisent un événement `developer_submission_failed` :
operation, phase, code, status et requestId. `reason=uploads_disabled` identifie
le garde-fou de configuration. Une phase `rpc` se corrèle au diagnostic
`distribution_rpc_failed` avec le même requestId, disponible dans l’en-tête
`X-Request-Id`. Aucun corps de requête, titre, acteur, token ou exception brute
n’est enregistré. Les vérifications de disponibilité ne remplacent pas les
autorisations serveur et les permissions DB.

### Initialisation du staging multipart

La création d’une identité de jeu ne configure pas R2. Le portail initialise
le client S3 staging avant toute RPC de création d’upload. Les quatre noms
`GAME_BUILDS_R2_ACCOUNT_ID`, `GAME_BUILDS_R2_ACCESS_KEY_ID`,
`GAME_BUILDS_R2_SECRET_ACCESS_KEY` et `GAME_BUILDS_STAGING_BUCKET` doivent être
configurés côté serveur, y compris dans `.env.local` pour un test local. Utiliser
la gestion habituelle des secrets ; aucun credential ne doit être transmis dans
le formulaire ni enregistré dans Git. Un binding R2 du Gateway ne fournit pas
ces credentials au processus Next.js local.

Si ces variables manquent, la réponse reste `503 service_unavailable`, mais
`developer_upload_failed` contient `phase=service_configuration` et
`r2Configuration.present/missing/invalid` : uniquement des noms de variables.
Si la requête R2 est réellement envoyée, l’événement distingue l’action
`multipart_create`, les erreurs de signature, réseau, timeout et refus HTTP.
Le statut HTTP et un code S3 allowlisté (par exemple `AccessDenied`) sont conservés ;
les URL, clés, identifiants multipart, messages XML bruts et credentials sont exclus.
Le header `X-Request-Id` corrèle le navigateur, ce log et les éventuels logs RPC.

Après configuration, redémarrer Next.js et reprendre avec le même ZIP dans le
même onglet. Le brouillon conserve son Idempotency-Key même si aucune session
d’upload n’a encore pu être créée. Un multipart qui échoue après la création DB
laisse la session `created`, réutilisée au prochain POST avec cette même clé.
Ne pas effacer le brouillon ni recréer le jeu pour résoudre une erreur de configuration.

Le bucket staging reste privé. Son CORS doit autoriser les PUT depuis les origines
du portail autorisées et les en-têtes signés utilisés. Le navigateur calcule
Content-Length ; le client ne tente pas de définir cet en-tête interdit.
La liste des parties et la finalisation passent par les API authentifiées.
Le navigateur n’a besoin d’aucune credential Queue ni du bucket artifacts.
La commande de revue locale conserve sa configuration serveur/artifacts propre,
documentée dans `manual-build-review.md`.

La couverture utilise le binding existant `CHIBASKO_ASSETS` et la validation
de miniatures existante : 8 Mio maximum, format réel contrôlé, 40 mégapixels
maximum et SVG actif refusé. Seule cette petite image passe par Next.js ; le
ZIP reste envoyé directement au staging. L’image est stockée sous une clé
aléatoire dans `game-thumbnails/`, sans gameId, Auth UUID ni donnée privée.
Les images éditoriales de ce bucket sont publiques par URL ; la proposition et
le gameId non publié restent privés via les API et RLS. Une erreur DB après
écriture peut laisser une image orpheline ; aucun nettoyage ne doit supprimer
une couverture référencée dans `game_submissions.cover_image_url`.

## Vérification avant un build Pong

- Appliquer la migration additive après vérification des dépendances DB.
- Accorder le membership développeur sur le gameId officiel existant ; ne pas
  réserver un second jeu pour remplacer cette identité.
- Vérifier le flag d’upload, les permissions multipart R2 et le CORS staging.
- Construire le ZIP avec cet UUID et une version SemVer non déjà publiée/validée.
- Configurer le validator local et son espace temporaire pour la revue technique.
- Tester le PUT réel depuis le navigateur, la reprise et la finalisation : les
  tests locaux simulent R2 et n’effectuent aucun upload production.
- Effectuer la preview puis la revue admin ; l’online nécessite en plus un
  deployment gameplay compatible selon le runbook existant.

## Tests locaux

`npm run test:developer-submissions` vérifie les API, la projection privée, le
multipart simulé, les erreurs et le rendu anonyme/authentifié.
`npm run test:developer-submissions-db` utilise PostgreSQL jetable pour vérifier
les migrations, l’ownership, la finalisation, la liaison éditoriale, les quotas,
la RLS et l’absence de publication automatique, ainsi que les suites uploads et
revue admin existantes.

`npm run test:developer-submissions-browser` exerce les deux onglets dans Chrome,
la réservation d’identité, les champs éditoriaux, le multipart de couverture et
un PUT ZIP vers un serveur de stockage local distinct. Aucun service distant
n’est appelé par ce harness.
