# Adresse professionnelle des développeurs

`/developer/profile` modifie la fiche `developer_contacts` existante. L’adresse du compte Supabase Auth reste indépendante. La confirmation du compte ne confirme pas l’adresse professionnelle.

## Vérification et soumissions

Un code à six chiffres est valable dix minutes. Cinq essais sont autorisés par code, avec un délai de renvoi de 60 secondes, trois demandes par heure et dix par 24 heures, par compte ou destination. Le serveur impose ces limites, y compris en cas de demandes concurrentes. Une demande rejouée avec le même identifiant ne crée pas un autre envoi.

Les anciens profils restent non vérifiés jusqu’à confirmation. Un avertissement reste affiché dans l’Espace développeur. L’historique reste accessible ; les nouveaux dépôts et corrections ZIP, SDK et URL nécessitent une adresse professionnelle vérifiée. Les contrôles existent dans le serveur et PostgreSQL. Une modification d’adresse invalide sa preuve et les codes précédents. Une livraison déjà engagée doit se terminer avant ce changement.

Le code est généré par Web Crypto. Sa preuve HMAC est liée au compte, à la révision de l’adresse et à la demande. Le message est chiffré par AES-GCM dans la file existante ; le code et son HTML ne sont pas stockés en clair. Les reprises conservent le corps et la clé d’idempotence d’origine. Les preuves expirées sont effacées par lots bornés ; les demandes sont conservées au plus trente jours sous réserve du passage de la maintenance.

## Notifications

Les confirmations et décisions futures utilisent uniquement l’adresse professionnelle vérifiée, sans repli vers Auth. L’alerte interne de soumission conserve son destinataire et ses règles. Les messages déjà envoyés restent inchangés. Les anciens messages développeur non envoyés sont mis en attente (`legacy_recipient`) ; une adresse modifiée bloque ses messages non envoyés (`email_changed`). Les événements produits sans adresse vérifiée sont conservés avec `unverified_email`.

Vérifier une adresse ne réémet aucun ancien événement. Les statuts et motifs restent disponibles dans le portail. Ne pas réécrire les corps, destinataires ou clés d’idempotence des anciennes notifications pour les relancer. Un message accepté par Resend n’est pas présenté comme livré.

Le même transport Resend, la même file `game_submission_notifications` et le même Worker de maintenance sont utilisés. La vérification possède son propre flag ; elle ne dépend pas de l’activation des notifications de publication.

## Mise en production

1. Exécuter `docs/sql/developer-professional-email-preflight.sql` en lecture seule. Les migrations workspace et événements du 23 novembre sont nécessaires. Attendre la fin des leases développeur actives : la migration refuse de les modifier. Ne pas les supprimer manuellement.
2. Appliquer uniquement `supabase/migrations/20261124000100_developer_professional_email.sql` dans SQL Editor, une fois. Ne pas rejouer les migrations précédentes. Elle conserve les profils et ajoute les preuves, permissions, gardes et fonctions de file.
3. Exécuter `docs/sql/developer-professional-email-postflight.sql`. Vérifier les droits et les éventuels messages retenus, sans les réémettre.
4. Définir le même secret aléatoire `DEVELOPER_EMAIL_CODE_SECRET` (32 caractères minimum) dans le portail et la maintenance, sans le placer dans Git. Conserver les secrets Supabase et Resend, bindings et cron existants. Une rotation rend les demandes chiffrées antérieures inutilisables : demander un nouveau code après leur expiration, sans repli sur une clé ancienne implicite.
5. Construire le portail sous Linux avec `npm run build:cloudflare`. Construire la maintenance avec `npm run build:maintenance` puis `npm run check:maintenance` (dry-run). Utiliser le pipeline de déploiement existant, sans méthode concurrente.
6. Déployer maintenance puis portail avec `DEVELOPER_EMAIL_VERIFICATION_ENABLED=0` et `GAME_DEVELOPER_NOTIFICATIONS_ENABLED=0`. La garde SQL est immédiatement active : prévoir cette courte fenêtre de maintenance pour les dépôts.
7. Après autorisation, activer uniquement `DEVELOPER_EMAIL_VERIFICATION_ENABLED=1` dans les deux configurations déployées. `RESEND_API_KEY` et `RESEND_FROM_EMAIL=noreply@chibaskogames.fr` sont nécessaires. Conserver `GAME_DEVELOPER_NOTIFICATIONS_ENABLED=0` jusqu’à validation distincte.
8. Avec autorisation d’envoi réel, vérifier un profil contrôlé, puis ses dépôts et corrections. Sans cette autorisation, contrôler seulement les pages, permissions, configurations et files anonymisées.

En cas d’incident, remettre le flag de vérification à `0` : l’historique reste accessible, les nouvelles soumissions non vérifiées restent refusées. Ne pas retirer la migration ni déployer une version ancienne qui réutiliserait les destinataires Auth. Conserver une version compatible avec le nouveau contrat pour tout retour arrière.

## Qualification locale

`npm run test:developer-email` couvre le contrôleur et la cryptographie. `npm run test:developer-email-db` applique les migrations à PostgreSQL jetable et traverse le vrai Worker avec Resend simulé. `npm run test:developer-workspace-db` couvre les transitions existantes. Les tests navigateur du profil utilisent exclusivement des fixtures locales ; aucun e-mail réel n’est envoyé.

Les clients Gmail/LWS, la réception effective, les secrets distants et les versions de production ne sont pas qualifiés par ces tests. Une adresse vérifiée prouve sa possession à cet instant, pas la délivrabilité de tous les futurs messages.

Résultats locaux du 24 novembre 2026 :

| Contrôle | Résultat |
| --- | --- |
| Cryptographie, contrôleur et transport de vérification | 5 réussis |
| Workspace : service et interface | 12 réussis |
| Présentation et parcours Chrome ordinateur/mobile | 6 + 23 réussis |
| Soumissions serveur | 24 réussis |
| Soumissions Chrome | 8 réussis ; 1 ignoré faute d’artefact SDK distribué |
| Maintenance | 20 réussis |
| Préflight et configuration | 10 réussis |
| TypeScript et ESLint ciblé | Réussis |
| Maintenance : compilation et dry-run | Réussis |
| Cloudflare sous Linux et démarrage OpenNext | Réussis, services locaux simulés |

PostgreSQL jetable couvre les 55 migrations, les permissions applicatives, les profils historiques, le refus transactionnel en présence d’une lease, les quotas, l’expiration, les essais concurrents et les gardes de soumission. Le pipeline traverse le vrai Worker avec Resend simulé : perte d’acquittement, reprise du corps chiffré, idempotence, confirmation concurrente et destinataire professionnel. Le pipeline historique workspace vérifie aussi les transitions ZIP/URL et les alertes internes.
