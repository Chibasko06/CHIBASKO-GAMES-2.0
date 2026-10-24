# Chibasko Games

Site de jeux navigateur : Next.js 16, React, TypeScript, Supabase et Resend.

## Distribution des jeux

Le portail installe le SDK public npm exact `@chibaskogames/sdk@0.3.0`.
Il n'installe aucun package de jeu et n'importe aucun moteur, player ou serveur
gameplay. Les jeux intégrés utilisent des builds Web immuables dans R2, servis
par Artifact Gateway puis chargés dans le GameRuntime générique isolé.

Le control plane multijoueur PostgreSQL gère les salons public/privé, le roster,
la readiness et les rounds. Les serveurs gameplay sont des deployments séparés.
Chibasko Pong produit son build et son serveur dans son propre dépôt ; son
serveur gameplay n'appartient pas à ce portail.

L'installation ne demande aucun accès GitHub privé. Aucune authentification Git
n'est nécessaire pour construire le portail. L'activation production reste une
étape d'infrastructure distincte : migrations ordonnées, domaine de contenu isolé,
gateway/queue/R2, version publiée et deployment compatible doivent être prêts
avant la mise en ligne de ce parcours. Aucun fallback vers l'ancien player.

Voir [PONG-MIGRATION-1](docs/pong-migration.md),
[GameRuntime](docs/game-runtime.md), [Distribution](docs/game-distribution.md)
et [Control plane multijoueur](docs/multiplayer-sessions.md).

