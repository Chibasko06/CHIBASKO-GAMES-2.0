# Espace développeur et suivi de publication

## Parcours

`/developer` est l’entrée principale depuis la navigation, sur ordinateur et mobile. Le Dashboard conserve un lien secondaire. Cet espace utilise le compte existant ; il ne crée ni compte développeur distinct ni second système de projets.

| Route | Fonction |
| --- | --- |
| `/developer` | Projets, visibilité actuelle et corrections demandées |
| `/developer/games` | Jeux et brouillons autorisés pour le compte |
| `/developer/games/<gameId>` | Fiche permanente, builds ZIP, révisions URL, décisions, corrections et prévisualisations privées |
| `/developer/submissions` | Liste historique existante, conservée et paginée |
| `/developer/statistics` | Compteurs réellement disponibles |
| `/developer/resources` | Guide, SDK facultatif, validateur et contact développeurs |
| `/developer/profile` | Fiche professionnelle unique, consultation, modification et vérification de l’adresse |

La fiche est en lecture seule par défaut. « Modifier » ouvre les champs ; « Annuler » rétablit les valeurs enregistrées sans requête d’écriture. Une modification de nom, studio ou portfolio conserve la vérification. Un changement réel d’adresse affiche un avertissement et demande confirmation avant sauvegarde, puis nécessite un nouveau code. Une différence de casse ou des espaces périphériques ne constituent pas un changement d’adresse.

Les formulaires de dépôt affichent uniquement un résumé de cette fiche et son état de vérification. Leur lien conduit à `/developer/profile` pour créer, modifier ou vérifier les coordonnées. Aucun second formulaire de profil n’est intégré à un brouillon. Le raccourci du Dashboard se trouve dans la section « Mon profil » ; l’accès principal reste dans « Mon compte ».

La confirmation d’un dépôt ouvre directement son dossier. Une correction ZIP appelle la préparation existante du brouillon, conserve le `gameId` et les anciens builds, puis ouvre le formulaire approprié. Une correction URL crée toujours une révision immuable. Les mises à jour depuis un dossier conservent le contexte du jeu sélectionné.

Les listes de projets sont paginées par 50. Une fiche présente 100 builds et révisions par page, avec les 50 dernières décisions de chaque élément. Les données plus anciennes restent conservées. Les motifs de décision ZIP sont désormais enregistrés avec les événements futurs ; les anciens motifs qui n’étaient pas journalisés ne sont pas reconstitués. Le dernier motif connu reste affiché.

## Audit et mécanismes réutilisés

| Domaine | Source et traitement |
| --- | --- |
| Identité du projet | `games`, `game_developer_members`, `game_developer_registrations` et brouillons existants ; aucune nouvelle table de projets |
| Accès | `authenticateDeveloper` vérifie le JWT avec Auth ; la RPC applique `account_assert_allowed` et `distribution_can_upload`. L’acteur vient exclusivement du serveur. Les propriétaires, membres autorisés et gestionnaires existants conservent leur périmètre. |
| Versions ZIP | Uploads, versions, revues et événements existants ; diagnostic et lecteur privés du parcours précédent |
| URL externe | Révisions, décisions transactionnelles et lecteur strict existants ; aucune URL libre transmise au lecteur |
| Correction | `distribution_prepare_build_correction` et `distribution_submit_external`, sans suppression du dossier ni de ses versions |
| Administration | Décisions et transactions existantes ; nouveau modèle de lecture commun au compteur et à la liste filtrée |
| E-mails | File `game_submission_notifications`, mêmes réservations, préparation figée, transport Resend et acquittements |

Les nouvelles RPC ne sont exécutables ni par `anon` ni par `authenticated`. Le serveur vérifie l’identité avant de les appeler avec sa capacité interne. Les réponses privées sont non cachables. Aucun identifiant d’accès, ticket, secret Supabase ou chemin R2 n’est inclus dans la fiche ou ses e-mails.

L’audit porte sur le code et les contrats locaux. Aucune lecture ou modification des dossiers de production d’AELORYVA et de Chibasko Morpion n’a été effectuée. Aucun jeu ou SDK externe n’a été changé.

## Administration

Les liens « Soumissions à examiner » et « Vérifications techniques en attente » ouvrent respectivement `/admin/game-builds?view=review` et `?view=validation`.

`distribution_review_queue_items` alimente à la fois le compteur et la liste paginée. La revue rassemble les dépôts ZIP soumis dont la décision reste à traiter, y compris les échecs techniques sans demande de correction, et les dernières révisions URL à examiner ou approuvées mais non publiées. Une correction déjà demandée attend le développeur et ne reste pas dans cette file. La vérification technique attend les ZIP soumis en `queued` ou `validating`.

Chaque ligne ouvre le build ou la révision exacte. La liste générale et les anciennes soumissions restent accessibles. Une révision URL sélectionnée est lue côté serveur, sans dépendre de sa présence sur la première page.

