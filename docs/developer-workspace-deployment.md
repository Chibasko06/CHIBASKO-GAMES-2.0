# Déploiement de l’Espace développeur — 24 novembre 2026

Les deux Workers ont été livrés directement depuis les sources locales qualifiées, sans commit ni push. Aucun Gateway, dispatcher, jeu ou SDK externe n’a été déployé. Les notifications développeur restent désactivées.

| Worker | Version précédente | Version déployée |
| --- | --- | --- |
| Portail `chibasko-games-preview` | `2a205e11-4ab8-43ab-8f50-065feab058da` | `97af8a22-5c93-4ff6-949b-4a80659a23bb` |
| Maintenance `chibasko-session-maintenance` | `a145ffc7-2a86-4936-b705-1e1a6b531576` | `fb0d6f34-7409-44af-99b9-83c4505cda8e` |

## Préflight et livraison

- Les modifications Git concernent l’Espace développeur et ses tests, contrats, configurations et documents. Le commit de départ reste `75438eb`. Les fichiers privés, credentials et archives de diagnostic sont ignorés ; aucun n’est suivi par Git.
- Le préflight local reconnaît les 54 migrations et leurs empreintes, sans échec. Les migrations `20261123000100` et `20261123000200` ont été appliquées en amont par l’administrateur, sans réapplication pendant le déploiement.
- Le postflight SQL a été exécuté manuellement dans SQL Editor ; son résultat a été fourni pour contrôle. Les deux migrations sont présentes, le helper est détenu par `postgres`, en `SECURITY DEFINER`, avec un `search_path` vide. EXECUTE est refusé à `anon` et `authenticated`, accordé à `service_role`. Les cinq déclencheurs sont actifs.
- Un droit préexistant sur la seule colonne Auth `email` est présent pour `service_role`. Le droit sur `email_confirmed_at` est absent. Aucune permission Auth n’a été modifiée pendant cette livraison.
- Le build Cloudflare a été exécuté sous Linux avec les variables publiques réelles et sans fichier local de secrets. Le smoke test OpenNext a réussi. La maintenance a été compilée et vérifiée par dry-run. Les 12 tests développeur et les 20 tests maintenance ont été rejoués avec succès, sans e-mail réel.
- Le portail a été déployé en premier avec `node scripts/cloudflare.mjs deploy` depuis le build Linux ; la maintenance ensuite avec `npm run deploy:maintenance`. Les vérifications d’identité de version ont précédé chaque déploiement.

La comparaison des versions Cloudflare avant/après confirme la conservation des variables existantes, y compris les variables distantes supplémentaires du portail, de l’inventaire des secrets, des trois bindings R2, des domaines, des routes, de l’observabilité et des paramètres runtime. Le cron maintenance reste `*/5 * * * *`. Aucune valeur de secret n’a été affichée, exportée dans les rapports ou remplacée.

`GAME_DEVELOPER_NOTIFICATIONS_ENABLED=0` est maintenant explicite dans les deux versions actives. Les autres flags, notamment ceux de notifications internes et de maintenance, restent inchangés. Le validateur automatique des builds tiers n’a pas été activé.

## Contrôles de production

| Contrôle | Méthode et résultat |
| --- | --- |
| Nouvelles routes `/developer`, `/developer/games`, `/developer/statistics`, `/developer/resources` | GET réels : HTTP 200, sans erreur de rendu serveur. Les routes statiques servent une coquille publique ; leurs données sont chargées par l’API privée. |
| Fiche permanente d’AELORYVA | GET réel : HTTP 200 ; lecture RPC autorisée au propriétaire. Versions 1.0.0 et 1.0.1 et leurs deux événements respectifs conservés ; ancien motif de correction présent. Version publique et visibilité inchangées. |
| Accès privé | API workspace : HTTP 401 sans session et `Cache-Control: private, no-store`. RPC refusée à un autre compte réel, ainsi qu’aux appels publics. Aucun jeton utilisateur n’a été fabriqué. |
| Administration | Redirection vers la connexion sans session ; API de file refusée avec HTTP 401. RPC administratives exécutées en lecture seule : compteurs et listes filtrées concordent, zéro élément à examiner et zéro vérification technique en attente à cet instant. |
| Corrections de builds | Données et motif vérifiés en lecture seule ; préparation d’une correction couverte par les tests locaux. Aucune action de correction n’a été exécutée sur un dossier réel. |
| Ancienne file | Huit notifications internes acquittées : mêmes identifiants, statuts, tentatives et empreintes des corps avant/après. Aucun message interne en attente, aucun lease actif, aucun doublon d’événement. |
| Notifications développeur | Flag `0` confirmé dans les deux Workers ; aucune ligne développeur et aucun nouvel acquittement observés. Aucun événement fictif n’a été créé pour tester la file. La sélection exclusive des alertes internes avec le flag à `0` est aussi couverte localement. |
| Journaux après livraison | Observation passive du 24 novembre, de 01 h 57 à 02 h 01 heure de Paris : un cycle naturel de maintenance terminé, tâche notifications réussie avec zéro envoi, zéro message en attente ou en attention, aucune exception ; quatre invocations du portail terminées sans erreur. Aucune tâche n’a été déclenchée manuellement. |

Le contrôle d’autorisation de l’outil a refusé l’accès à Google Chrome. Aucune vérification visuelle en session connectée n’a donc été effectuée. Les lectures RPC ne remplacent pas une navigation complète de l’interface sous le compte du développeur ou de l’administrateur. Aucun changement de statut n’a été effectué pour tester une transition en production.

Les preuves techniques sont conservées localement dans `.distribution/developer-release/`, ignoré par Git : snapshots non secrets, empreintes des messages, builds, versions et sauvegardes du contenu des Workers précédents. Les rapports ne contiennent pas les corps des e-mails ni les coordonnées des développeurs.

## Retour arrière disponible

Les versions précédentes ont été relues et leurs contenus sauvegardés avant livraison. Elles utilisent déjà les adresses professionnelles et restent compatibles avec la file migrée : l’identifiant historique des alertes internes est conservé et les anciens claims ne prennent pas les événements développeur.

En cas de régression nécessitant un retour arrière, après examen de l’incident et autorisation appropriée :

```powershell
node node_modules/wrangler/bin/wrangler.js versions deploy 2a205e11-4ab8-43ab-8f50-065feab058da@100% --yes --config wrangler.jsonc
node node_modules/wrangler/bin/wrangler.js versions deploy a145ffc7-2a86-4936-b705-1e1a6b531576@100% --yes --config cloudflare/wrangler.maintenance.production.jsonc
```

Ce sont des cibles conservées, pas des commandes exécutées pendant cette livraison. L’absence du nouveau flag dans ces anciennes versions signifie désactivé. Aucun rollback SQL, effacement de la file ou changement de clé d’idempotence n’est nécessaire. Ne pas utiliser une version plus ancienne qui rétablirait des coordonnées obsolètes.

L’activation des notifications développeur reste une opération distincte, non réalisée et nécessitant une autorisation.

Verdict : déploiement réussi avec les notifications développeur désactivées. Aucun blocage technique détecté sur les contrôles accessibles. La navigation visuelle connectée et une véritable transition de correction ou d’envoi restent non vérifiées en production ; les dernières sont volontairement exclues des tests sans événement réel autorisé.
