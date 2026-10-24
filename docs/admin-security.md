# Administration Chibasko Games

## Périmètre

Le rendu admin est protégé par un proxy et un layout serveur. Chaque opération
dispose également de sa propre vérification d'identité et de rôle côté serveur.
Le catalogue public est limité aux jeux publiés ; les soumissions sont privées.
Les privilèges de table et de colonne doivent être vérifiés ensemble : l'absence
d'une policy d'écriture ne suffit pas à contrôler tous les accès.

## Autorité unique

`public.admin_users(user_id)` référence auth.users(id). Aucun email, UUID personnel
ou username n'est codé en dur. ADMIN_EMAILS n'est plus utilisé et ne constitue pas
une autorisation de secours. profiles et user_metadata ne contiennent aucun droit.

La seule lecture navigateur possible est son propre user_id de membre. Aucun
navigateur, même celui d'un admin, ne peut insérer/modifier/supprimer ce rôle.
La maintenance de cette table se fait exclusivement par un opérateur privilégié.

## Authentification et pages

Le client officiel @supabase/ssr utilise les cookies pour rendre la session
Supabase disponible au serveur. Une restauration unique retire l'ancien stockage
local après tentative de reprise de session. Ce stockage ne décide jamais du rôle.
Les cookies restent accessibles au SDK navigateur (ils ne sont pas HttpOnly),
SameSite=Lax, Secure en production. Ils ne sont jamais considérés comme fiables
sans validation Supabase getUser. Aucun token n'est mis dans une URL ou un log.
Le PKCE/verifier et le renouvellement sont gérés par le SDK officiel.

`proxy.ts`, limité à /admin/:path*, vérifie avant chaque rendu, y compris les
sous-pages et navigations RSC : getUser puis own-row membership via le JWT validé.
Il relaie les cookies rafraîchis et leurs headers, sans cache public.
Anonyme/jeton rejeté → login avec next interne sécurisé. Non-admin → 404.
Erreur réseau ou table manquante → 503, jamais accès de secours.
Le layout admin dynamique effectue la même vérification côté serveur et noindex.
Le proxy couvre le rendu parallèle que le layout seul ne pourrait pas sécuriser.

Toutes les futures données privées doivent passer par requireAdmin, même dans
une Server Action ou un serveur de données. La garde de page ne remplace jamais
la garde de l'opération. Le panneau client masque aussi ses formulaires et efface
ses listes au changement de session ; cette mesure UX n'est pas l'autorité.

## API et service role

Chaque route /api/admin exige un Bearer explicite, valide getUser puis admin_users.
La membership est lue avec la clé publique et le JWT utilisateur, via RLS.
Seulement ensuite getSupabaseAdminClient crée le client privilégié. server-only
interdit son import côté navigateur. Le game-server ne reçoit pas cette clé.

Toutes les réponses JSON et exports CSV sont private/no-store. Les erreurs SQL et
fournisseur ne sont pas renvoyées brutes. Aucun JWT/cookie/header n'est journalisé.
Pour les écritures, Origin présent doit correspondre à l'origine de la requête et
Sec-Fetch-Site ne doit pas être cross-site. Sans Origin, un client API avec Bearer
reste possible : les cookies seuls ne permettent aucune écriture admin, ce qui
évite une autorisation par credentials ambiants/CSRF. Aucun CORS permissif ajouté.

## Migration et prérequis

`supabase/migrations/20261013000100_secure_admin.sql` :

- crée admin_users sans ligne ; refuse un schéma de rôle préexistant à auditer ;
- active RLS, own membership SELECT(user_id) seulement ; aucune auto-élévation ;
- interdit DML public/authenticated, y compris les grants de colonne, sur games,
  categories, game_categories, faq_entries et game_submissions ;
- remplace leurs policies par les lectures publiques nécessaires (jeux/FAQ publiés,
  catégories, liens vers jeux publiés) ; soumissions privées sans policy navigateur ;
- conserve UUID, lignes, relations, contraintes de type, médias et statistiques.

Les écritures de compteurs utilisent des RPC SECURITY DEFINER. Vérifier leurs
grants effectifs en production, ainsi que les contraintes de type du catalogue.

Avant application, exporter pour revue pg_policies, ACL tables/colonnes et définition
des RPC concernées. Les policies personnalisées des cinq tables seront remplacées.
La transaction échoue intégralement si un prérequis manque. Ne déployer le nouveau
code qu'après validation/application manuelle de la migration et attribution.
Une table absente ferme l'accès ; les anciens ADMIN_EMAILS ne sont pas migrés.