Le statut historique `published` d’un build ZIP correspond à une version acceptée. La visibilité publique dépend séparément de `games.is_published` et de la version active. Les libellés distinguent ces états ; aucune règle de décision ou de lancement n’a changé.

## E-mails transactionnels

Les nouveaux messages développeur utilisent l’adresse professionnelle du profil, vérifiée indépendamment. La confirmation Supabase Auth ne confirme pas cette adresse. Voir [la vérification professionnelle](developer-professional-email.md) pour les quotas, les messages historiques et la procédure de déploiement.

| Événement futur | Déclenchement |
| --- | --- |
| Réception | Insertion d’une soumission ZIP ou de sa révision URL |
| Nouvelle version | Même réception, avec le contexte de mise à jour et la version/révision exacte |
| Correction | Événement administratif de demande de correction, avec son motif |
| Acceptation | Acceptation du build ZIP ou approbation de la révision URL ; aucune affirmation de visibilité publique |
| Refus | Décision administrative explicite ; un échec technique seul ne constitue pas un refus |
| Publication | Passage réel à la visibilité publique ou changement de la version/révision publique |

Le From reste `noreply@chibaskogames.fr`, le Reply-To des nouveaux messages est `developers@chibaskogames.fr`. Les constructeurs réutilisent le modèle HTML et sa version texte. Le lien mène au dossier privé et conserve la destination après connexion ; il ne transporte aucun jeton.

La file existante reçoit un identifiant par message et une clé d’événement unique par soumission. Les lignes historiques gardent `id=submission_id`, leurs payloads, tentatives, leases et statuts. La clé Resend historique reste donc inchangée. Les nouvelles lignes ont leur propre identifiant stable. Une répétition du même événement ne crée pas de deuxième ligne.

L’ancien claim ne réserve que les alertes internes. Le claim étendu réserve également les messages développeur quand `GAME_DEVELOPER_NOTIFICATIONS_ENABLED=1`. Les anciens Workers restent compatibles pendant le déploiement. Les corps déjà préparés sont toujours retournés par `coalesce(message,p_message)` ; une reprise ne les reconstruit pas.

Les huit tentatives, leases, backoff, fenêtre de reprise de 23 heures et budgets de maintenance restent inchangés. La livraison peut être différée, notamment en présence d’une file importante ; elle n’est pas annoncée comme instantanée. Un acquittement Resend n’est pas une preuve de distribution dans la boîte de réception. Aucun e-mail historique n’est généré rétroactivement par les migrations.

Le nombre de messages augmente : l’alerte interne et la confirmation développeur sont deux messages distincts, suivis des décisions éventuelles. Contrôler le quota Resend du compte et les entrées en attente avant activation. Aucun forfait ou seuil fournisseur n’est modifié automatiquement.

## Statistiques

| Donnée | Interprétation |
| --- | --- |
| `games.views_count` | Consultations de la fiche comptabilisées par `PlaySessionTracker` et `increment_game_view`, avec déduplication locale dans l’onglet. Ce n’est ni un compteur de parties ni un décompte de personnes uniques. |
| `favorites` | Nombre actuel de favoris du jeu, sans identité des joueurs |
| `game_reviews` | Nombre d’avis enregistrés, pas une courbe historique de satisfaction |
| `games.play_count` | Compteur historique ; `record_game_play` n’est plus appelé par le frontend actuel. Il n’est pas présenté comme une mesure fiable des parties. |
| `play_history` | Historique des comptes connectés, partiel selon le parcours ; insuffisant pour estimer toute l’audience |
| Sessions de lancement et de livraison | Données techniques nettoyées et expirantes ; pas un entrepôt statistique |

Les compteurs peuvent sous-estimer les consultations lorsque le stockage ou la requête du navigateur échoue. Les valeurs ne certifient pas le gameplay ou une audience antifraude. Aucune statistique n’est inventée en cas d’erreur de lecture : l’interface affiche une indisponibilité.

Parties réellement commencées, joueurs uniques, durée, rétention, répartition par version et revenus nécessitent une instrumentation supplémentaire avec ses règles de confidentialité. Aucun suivi interne aux jeux n’est ajouté dans ce lot.

## Migrations et mise en production

Deux migrations locales, dans cet ordre :

1. `20261123000100_developer_workspace.sql` : lectures privées, motifs futurs des décisions, détail administratif d’une révision et définition commune des files de revue.
2. `20261123000200_developer_email_events.sql` : extension de la file existante et triggers futurs. La lecture Auth passe uniquement par `distribution_confirmed_submission_email(uuid)`, fonction `SECURITY DEFINER` détenue par `postgres`, avec un `search_path` vide et EXECUTE réservé à `service_role`. Elle reçoit un identifiant de soumission, résout son déposant et retourne uniquement son adresse confirmée, ou NULL. Aucun droit SELECT sur Auth n’est ajouté aux rôles applicatifs. La migration doit être exécutée comme `postgres` et contrôle ses droits de lecture.

