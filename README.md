# Chibasko Games

Site de jeux navigateur : Next.js 16, React, TypeScript, Supabase Auth/PostgreSQL/Storage et Resend. L'hebergement reste Vercel. Aucune migration Cloudflare, R2, Colyseus ou monorepo n'est incluse dans la Phase 0.

## Developpement

```sh
npm ci
npm run dev
npm run lint
npm test
npm run build
npm start
```

Les tests Node utilisent `registerHooks` : Node 24 est recommande (version utilisee pour la validation). Aucune nouvelle dependance de test n'est installee. `npm test` utilise des doubles Supabase/Resend ; il n'envoie aucun email et ne touche aucune base distante.

## Variables d'environnement

Configurer `.env.local` pour le developpement et les secrets correspondants dans l'hebergeur. Ne jamais versionner les valeurs.

| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase, publique |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle publique Supabase, soumise aux RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend uniquement ; ne jamais exposer au navigateur |
| `ADMIN_EMAILS` | Emails administrateurs, separes par des virgules |
| `RESEND_API_KEY` | Envoi des codes de recuperation |
| `RESEND_FROM_EMAIL` | Expediteur autorise et verifie dans Resend |
| `PASSWORD_RESET_CODE_SECRET` | Secret aleatoire d'au moins 32 caracteres pour les HMAC |

Toutes ces variables restent utiles. Aucune suppression de variable n'est necessaire pour retirer l'import historique ou la progression.

## Phase 0 : application des migrations

Les trois nouvelles migrations correctives se trouvent dans `supabase/migrations/` :

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

## Propositions de jeux

```text
Formulaire public -> /api/game-submissions -> validation -> service_role -> table
Admin -> verification jeton + ADMIN_EMAILS -> service_role -> table
```

La migration active RLS, retire les anciennes policies ainsi que les droits de table/colonnes publics, et reserve le CRUD au backend. Ni un visiteur ni un membre ordinaire ne peuvent lire, inserer, modifier ou supprimer directement une proposition via Supabase.

L'API publique accepte un objet JSON de 32 Kio maximum, valide les types, longueurs, email, URLs HTTPS sans identifiants, categories (8 maximum), options et confirmation de propriete booleenne. Elle construit une liste explicite de champs autorises. `status='pending'` et `admin_notes=null` sont imposes cote serveur ; les identifiants, horodatages et champs de revue envoyes par le client sont ignores. Les erreurs internes de base ne sont pas exposees.

Le formulaire reste accessible sans compte. L'administration continue de consulter, annoter, changer les statuts et supprimer via ses API existantes. Le rate limiting anti-spam du formulaire est un durcissement distinct a envisager si necessaire ; ce changement n'ajoute pas de CAPTCHA/service externe.

## Retraits et conservation des donnees

- Le mecanisme d'import V1 (route et utilitaire `fs`/`vm`) est supprime. Aucun jeu, categorie, lien du catalogue ou fichier de `public/games/` n'est supprime.
- L'XP, les niveaux, le tri par XP, les controles admin, les appels RPC et le heartbeat ont ete retires de l'application.
- `profiles.xp_points` et `profiles.last_xp_tick_at` restent en base pour conserver les donnees historiques. L'application ne les selectionne plus et ils ne figurent plus dans son contrat TypeScript. La RPC de gain est supprimee ; le trigger de creation de profil est conserve sans initialisation explicite de ces champs. Leurs anciens defaults restent pour compatibilite, sans gain d'XP.
- Les utilisateurs ne peuvent plus modifier ces deux anciennes colonnes. Les mises a jour autorisees du profil (dont l'avatar) restent soumises aux RLS existantes.
- Historique, vues, favoris, avis, reactions, profils, Google Auth, catalogue, iframes, SEO et stockage actuel sont conserves.

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

## Points restant avant Cloudflare

La version Next.js et ses correctifs de securite, l'adaptateur Workers, la conversion native des miniatures (`sharp`), l'optimisation `next/image`, la strategie du sitemap, les erreurs Supabase masquees et les requetes de catalogue globales restent a traiter dans des changements distincts. L'historique SQL initial reste a regulariser sans reecriture silencieuse.
