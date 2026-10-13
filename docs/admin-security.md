# Administration Chibasko Games

## Audit avant correction

`app/admin/page.tsx` était un composant client sans layout/proxy serveur. L'URL
affichait formulaires et dashboard indépendamment de l'autorisation. Les API
étaient déjà protégées : Supabase getUser puis ADMIN_EMAILS côté serveur avant
service_role. L'exposition de l'interface ne permettait donc pas à un compte normal
d'écrire via ces API. Aucun rôle en base n'est décrit dans les sources actuelles.

Le catalogue possède une policy de lecture is_published=true ; les soumissions
sont déjà backend-only depuis la migration de sécurité précédente. Les grants
historiques du catalogue étaient néanmoins larges : la nouvelle migration ferme
explicitement les privilèges de table ET de colonne plutôt que dépendre seulement
de l'absence d'une policy d'écriture. Le schéma production n'a pas été interrogé
ou modifié pendant cette phase ; vérifier ses policies avant application.

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

## Migration préparée, non appliquée

`supabase/migrations/20261013000100_secure_admin.sql` :

- crée admin_users sans ligne ; refuse un schéma de rôle préexistant à auditer ;
- active RLS, own membership SELECT(user_id) seulement ; aucune auto-élévation ;
- interdit DML public/authenticated, y compris les grants de colonne, sur games,
  categories, game_categories, faq_entries et game_submissions ;
- remplace leurs policies par les lectures publiques nécessaires (jeux/FAQ publiés,
  catégories, liens vers jeux publiés) ; soumissions privées sans policy navigateur ;
- conserve UUID, lignes, relations, contraintes de type, médias et statistiques.

Les RPC existantes de statistiques/lecture ne sont pas modifiées ; dans les sources
les écritures compteur sont SECURITY DEFINER. Vérifier aussi ce point en production.
Les contraintes CLASSIC/MULTIPLAYER existantes ne sont pas remplacées.

Avant application, exporter pour revue pg_policies, ACL tables/colonnes et définition
des RPC concernées. Les policies personnalisées des cinq tables seront remplacées.
La transaction échoue intégralement si un prérequis manque. Ne déployer le nouveau
code qu'après validation/application manuelle de la migration et attribution.
Une table absente ferme l'accès ; les anciens ADMIN_EMAILS ne sont pas migrés.

## Accorder TON compte administrateur — manuel uniquement

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

Jeu classique : URL obligatoire, aucun Game ID. Multijoueur Chibasko Games :
liste issue du manifeste généré, capacité en lecture seule, aucune URL réseau.
Un changement de type efface les champs de lancement et conserve les autres
données. La sérialisation et la validation serveur imposent leurs valeurs null.
Nouveau multi non publié ; publication et Bêta restent deux booléens indépendants.
Chibasko Pong n'est ni créé ni publié par cette phase.

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
