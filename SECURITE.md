# Sécurité de Chibasko Games

## Périmètre et état des sept portes

Les conclusions locales portent sur le code versionné, ses migrations et les
fixtures. Elles ne valident ni la configuration distante de Supabase Auth ni les
fichiers effectivement servis en production. Les tests destructifs utilisent
exclusivement un PostgreSQL jetable sur 127.0.0.1 et des services simulés.

| Porte | État local | Limites et vérifications restantes |
| --- | --- | --- |
| 1. Navigateur | Aucun secret détecté dans les artefacts inspectés ; réponses privées sans cache public | Réexaminer les bundles, source maps et réponses de la version réellement déployée avec les seuls comptes de test. |
| 2. Clé d’IA | Aucune intégration d’IA ni clé associée détectée | Toute future intégration exige un nouvel audit, un appel serveur et un budget borné. |
| 3. RLS | Contrôle du mode des politiques et de leurs attributs ; tests croisés PostgreSQL | Comparer un nouveau snapshot de production avec le contrat. Les anciens exports sans `policyFormat: 1` sont refusés. |
| 4. Propriété des données | Identité vérifiée, autorisations serveur/SQL, fixtures entre comptes | Qualifier en lecture seule les identifiants appartenant aux seuls comptes de test. Un résultat vide sans donnée témoin est non concluant. |
| 5. Administration | Session vérifiée et appartenance à `admin_users` contrôlées côté serveur | Refaire les refus invité/compte ordinaire et contrôler la protection du compte administrateur. |
| 6. Inscription et abus | Limites SQL du contact et de la réinitialisation ; réglages Supabase Auth non attestés | Suivre la procédure ci-dessous. Les compteurs de vues et de parties restent répétables par décision du projet. |
| 7. Paiement | Aucun paiement intégré ni webhook ; lien de don PayPal externe | Toute intégration future exige signature, fraîcheur et idempotence des événements avant attribution d’un droit. |

Les clés publiques Supabase, identifiants de mesure/publicité, profils publics et
adresses publiques des images ne sont pas des secrets. Les clés privilégiées,
mots de passe, jetons de session et secrets de fournisseur ne doivent jamais
figurer dans un ticket, une capture, un rapport ou un journal partagé.

Une fuite confirmée impose une révocation chez le fournisseur et une rotation.
Supprimer une valeur du code ou de l’historique ne révoque pas cette valeur.

## Contrôle du schéma et des politiques

Le snapshot `docs/sql/production-schema-snapshot.sql` s’exécute dans une transaction
en lecture seule. Il enregistre, pour chaque politique modélisée, son nom, son mode
PERMISSIVE/RESTRICTIVE, ses rôles, sa commande, USING et WITH CHECK. Les propriétés
RLS et FORCE RLS, les grants et les fonctions privilégiées restent contrôlés.

Le comparateur refuse un export incomplet, même s’il ressemble à une ancienne
référence incomplète. Les rôles d’une même politique sont comparés sans tenir
compte de leur ordre. Une politique publique conforme à la référence reste valide ;
le contrôle n’impose pas une restriction au propriétaire sur les données publiques.

La référence couvre les objets applicatifs modélisés et les protections Storage
historiques. Inventorier aussi les tables supplémentaires présentes à distance :
un objet situé hors de ce périmètre nécessite une revue explicite.

Pour comparer une base distante, disposer d’abord d’un accès autorisé en lecture
seule. Configurer une connexion PostgreSQL nommée hors du dépôt, sans secret sur
la ligne de commande. Avec ce service configuré, exécuter manuellement :

```powershell
$env:PGSERVICE = 'chibasko-audit-readonly'
psql -X -v ON_ERROR_STOP=1 -f docs/sql/production-preflight.sql
psql -X -v ON_ERROR_STOP=1 -f docs/sql/production-schema-snapshot.sql -o "$env:TEMP\chibasko-schema.json"
node scripts/schema-drift.mjs "$env:TEMP\chibasko-schema.json"
```

Ces commandes ne sont pas lancées par la suite locale. Un préfixe de migrations
cohérent indique des migrations requises, pas un schéma prêt à servir. Ne pas
régénérer le contrat depuis une base de production inconnue pour accepter un écart.
La reconstruction locale contrôlée utilise `node tests/production-schema-reference.mjs --write`.

## Supabase Auth : vérification de la configuration réelle

### Relevé en lecture seule

Dans le projet Supabase correspondant au domaine public, relever la date et les
réglages suivants sans modifier les interrupteurs et sans copier de secret.
L’absence de `supabase/config.toml` ne permet pas de déduire les réglages hébergés.