## Attribuer le rôle administrateur

1. Identifier le compte voulu dans Supabase → Authentication → Users et copier
   son UUID vérifié. Aucun email ou identité n'est ajouté à la migration.
2. Après application contrôlée de la migration, exécuter dans le SQL Editor
   privilégié (remplacer seulement le placeholder) :

```sql
insert into public.admin_users(user_id)
values ('<UUID_DU_COMPTE_VERIFIE>'::uuid)
on conflict (user_id) do nothing;
```

3. Se connecter/recharger puis vérifier /admin et /api/admin/status.
4. Révoquer si nécessaire, depuis le même outil privilégié :

```sql
delete from public.admin_users
where user_id = '<UUID_DU_COMPTE_VERIFIE>'::uuid;
```

L'app n'a aucune route pour s'accorder ce rôle. La révocation est vérifiée à la
prochaine requête, sans cache de membership. Ne restaurer aucun grant d'écriture
public pour un rollback ; revenir au code précédent se décide séparément.

## Formulaire des jeux

Un jeu classique utilise une URL de lancement validée. Un jeu distribué utilise
sa version active et les capacités du manifeste validé. Les endpoints et
credentials du serveur gameplay ne sont pas saisis dans la fiche publique.
La validation serveur contrôle la cohérence des champs de lancement avec le type.
La visibilité catalogue et le statut Bêta sont deux contrôles indépendants.

## Tests

`npm test` inclut test:admin : vrais guards et handlers avec Auth/DB simulés,
aucune donnée production. `npm run test:admin-db` crée son propre cluster local
loopback, vérifie anon/user/admin-JWT, auto-élévation, grants de colonne, drafts,
soumissions et CRUD service_role, puis arrête le cluster. Aucun DSN production.
Le compte admin et les publications de fixtures existent uniquement dans ces tests.

## Retour d’onglet et renouvellement de session

Supabase peut confirmer SIGNED_IN avec le même token au retour d’onglet. La page
ne doit jamais réinitialiser son accès dans un second abonnement Auth alors que
sa vérification dépend uniquement du token : cet effet ne repartirait pas.
Elle utilise l’AuthProvider unique et useAdminAccess, avec une requête no-store
au retour visible et après changement de token. La session fraîche est demandée
hors du callback Auth. Le contrôle complet expire après 10 secondes, y compris
si le SDK ou la réponse JSON ne termine pas ; une erreur offre Réessayer.

Pendant un contrôle du même compte, l’interface déjà ouverte reste affichée.
Cette continuité visuelle ne donne aucun droit : chaque opération reste vérifiée
par requireAdmin. Un 401 conduit vers login, un 403 ferme le panneau, un 503 ou
une erreur réseau affiche un échec explicite. Les listeners et requêtes sont
retirés/annulés au démontage ; un changement de compte remonte un panneau neuf.
Les tests admin-ui utilisent le véritable AuthProvider et la page React, avec
Auth/réseau simulés, sans accès à la production.

## Suppression des comptes et jeux publiés

La migration `20261024000100_account_deletion.sql` ajoute une demande durable de
suppression. Le transfert SQL, la suppression Auth et le nettoyage R2 sont des
étapes distinctes. Seul l'état `completed` confirme leur achèvement.

`DELETE /api/account` cible exclusivement l'identité Auth vérifiée.
`DELETE /api/admin/users/[id]` conserve le contrôle administrateur côté serveur.
Une réponse 202 représente une demande en cours, pas un compte déjà supprimé.
Le suivi et la reprise sont disponibles dans `/admin/account-deletions`.

Les jeux déjà publiés sont rattachés à l'autorité de gestion `chibasko_games`,
sans création de compte Auth ni attribution à une personne. Leurs versions,
catégories et fichiers de distribution sont conservés. Les brouillons privés
sans autre membre sont purgés ; un brouillon partagé bloque la préparation
jusqu'à résolution explicite de la gestion des autres membres.

Une demande concernant un jeu publié reste en revue tant qu'un administrateur
n'a pas vérifié les autorisations et consigné une référence interne. Cette
référence ne crée ni licence, ni cession de propriété intellectuelle. Les
conditions applicables au retrait après fermeture doivent être vérifiées pour
chaque contrat. Les messages déjà reçus par e-mail et les sauvegardes des
prestataires ne sont pas effacés par cette procédure.