Avant application, examiner le diff du schéma avec les outils existants, les clés étrangères de la file et les réservations en cours. Les migrations utilisent une transaction et un `lock_timeout` de cinq secondes. Une dépendance inattendue provoque un arrêt ; aucune contrainte n’est désactivée. Conserver les empreintes et statuts des messages acquittés pour le contrôle après migration, sans exporter leurs corps ou coordonnées.

Procédure après autorisation :

1. Appliquer les deux migrations et vérifier les droits `service_role` des nouvelles RPC, ainsi que l’absence de droit navigateur.
2. Déployer le portail et la maintenance avec `GAME_DEVELOPER_NOTIFICATIONS_ENABLED=0`, valeur préparée localement. Ne pas déployer le Gateway ou le dispatcher.
3. Vérifier les nouveaux écrans et les destinataires professionnels existants. Les autres flags, secrets, bindings et crons restent identiques.
4. Après validation, passer le nouveau flag à `1` dans les deux configurations versionnées et livrer les deux Workers par leur circuit habituel. Aucune nouvelle clé ni infrastructure n’est nécessaire.
5. Observer les acquittements de nouvelles opérations autorisées. Ne pas rejouer les anciens événements, remettre `sent_at` à zéro ou changer leurs clés pour rattraper un e-mail ancien.

Un retour du nouveau flag à `0` arrête la prise en charge des messages développeur par le service, sans effacer la file. Les anciens claims restent réservés aux alertes internes. Ne pas tenter de rétablir l’ancienne clé primaire après la création de plusieurs événements par soumission ; aucun retour arrière SQL destructeur n’est prévu. Les messages ayant déjà commencé leurs tentatives restent soumis à leur fenêtre de reprise, et exigent une vérification fournisseur avant intervention.

### Reprise après `auth_email_permission_required`

La version initiale de la migration 002 exigeait un accès direct à Auth pour `service_role`. Le socle de test accordait ce droit et ne représentait pas les permissions de production. Les tests révoquent désormais explicitement tous les droits sur `auth.users` aux trois rôles applicatifs avant cette migration et vérifient leur refus après application.

Si la migration 001 a réussi, ne pas la réexécuter. La migration 002 contient `BEGIN`/`COMMIT` : son échec initial annule toutes ses opérations. Dans SQL Editor, choisir le rôle `postgres`, vérifier avec `docs/sql/developer-email-events-postflight.sql` que les éléments de 002 sont absents, puis exécuter le fichier 002 corrigé en entier, une seule fois. Ne pas exécuter uniquement l'extrait de la fonction. Relancer le contrôle après application. Si des éléments de 002 existent déjà, arrêter et inventorier l'état au lieu de supprimer ou recréer la file. Conserver le flag à `0` pendant cette reprise.

## Vérifications locales

Commandes ciblées : `npm run test:developer-workspace`, `npm run test:developer-workspace-db`, `npm run test:developer-submissions`, `npm run test:developer-submissions-browser`, `npm run test:build-reviews`, `npm run test:maintenance`, `npm run test:email-diagnostic`, TypeScript, ESLint ciblé et build Cloudflare sous Linux.

Le test de pipeline utilise PostgreSQL jetable et le vrai Worker workerd : insertion SQL → file → claim → constructeur → faux Resend → acquittement SQL. Il vérifie le destinataire confirmé, la correction, la reprise et les doublons. Aucun e-mail réel n’est envoyé.

Les tests DOM couvrent la navigation et la préparation d’une correction. Les scénarios Chrome existants couvrent les formulaires, la reprise et les URL ; le scénario utilisant un ZIP distribué du SDK reste ignoré si son artefact externe n’est pas fourni. Une simulation DOM ne remplace pas une vérification visuelle de tous les écrans en production.

Résultats locaux du 23 novembre 2026 :

| Contrôle | Résultat |
| --- | --- |
| Espace développeur : service, messages et interface DOM | 12 tests réussis |
| Soumissions existantes | 23 tests réussis |
| Revue administrative | 27 tests réussis |
| Maintenance | 20 tests réussis |
| Diagnostic des constructeurs d’e-mails | 7 tests réussis |
| Préflight de production | 9 tests réussis |
| Chrome : soumissions, reprise et URL | 8 réussis, 1 ignoré : artefact ZIP SDK non fourni |
| PostgreSQL jetable | 54 migrations ; droits, historique, transitions et pipeline de notifications vérifiés |
| TypeScript et ESLint ciblé | Réussis ; un avertissement préexistant dans la déconnexion de Navbar |
| Builds maintenance et Cloudflare sous Linux | Réussis ; démarrage réel du Worker OpenNext vérifié, aucun déploiement |
| `git diff --check` | Réussi |