| Emplacement / réglage | Contrôle attendu | État distant |
| --- | --- | --- |
| Authentication, fournisseur Email : confirmation des e-mails | Vérifier que la confirmation est requise avant une session email/mot de passe ; le texte du formulaire ne prouve pas ce réglage. | Non vérifié |
| Authentication, Rate Limits | Relever séparément les plafonds, unités et rafales des inscriptions anonymes si autorisées, connexions par mot de passe, OTP, vérifications, renouvellements et envois d’e-mails. Ne pas confondre par IP, par utilisateur et par projet. | Non vérifié |
| Authentication, Bot and Abuse Protection | Relever si CAPTCHA est actif et quel fournisseur est utilisé. La présence de Turnstile dans le signalement ne prouve aucune protection Auth. | Non vérifié |
| Authentication, SMTP / Send Email hook | Identifier le mécanisme actif, le domaine expéditeur vérifié, les limites et les erreurs de livraison. Ne pas exporter les identifiants SMTP ou clés API. | Non vérifié |
| URL Configuration | Vérifier l’URL du site et les redirections de confirmation/OAuth autorisées ; distinguer production et test. | Non vérifié |
| Fournisseur Google | Contrôler son activation et ses redirections sans exposer son secret ; qualifier ce parcours séparément de la connexion par mot de passe. | Non vérifié |
| Sessions et sécurité des mots de passe | Relever les protections disponibles et la protection du compte administrateur ; ne pas attribuer de garantie non vérifiée. | Non vérifié |

Les limites Auth s’appliquent aux endpoints Supabase, y compris lorsqu’ils sont
appelés sans passer par le portail. Une règle Cloudflare du portail ne couvre pas
à elle seule `https://<projet>.supabase.co/auth/v1/…`.

Une lecture de la Management API `GET /v1/projects/<référence>/config/auth` peut
servir à ce relevé avec une autorisation explicite. Ne jamais journaliser ou
enregistrer sa réponse complète : elle peut contenir des secrets. Préférer les
écrans de configuration et un relevé des seuls booléens et plafonds nécessaires.

### Protections déjà présentes dans le code

`app/register/page.tsx` appelle `signUp` et `app/login/page.tsx` appelle
`signInWithPassword`. Les formulaires ne transmettent actuellement pas de
`captchaToken`. Le verrou de chargement évite les doubles clics ; il n’est pas une
protection contre un script externe. La session et le profil sont vérifiés avant
la redirection. Les erreurs restent génériques et les opérations ont des délais
bornés. Les limites effectives de ces appels sont celles du projet Supabase.

La réinitialisation utilise les routes `app/api/auth/password-reset/*`, du SQL et
Resend. Les réservations sont limitées à 20 par heure et empreinte IP, trois par
heure et adresse, avec un espacement d’une minute ; les codes expirent après dix
minutes et cinq essais infructueux. Ces protections ne sont pas remplacées par
l’activation du CAPTCHA natif de Supabase. Contrôler également l’endpoint natif de
récupération Supabase s’il reste disponible, même si le portail ne l’utilise pas.

Le contact ordinaire applique cinq réservations par heure et empreinte IP, trois
par adresse et un plafond global de 100 par heure, avec reçus et idempotence. Les
notifications administratives ont leurs propres outbox et traitements bornés.

Aucun crédit gratuit ni budget d’IA n’est distribué. Les anciennes colonnes XP ne
constituent pas un système actif de crédit ou de paiement.

### Intégration Turnstile à qualifier avant activation

Supabase Auth prend en charge Cloudflare Turnstile. La vérification déjà présente
dans `ReportForm.tsx` et `moderationRequest.ts` concerne uniquement les signalements
invités, avec l’action `moderation` et une validation du hostname côté serveur.
Ses variables restent `MODERATION_TURNSTILE_SITE_KEY` et `MODERATION_TURNSTILE_SECRET`.

Pour protéger l’authentification, prévoir un widget Auth distinct dans le même
service Turnstile, avec les hostnames attendus. Sa clé de site est publique ; son
secret doit être configuré dans Supabase Auth, où les appels directs sont vérifiés.
Le raccord des formulaires Auth n’est pas implémenté. L’activation distante reste
à vérifier. Aucun nouveau Worker, cron ou service payant n’est nécessaire.

Le raccord doit transmettre un jeton neuf dans `options.captchaToken` pour
l’inscription et la connexion par mot de passe. Les expirations, erreurs et reprises
doivent renouveler le jeton. Ne pas vérifier le même jeton d’abord dans le portail
puis dans Supabase : un jeton Turnstile n’est utilisable qu’une fois et expire après
cinq minutes. Ne pas réutiliser un jeton de signalement pour une connexion.

Ne pas activer le CAPTCHA distant avant que le frontend compatible soit qualifié :
les formulaires actuels n’envoient pas le jeton requis. Ne pas présenter un CAPTCHA
uniquement côté portail comme une protection des API Supabase. La connexion Google,
les sessions existantes, le refresh et le reset personnalisé doivent être testés
séparément ; la couverture d’un formulaire ne prouve pas celle d’un autre flux.

### Qualification des appels directs

Les scénarios qui envoient des e-mails, créent une session/un compte ou provoquent
un blocage de fréquence nécessitent une autorisation spécifique. Les exécuter sur
une instance Supabase de test ou une instance Auth locale avec courrier capturé.
La base actuelle de production, même avec deux comptes de test, ne fournit pas une
isolation suffisante pour une campagne d’inscriptions ou de force brute.