Les modifications de profil, de contact et les nouveaux dépôts sont bloqués
pendant la demande. L'annulation reste possible avant la
préparation SQL. Après cette étape, une panne Auth conserve l'état `prepared` ;
une panne R2 conserve `cleanup_pending`. Le lease dure deux minutes. Les échecs
consécutifs utilisent un backoff de 60 secondes à une heure ; après huit échecs,
la reprise automatique est suspendue et une reprise admin est nécessaire. Les
pages de nettoyage réussies ne consomment pas ce budget d'échecs.

Activer `GAME_ACCOUNT_DELETIONS_ENABLED=1` uniquement après application et
vérification de la migration et configuration de la reprise dans le Worker de
maintenance existant. Le modèle `cloudflare/wrangler.maintenance.example.jsonc`
reste désactivé par défaut et indique les bindings nécessaires :
`CHIBASKO_ASSETS`, `GAME_BUILDS_STAGING` et `GAME_BUILDS_ARTIFACTS`.
Le modèle propose un cron toutes les cinq minutes. Sa présence dans le dépôt ne prouve pas son activation en production.

Les traces privées conservent le statut, les dates, la référence de revue et une
empreinte de l'identifiant pour l'idempotence. Les clés de nettoyage et l'identité
Auth brute sont effacées après leur étape respective. La durée de conservation
de ces traces doit être arrêtée dans la politique de conservation. Les anciennes
propositions sans lien Auth fiable et les anciens objets Supabase Storage
nécessitent une vérification séparée ; aucune correspondance par e-mail ne suffit
à autoriser leur suppression.

## Formulaire de contact