Le [plan d'activation production](docs/production-activation.md) fixe l'ordre des
migrations et ressources, les contrôles de sécurité et le rollback. Pour le
domaine actuel, consulter [l'isolation sans PRIVATE PSL](docs/artifact-gateway-production.md#isolation-sans-private-psl).
La [checklist](docs/production-activation-checklist.md) accompagne les opérations
d'infrastructure ; les builds et le préflight local ne les exécutent pas.

La [matrice GO-LIVE](docs/production-go-gates.md) consigne les preuves locales,
les gates externes, le contrôle de drift read-only et les opérations restant à
exécuter. `npm run test:go-live` et `npm run test:go-live-db` vérifient l'outillage
et la maintenance partagée sans connexion production.

## Developpement

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
npm start
```

Les tests Node utilisent `registerHooks` : Node 24 est recommande. `npm test` utilise des doubles Supabase/Resend ; il n'envoie aucun email et ne touche aucune base distante.

## Variables d'environnement

Configurer `.env.local` pour le developpement et les secrets correspondants dans l'hebergeur. Ne jamais versionner les valeurs.

| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase, publique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle publique Supabase, soumise aux RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend uniquement ; ne jamais exposer au navigateur |
| Autorisation admin | Table `admin_users` protégée, attribution manuelle : voir `docs/admin-security.md` |
| `RESEND_API_KEY` | Envoi des codes de recuperation |
| `RESEND_FROM_EMAIL` | Expediteur autorise et verifie dans Resend |
| `PASSWORD_RESET_CODE_SECRET` | Secret aleatoire d'au moins 32 caracteres pour les HMAC |

## Migrations de securite et compatibilite

Les migrations correctives du 7 octobre 2026 se trouvent dans `supabase/migrations/` :

1. `20261007000100_retire_time_based_progression.sql`
2. `20261007000200_secure_password_reset.sql`
3. `20261007000300_secure_game_submissions.sql`

Elles ciblent une **base existante**, executees par son proprietaire de migrations. Elles ne reconstruisent pas l'historique : les anciennes migrations et `sql/tables.sql` ont volontairement ete conserves sans modification. Ne pas lancer un reset complet ni rejouer aveuglement tout l'historique (versions dupliquees, ordre de creation/evolution et anciens types de retour a regulariser separement).

Avant production, verifier dans un environnement de test que :

- `profiles`, `password_reset_codes`, `game_submissions` et les colonnes du workflow existent ;
- `normalize_profile_username(text)` existe ;
- le trigger `on_auth_user_created` appelle `handle_new_user()` et ne contient pas de personnalisation hors depot ;
- la politique own-profile UPDATE est presente et correcte ;
- aucune fonction, vue ou integration manuelle ne depend de `sync_profile_xp()` ; la migration n'utilise pas `CASCADE` ;
- aucun acces externe legitime a `game_submissions` ne repose sur les roles publics ;
- les secrets Resend/reset sont presents, notamment la longueur minimale du secret.

Appliquer les trois fichiers dans l'ordre, puis deployer cette version du site. Prevoir une courte indisponibilite du reset pendant cette bascule : l'ancien protocole n'est pas compatible avec le nouveau et les codes deja emis sont invalides. Les fonctions publiques de consultation/jeu restent independantes. Un retour a l'ancien code de reset exige une strategie specifique ; ne pas retablir les anciens droits publics pour contourner un probleme.

Les migrations ont ete reappliquees deux fois sur un PostgreSQL local de test avec un schema minimal reproduisant les tables/roles concernes. Cela ne remplace pas une validation de l'etat reel de Supabase. Aucune migration de production n'est appliquee par les scripts de build ou de tests.

## Recuperation du mot de passe

```text
POST request -> reservation SQL sous verrous -> reponse generique
                                            -> after() -> Resend
POST verify  -> controle SQL et compteur partage
POST confirm -> consommation SQL atomique -> Supabase Auth
```

- Code aleatoire a six chiffres, expiration **10 minutes**, stocke sous HMAC-SHA256 avec secret serveur.
- **3 codes maximum par adresse sur une heure glissante**, au moins **60 secondes** entre deux codes. Les quotas incluent les adresses absentes et les echecs d'envoi.
- **20 demandes par client sur une fenetre d'une heure**, avec compteur en base. L'adresse IP est HMACee et jamais stockee en clair. Sur Vercel (`VERCEL=1` fourni par la plateforme), seul `x-vercel-forwarded-for` est utilise ; hors ingress connu, toutes les demandes partagent une cle conservative. Ne pas remplacer ceci par un header client non fiable. Revalider cette frontiere de confiance lors du changement d'hebergeur.
- **5 controles maximum par code**, partages entre verify et confirm ; chaque controle compte, meme une verification reussie. Plusieurs onglets n'ont pas plusieurs budgets.
- Une nouvelle reservation invalide le code precedent. La verification ne donne aucun droit durable au navigateur ; confirm revalide et consomme sous verrou avant toute modification Auth.
- Si Auth echoue ou si son resultat est incertain, le code reste consomme : il faut en demander un autre. La transaction SQL et l'appel Auth HTTP ne peuvent pas former une transaction unique.
- La recherche de compte est faite dans `auth.users` par une RPC serveur restreinte, sans lister tous les utilisateurs.
- Resend est appele via `after()` apres la reponse, avec cle d'idempotence. Une erreur explicite, une exception ou l'absence d'identifiant d'envoi invalide la reservation concernee. Les logs ne contiennent ni email, ni code, ni hash, ni detail fournisseur.
- La demande retourne le meme resultat public pour compte absent, quota atteint ou erreur interne. Aucun UUID, hash ou detail de compte n'est renvoye. Les logs generiques permettent d'identifier un probleme de configuration.
- Le code expire meme sans nettoyage. Les demandes expirees et compteurs de plus de 24 heures sont purges lors des nouvelles reservations ; en l'absence de trafic, leur purge attend la prochaine demande. `cleanup_password_reset_requests()` peut etre appelee par une maintenance avec `service_role`, sans nouveau service obligatoire.
- Tables et RPC de reset sont inaccessibles aux roles `anon`/`authenticated` ; les protections ne reposent pas sur la memoire d'une fonction serverless.

## Soumissions developpeur

Le parcours `/publier-un-jeu` nécessite un compte et une fiche développeur.
Il enregistre les brouillons privés, téléverse le ZIP dans R2 staging et transmet
la soumission à la revue admin. La validation technique ne publie pas le jeu.
Voir [le workflow de soumission](docs/developer-submissions.md) et
[la revue manuelle](docs/manual-build-review.md).

### Compatibilite avec les anciennes propositions

L’ancien endpoint anonyme `POST /api/game-submissions` répond HTTP 410 et
n’écrit plus en base. Les nouvelles soumissions utilisent le parcours authentifié
`/publier-un-jeu`. Les anciennes propositions restent accessibles aux admins.

### Sauvegarde du catalogue admin

La migration `20261023000100_atomic_admin_catalogue.sql` fournit la RPC
transactionnelle `admin_save_game`, réservée au backend après vérification admin.
Vérifier son application avant de déployer les routes qui l’utilisent. Un échec
annule ensemble les modifications du jeu et de ses catégories. La suppression
éventuelle de l’ancienne miniature intervient seulement après réussite SQL.

## Retraits et conservation des donnees

- Le portail ne propose pas d'import V1 par execution de fichiers `fs`/`vm`.
- L'application ne propose pas de progression XP, de niveaux ou de tri par XP.
- `profiles.xp_points` et `profiles.last_xp_tick_at` restent en base pour conserver les donnees historiques. L'application ne les selectionne plus et ils ne figurent plus dans son contrat TypeScript. La RPC de gain est supprimee ; le trigger de creation de profil est conserve sans initialisation explicite de ces champs. Leurs anciens defaults restent pour compatibilite, sans gain d'XP.
- Les utilisateurs ne peuvent plus modifier ces deux anciennes colonnes. Les mises a jour autorisees du profil (dont l'avatar) restent soumises aux RLS existantes.
- L'historique, les favoris, les avis et les reactions restent lies au compte ; les autorisations propres a chaque table s'appliquent.

## Tests SQL locaux

Utiliser un cluster PostgreSQL **jetable et local**, avec une base vide nommee exactement `chibasko_phase0_test`. Le script refuse un autre nom ou un autre hote. Ne pas utiliser Supabase ni un cluster contenant deja des roles de production.

Exemple PowerShell, apres creation du cluster et de la base :

```powershell
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '55439'
$env:PGUSER = 'phase0'
$env:PGDATABASE = 'chibasko_phase0_test'
# Facultatif si psql n'est pas dans PATH :
$env:PSQL_BIN = 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
npm run test:db
```

Le script prepare le schema minimal, simule d'anciens droits permissifs, applique deux fois les trois migrations et verifie : compte/profil preserve, avatar modifiable, progression bloquee, RLS/droits/RPC, CRUD backend, expiration, cinq essais, quotas, ancien code invalide et nettoyage. Il lance aussi 12 connexions concurrentes pour tester reservation, consommation unique et plafond de tentatives. Repartir d'un cluster jetable neuf pour un nouvel execution complete.

## Hebergement Cloudflare

Voir [le guide de preview](docs/cloudflare-preview.md) pour OpenNext, les commandes
`build:cloudflare`, `preview:cloudflare`, `deploy:cloudflare`, les variables runtime,
Supabase Auth et la distinction entre domaines publics et preview. Le Worker
`chibasko-games-preview` sert le domaine public ; son nom ne détermine pas
l'indexation des réponses.

## Controles d'exploitation

Valider les parcours complets sur l'URL Cloudflare distante et ses limites de runtime.
La stratégie de rafraîchissement du sitemap et les limites de runtime se vérifient
avec la charge réelle. L'historique SQL initial reste à régulariser sans réécriture silencieuse.

### Lecture du catalogue

La migration `20261024000400_catalogue_pagination.sql` fournit une projection
publique paginée. Le catalogue filtre en base avant de trier et paginer : 24 jeux
par page, 24 profils, 24 favoris, 20 avis et 50 lignes par liste admin. Les tris
utilisent l'identifiant comme dernier critère. Les compteurs et la moyenne des
avis portent sur le jeu entier, indépendamment de la page affichée.

La home charge huit jeux populaires, dix jeux par catégorie, les classements et
dix jeux multijoueurs. Les fiches chargent leur slug et des recommandations
bornées, sans charger tout le catalogue. Le sitemap sélectionne uniquement les
identifiants, slugs et catégories nécessaires. Aucun cache partagé de données
personnelles n'est ajouté ; les lectures de page restent actuelles et les données
de fiche sont dédupliquées au sein de la requête React.
L'historique sélectionne les derniers jeux distincts en base, avec un index sur
le compte, le jeu et la date. La RPC conserve les RLS et refuse la lecture d'un
autre compte ; les parties répétées ne multiplient pas les requêtes du navigateur.

La pagination numérotée conserve des liens HTML et des URL partageables. Une
modification du catalogue ou d'un classement entre deux pages peut déplacer des
résultats ; il ne s'agit pas d'un instantané de consultation. Les exports lisent
des lots de cent lignes et échouent si le total change, si une page est tronquée
ou si le plafond de 50 000 lignes est dépassé. Ils ne garantissent pas un instantané
transactionnel d'une base modifiée pendant l'export. Au-delà de ce volume, les
exports doivent devenir des traitements différés et le sitemap doit être partitionné.