| Scénario sur l’instance isolée | Résultat à constater |
| --- | --- |
| Inscription email avec confirmation requise | Aucune session utilisable avant confirmation ; aucune attribution de droits gratuits. |
| `/auth/v1/signup` direct, CAPTCHA actif, jeton absent ou invalide | Refus sans création de compte ni envoi indu ; noter le code sûr et vérifier l’état de test. |
| `/auth/v1/token?grant_type=password` direct sans jeton, CAPTCHA actif | Refus ; l’appel direct ne contourne pas le contrôle du fournisseur. |
| Jeton valide puis même jeton rejoué / expiré | Premier usage conforme ; réutilisation ou expiration refusée, nouveau jeton requis. |
| Mauvais mot de passe / adresse inconnue | Pas de fuite supplémentaire d’existence de compte ; erreurs maîtrisées. |
| Dépassement borné du plafond relevé | Réponse de limitation, sans continuer les tentatives ; vérifier l’unité et la rafale réellement configurées. |
| SMTP indisponible ou quota d’envoi atteint | Pas de fausse confirmation de livraison, aucun secret dans l’erreur. |
| Google, connexion lente, refresh, déconnexion, reset | Parcours accessibles et cohérents ; aucun faux rôle ni profil appartenant à un autre compte. |

La lecture croisée en production peut être préparée avec deux comptes dédiés :
une donnée témoin déjà existante chez son propriétaire doit être absente pour
l’autre compte. Se limiter à leurs profils/favoris/uploads existants et aux refus
d’accès administrateur. Ne créer aucun témoin et ne lire aucune donnée d’un autre
joueur sans autorisation. Garder les JWT dans le navigateur, hors des rapports.

## Compteurs : décision du projet

`increment_game_view` et `record_game_play` conservent leur fonctionnement actuel.
Des appels anonymes répétés peuvent augmenter les vues et parties, fausser les
classements et consommer des ressources. Ce risque est connu et accepté pour ces
compteurs. Aucun quota, CAPTCHA ou autre restriction spécifique n’est ajouté.
Ces statistiques ne constituent pas une mesure d’audience résistante à la fraude.

## Tests locaux

Depuis la racine du projet :

```sh
npm run test:securite
```

Cette commande exécute la suite applicative, la reconstruction/qualification du
schéma sur PostgreSQL jetable et les tests navigateur Auth, profils, modération et
lecteur HTML5. Les suites navigateur s’exécutent séquentiellement pour borner la
charge locale, avec les mêmes assertions et délais de test. Elle n’applique aucune migration distante et ne modifie pas le
contrat : l’option `--write` est réservée à sa régénération contrôlée.

Prérequis : dépendances installées, PostgreSQL local (`initdb`, `pg_ctl`, `psql`)
et Chrome pour Playwright. Sous Windows, le chemin PostgreSQL par défaut est celui
des tests ; `CATALOGUE_TEST_PG_BIN` permet de fournir un autre dossier de binaires.
Les simulations externes ne prouvent pas les réglages GoTrue de production.

Le contrôle RLS reproduit une lecture croisée après remplacement d’une politique
restrictive par une politique permissive, exige `BLOCKING_DRIFT`, puis rétablit la
politique dans la base jetable. Les tests couvrent aussi rôles, commande,
USING/WITH CHECK, activation RLS, attributs absents, politiques publiques et ordre
des rôles. Les tests existants contrôlent les privilèges et les RPC sensibles.

Compléter avant une mise en ligne par TypeScript, ESLint, les builds et les dry-runs
existants. Le build OpenNext et le démarrage Worker peuvent être qualifiés dans une
copie Linux sans secrets avec `scripts/validate-cloudflare-linux.sh`.

La commande locale ne remplace ni la recherche de secrets dans l’historique Git,
ni l’inspection des bundles/réponses réellement déployés, ni le relevé Auth distant.
Une intégration d’IA ou de paiement ultérieure impose de nouveaux tests et une mise
à jour de cet état avant activation. Ne pas déclarer les sept portes fermées en
production sur la seule base du succès des tests locaux.

Au contrôle du 5 novembre 2026, `npm audit --omit=dev` ne signale aucune
vulnérabilité. L’audit complet signale 12 entrées modérées dans la chaîne des outils
de développement, liées aux avis `GHSA-3g3m-2fjr-6pw4` (glob) et
`GHSA-g3hv-75wg-m249` (minimatch). Ces entrées transitives ne représentent pas douze
failles indépendantes de l’application. Leur traitement nécessite une revue des
versions compatibles ; les suggestions de rétrogradation majeure de l’audit ne
doivent pas être appliquées automatiquement. Relancer les deux audits avant une
release et distinguer l’exposition des outils de celle du Worker généré.

## Références de configuration

- [Limites Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits)
- [CAPTCHA Supabase Auth](https://supabase.com/docs/guides/auth/auth-captcha)
- [Confirmation des e-mails](https://supabase.com/docs/guides/auth/passwords)
- [Validation et durée des jetons Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Modes des politiques PostgreSQL](https://www.postgresql.org/docs/current/sql-createpolicy.html)