`POST /api/contact` utilise Resend côté serveur. L'activation nécessite la migration
`20261024000200_contact_dispatches.sql`, la maintenance existante et les paramètres
serveur `CONTACT_FORM_ENABLED=1`, `CONTACT_NOTIFY_EMAIL`, `CONTACT_HASH_SECRET`
(au moins 32 caractères aléatoires), `RESEND_API_KEY` et `RESEND_FROM_EMAIL`
(adresse d'envoi vérifiée). Aucun de ces paramètres n'est public. Les identifiants
Supabase serveur existants restent nécessaires pour les reçus et quotas.

Le corps JSON est limité à 24 Kio ; noms à 80 caractères, e-mail à 254 et message
à 5 000. Les quotas sont de cinq nouveaux messages par client et par heure, trois
par adresse et par heure, et cent pour le service par heure. L'adresse réseau est
prise uniquement depuis l'ingress Cloudflare configuré ; les autres ingress
partagent un quota conservateur. Le champ piège complète ces limites sans
constituer un CAPTCHA ni une garantie contre tous les robots.

Les reçus contiennent des HMAC et l'état d'envoi, jamais le contenu ni les
coordonnées en clair. Leur validité est de 22 heures. La tâche indépendante `contact_cleanup` et les nouvelles réservations purgent les reçus expirés ; vérifier le
fonctionnement du cron avant activation. La conservation des messages dans la
boîte destinataire ou chez Resend relève de leurs paramètres propres.

Un délai fournisseur est borné à dix secondes. La même clé et le même contenu
Resend sont conservés lors d'une reprise ; aucune répétition automatique n'est
effectuée. Les leases empêchent les envois concurrents, avec cinq tentatives au
maximum et trente secondes entre reprises. Après vingt et une heures, une
réponse ambiguë ne peut plus déclencher d'envoi. La confirmation signifie que
Resend a accepté le message, sans garantir sa livraison dans la boîte.

## Exploitation de la maintenance Cloudflare

Le Worker `cloudflare/session-maintenance.ts` partage un seul déclencheur planifié.
Son handler attend le cycle complet ; aucune promesse détachée ne porte un envoi.
Les notifications immédiates de soumission utilisent `after()` de Next.js, relayé
par le contexte d'exécution OpenNext. L'outbox assure la reprise après interruption.
Le endpoint HTTP du Worker répond 404 et ne permet aucune mutation.

| Tâche | Activation et déclencheur | Limite par cycle et reprise |
| --- | --- | --- |
| Sessions, lobbies, tickets, quotas | `GAME_SESSION_MAINTENANCE_ENABLED=1`, cron recommandé `*/5 * * * *` UTC | 100 candidats par purge ; verrous transactionnels et `SKIP LOCKED` |
| Sessions preview et launch | Même activation ; le Gateway possède aussi son cron historique de quinze minutes | 100 lignes par RPC ; exécutions répétées sans effet supplémentaire |
| Uploads expirés et validations interrompues | `GAME_UPLOAD_MAINTENANCE_ENABLED=1` | 100 candidats ; verrou Auth puis upload ; lease expiré uniquement ; aucun build lancé ni objet R2 supprimé |
| Notifications de soumission | `GAME_SUBMISSION_NOTIFICATIONS_ENABLED=1` | 5 messages, ou 1 si les suppressions sont actives ; budget 75 secondes |
| Suppression des comptes | `GAME_ACCOUNT_DELETIONS_ENABLED=1`, après validation et configuration spécifiques | Une demande/page ; budget 90 secondes ; étapes SQL, Auth puis nettoyage borné R2 |
| Reçus contact | `CONTACT_RECEIPTS_MAINTENANCE_ENABLED=1` | 100 reçus expirés sans contenu ; indépendant de l'activation du formulaire |
| Santé opérationnelle | Dès qu'une tâche est activée | Compteurs agrégés plafonnés à 1001 ; aucun identifiant personnel |

Tous les flags du modèle sont à `0`. La reprise des uploads doit être activée
avant les suppressions : une validation interrompue peut sinon retenir un compte.
Les RPC sont réservées au rôle serveur. La clé service_role reste exclusivement
dans les secrets serveur. Les bindings R2 servent au nettoyage des comptes ; les
trois buckets du modèle ne deviennent pas publics.

Les appels DB ont un délai de huit secondes. Chaque tâche échoue indépendamment,
les suivantes sont exécutées, puis le cycle signale son échec. Une interruption
empêche de nouvelles opérations externes ; une opération déjà reçue peut encore
aboutir. Les leases et clés d'idempotence traitent cette ambiguïté. Une réponse
tardive ne confirme pas un nouveau lease. Les limites du plan Cloudflare, notamment
CPU et sous-requêtes, doivent être qualifiées avec la charge réelle avant activation.

### Notifications bloquées

Le message et la clé Resend sont figés en base. Le backoff est de 5, 10, 20, 40
puis 60 minutes, avec huit tentatives au maximum. Un lease de deux minutes expiré
permet la reprise. Après 23 heures depuis la première tentative, aucune nouvelle
émission automatique n'est autorisée, à l'intérieur de la fenêtre d'idempotence
fournisseur de 24 heures. Une erreur permanente ou ces limites produisent
`attention_required`. Ne pas renouveler la clé pour contourner un résultat ambigu :
vérifier d'abord les événements fournisseur et le reçu. Une panne Resend ne
supprime ni n'annule la soumission.

### Contrôles avant activation et diagnostic

1. Appliquer les migrations additives, dont
   `20261024000300_maintenance_reliability.sql`, puis comparer le schéma en lecture
   seule au contrat versionné et exécuter le préflight des environnements.
2. Vérifier manuellement les secrets, bindings, flags et cron UTC du Worker réel.
   Une compilation ou un dry-run ne les installe pas.
3. Consulter en lecture seule `select public.distribution_maintenance_health();`
   depuis une session serveur autorisée. Ne pas exporter les lignes de contacts.
4. Observer au moins deux déclenchements réels, leurs durées et leurs limites CPU
   et sous-requêtes. La relance passe par le déclencheur planifié autorisé ou le
   cycle suivant, pas par une URL publique.
5. Configurer les alertes sur les cycles échoués, l'absence de deux cycles,
   les compteurs `*_attention`, les comptes `review_required`, les expirations
   accumulées et l'âge des notifications supérieur à une heure. Les logs portent
   `runId`, tâche, résultat, durée et compteurs. Ces traces ne prouvent pas qu'une
   alerte distante est configurée.

Le dispatcher conserve son cron vide et exige `GAME_BUILD_DISPATCHER_ENABLED=1`.
La revue manuelle n'est pas un service de nettoyage périodique. Les purges
staging/artifacts du validator exigent que ce service fonctionne réellement ;
aucun balayage R2 général n'est activé par la maintenance. Les nettoyages de
remplacement d'avatar ou de couverture restent immédiats, sans outbox durable.
Un inventaire et une politique de conservation sont nécessaires avant toute purge
des objets orphelins. La réinitialisation de mot de passe reste ponctuelle, sans
réémission automatique d'un code expiré. Les messages contact ne sont pas stockés
pour réémission : seul leur reçu permet une reprise explicite sûre.
Les anciens codes et quotas de réinitialisation sont purgés de manière opportuniste
par `cleanup_password_reset_requests()` lors d'une nouvelle demande, selon les
seuils existants ; aucune purge planifiée supplémentaire n'est activée.
