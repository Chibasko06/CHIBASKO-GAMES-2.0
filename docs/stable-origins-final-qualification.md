# Origines stables : qualification finale et mise en production

État au 10 novembre 2026 : **verdict B, activation non autorisée**. `GAME_STABLE_ORIGINS_ENABLED` reste à `0`. Les sauvegardes restent dans le navigateur, sans sauvegarde cloud. Ce document remplace les conclusions et procédures des deux rapports précédents.

## Cookies : ce qui est démontré

La matrice `tests/cookie-transport.browser.test.mjs` compare 24 observations par moteur : interception Playwright ou véritable HTTPS local, contexte propriétaire, iframe de même site ou intersite, noms de domaines de test ou réels redirigés exclusivement vers la boucle locale, avec et sans sandbox, cookie partitionné ou non.

- Chrome 156 et Firefox 157 transmettent le cookie de production dans les contextes testés.
- WebKit Windows 27.2 échoue avec les réponses interceptées, même en contexte propriétaire. Cette interception ne constitue donc pas une preuve fiable du comportement des cookies.
- En véritable HTTPS local, WebKit accepte le cookie en contexte propriétaire et de même site, mais ne le transmet pas dans l'iframe intersite. Le résultat demeure négatif avec les noms de domaines réels et sans sandbox. Les attributs du cookie ne sont pas intrinsèquement invalides ; le suffixe `.test` et le sandbox seul n'expliquent pas cet échec.

La matrice WebKit est **en échec**, pas ignorée ni présentée comme réussie. Elle ne permet pas d'isoler la contribution exacte du port Windows, de son implémentation du partitionnement et de ses protections de confidentialité. [WebKit fourni par Playwright](https://playwright.dev/docs/browsers) n'est pas Safari sur appareil Apple. Les protections de cookie restent inchangées : `__Host-`, Secure, HttpOnly, Path=/, SameSite=None, Partitioned, sans Domain.

Les nouveaux tests HTTPS utilisent un proxy fermé : tous les hôtes autorisés pointent vers la boucle locale, y compris après redirection. Les autres connexions sont refusées. Les premiers tests interceptés pouvaient laisser passer une redirection vers un hôte fictif distant, qui répondait 404 ; ces résultats ne suffisaient pas à prouver l'absence de réseau extérieur. Aucun jeu réel, secret ou changement de données distant n'était impliqué. Les preuves finales utilisent le proxy fermé.

## Diagnostic sur le domaine réel, avant activation

La page `/diagnostics/game-storage` propose un test explicite au clic, même avec le flag à `0`. Elle charge deux fois `diagnostics.chibaskogames-play.fr`, avec la même politique iframe et les mêmes attributs de cookie que les jeux. Elle vérifie la transmission et la conservation du cookie, localStorage et IndexedDB entre ces chargements.

Cet hôte est servi par le Gateway existant, couvert par le wildcard existant. Il ne sert aucun fichier de jeu, n'accorde aucune session et ne lit ni SQL ni R2. Les données de test sont propres à cette origine ; aucune sauvegarde de jeu n'est accessible. Le résultat reste dans le navigateur. Le test supprime ses données après lecture ; une interruption peut laisser ses seules données locales et un cookie expirant après 24 heures. Aucun polling, Worker ou cron supplémentaire.

Après déploiement autorisé, exécuter ce test dans Safari macOS et iOS, Chrome et Firefox, en navigation normale puis privée. Noter appareil, version, réglages, les quatre résultats et les en-têtes HTTP, sans copier la valeur du cookie. Ce test ne remplace pas une session de jeu réelle autorisée. Si Safari réel refuse le cookie, **ne pas activer globalement**.

Une alternative éventuelle serait un lecteur parent de confiance sur le site de contenu, avec une origine distincte de chaque jeu. Elle nécessiterait de qualifier navigation, authentification, lifecycle et autorisations. Elle n'est pas implémentée ici. Ni fenêtre préalable destinée à contourner les protections, ni transfert des jeux sur l'origine du portail ne sont proposés.

## Versions et sessions

Le test `test:stable-versions-browser-db` emploie le véritable Gateway, le service de lancement et PostgreSQL jetable. Avant correction, une ressource d'un document révoqué de version A recevait le fichier de version B : HTTP 200 au lieu de 403.

Les chemins publics sont maintenant fixés à `/__chibasko_build__/<UUID-version>/<chemin>`. Le Gateway vérifie pour chaque requête une session valide du même jeu **et de cette version**. Le préfixe n'est jamais une autorisation. Les chemins relatifs et les imports de modules restent dans cette version. Un chemin absolu du même hôte est redirigé uniquement lorsqu'un Referer du même hôte porte la version ; sans ce contexte il est refusé. Les builds supprimant le Referer doivent utiliser des chemins relatifs ou déjà préfixés. Aucun HTML ou script du développeur n'est réécrit.

La migration additive `20261110000600_versioned_public_delivery.sql` ajoute deux RPC et un index, conserve les anciennes signatures, les historiques et les sessions. Un cookie peut desservir plusieurs sessions du même jeu, mais les permissions sont contrôlées par version. A et B fonctionnent simultanément ; révoquer A n'ouvre pas B à son document. Les réponses sont `no-store`. Le Referer des ressources reste limité à la même origine.

Chrome et Firefox passent le scénario avec PostgreSQL : publication B pendant A, fichiers séparés, imports imbriqués, révocation A, ticket consommé refusé, retour à A et persistance du stockage. Les sauvegardes restent communes aux versions d'un même jeu ; le développeur reste responsable de leur format et de sa compatibilité lors des mises à jour.

## HTML5 : limites conservées

Les chemins de répertoire sont résolus sans traversée ; le bouton plein écran du lecteur reste la solution standard. Les modes classic et sdk sont distincts : classic n'attend pas le bridge, sdk conserve son initialisation sécurisée. Les prévisualisations privées et les anciens liens restent sur leur parcours sécurisé existant.

La navigation native vers un autre document reste surveillée et peut produire `unexpected_navigation`. L'ouverture générique de pages légales et le téléchargement initié par le contenu ne sont **pas qualifiés comme terminés**. Aucune permission générale de pop-up, de navigation supérieure ou de téléchargement n'est ajoutée. Un éventuel mécanisme contrôlé par le parent devra être implémenté et testé séparément ; ne pas promettre ces fonctionnalités aux jeux classiques sans adaptation.

## Cloudflare : prérequis à confirmer

Les lectures publiques précédentes ont observé une résolution wildcard vers Cloudflare, un certificat TLS 1.3 valide couvrant l'apex et `*.chibaskogames-play.fr` (expiration observée : 16 janvier 2027), et un refus HTTP compatible avec le Gateway sur un hôte fictif. Cela ne prouve pas l'attachement exact de la route dans le compte.

Contrôler dans le tableau de bord, sans remplacer un réglage fonctionnel :

1. Zone `chibaskogames-play.fr` : active, configuration complète.
2. DNS → Records : wildcard `*`, proxy activé. S'il manque, pour une route Workers sans origine, Cloudflare documente notamment un AAAA `*` vers `100::`, TTL automatique, proxifié. Ne le créer qu'après vérification et autorisation.
3. SSL/TLS → Edge Certificates : Universal SSL actif couvrant `*.chibaskogames-play.fr`. Les hôtes sont tous de premier niveau ; aucun certificat payant n'est requis par ce schéma si cette couverture existe.
4. Workers & Pages → `chibasko-game-artifact-gateway` → Settings → Domains & Routes : route `*.chibaskogames-play.fr/*` sur cette zone, sans Worker concurrent. Le Wrangler du dépôt contient déjà cette route.
5. Vérifier le binding `ARTIFACTS` vers le bucket prévu, les secrets requis par leurs noms uniquement, l'absence d'accès public au bucket de builds et de règle de cache remplaçant `no-store` ou Set-Cookie. Ne pas changer les buckets publics d'assets du portail.

Références : [routes Workers](https://developers.cloudflare.com/workers/configuration/routing/routes/), [DNS sans origine](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/), [Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/enable-universal-ssl/).

### Charge et coûts

Pour un lancement, F ressources servies et A redirections de chemins absolus, le parcours mesuré implique approximativement F+3+A requêtes Gateway, 2F+8+2A appels RPC et 2F+1+A lectures R2, hors portail, renouvellements et autres usages. Avec F=50, A=10 et 1 000 lancements/jour : environ 63 000 requêtes Gateway, 128 000 RPC et 111 000 lectures R2 par jour.

[Workers Free](https://developers.cloudflare.com/workers/platform/limits/) limite les requêtes à 100 000/jour par compte et le CPU à 10 ms par invocation. [R2 Standard](https://developers.cloudflare.com/r2/pricing/) inclut 10 Go-mois, 1 million d'opérations A et 10 millions B par mois ; des dépassements peuvent être facturés si la facturation est active. [Supabase Free](https://supabase.com/pricing) annonce des requêtes API illimitées, mais une base de 500 Mo, des ressources partagées et un quota de sortie : ce n'est pas une capacité illimitée. Les lectures multiples par asset justifient de surveiller la charge réelle avant croissance. Aucun achat ou nouvelle infrastructure n'a été réalisé.

## Ordre de production — uniquement après autorisation

1. Exécuter en lecture seule `scripts/sql/build-integrations-preflight.sql` et `scripts/sql/public-game-origins-preflight.sql`. Obtenir aussi le snapshot complet pour le comparateur de schéma. Les résultats partiels transmis ne suffisent pas à déclarer 003/004 appliquées. Vérifier fonctions, RLS, privilèges de table et colonne, ACL PUBLIC/anon/authenticated, EXECUTE service_role, index et historique des migrations.
2. Appliquer **uniquement les migrations manquantes**, dans cet ordre : `20261110000300_build_integrations.sql`, `20261110000400_public_game_origins.sql`, `20261110000500_public_delivery_sessions.sql`, `20261110000600_versioned_public_delivery.sql`. Méthode retenue : éditeur SQL Supabase, après préflight et accord ; ne pas lancer parallèlement un db push ou une seconde méthode. Refaire les contrôles ; les fonctions de livraison ne sont pas destinées au navigateur.
3. Confirmer les prérequis DNS/TLS/routage et les bindings. Conserver le flag portail à `0`.
4. Déployer le Gateway entièrement, avant le portail. Ne pas faire coexister plusieurs versions du Gateway pendant l'activation.

```bash
npx wrangler deploy --config cloudflare/wrangler.artifacts.production.jsonc --dry-run --outdir .distribution/gateway-preflight
npx wrangler deploy --config cloudflare/wrangler.artifacts.production.jsonc
```

5. Déployer le portail, flag toujours `0`, depuis Linux propre :

```bash
npm run deploy:cloudflare
```

Cette commande effectue déjà build, vérification Worker et déploiement OpenNext. Ne pas ajouter une seconde commande Wrangler de déploiement du portail. Vérifier qu'aucun build automatique Cloudflare lié à Git ne déploie simultanément.

6. Tester `/diagnostics/game-storage` sur les appareils réels ; vérifier anciens jeux, classic/sdk, prévisualisation privée et refus des accès sans session. Aucun jeu de production n'a été lancé pour le présent audit. Qualifier les parcours signés sur des ressources de test explicitement autorisées avant activation générale ; le diagnostic de stockage seul ne les prouve pas.
7. Seulement après validation et accord explicite, passer uniquement `GAME_STABLE_ORIGINS_ENABLED` à `1` dans le Wrangler du portail, puis redéployer le portail avec la même commande. C'est une activation générale pour les nouveaux lancements publiés, sans liste de qualification cachée.
8. Vérifier cookies, conservation après nouveau lancement, deux lecteurs, deux versions, révocation et jeux privés. Contrôler les erreurs et quotas sans journaliser les tickets/cookies. Ne pas utiliser One more day comme fixture.

### Retour arrière

Remettre le flag portail à `0` puis redéployer uniquement le portail par la même procédure. Conserver le Gateway compatible, les migrations, fichiers et sessions existants ; aucune suppression SQL ou R2. Les nouveaux lancements reprennent l'ancien parcours, tandis que les sessions déjà ouvertes peuvent se terminer. Le stockage d'une origine stable n'est ni supprimé ni automatiquement transféré vers une origine éphémère : prévenir les joueurs de cette limite.

## Validation locale et verdict

Les journaux locaux sont dans `.distribution/`, hors Git. Les tests couvrent SQL/RLS/permissions, Gateway, Chrome/Firefox, concurrence, isolation entre jeux, tickets, cookies invalides et sessions révoquées. La nouvelle page de diagnostic passe dans Chrome, Firefox et WebKit ; dans ce dernier, elle **rapporte correctement l'indisponibilité du cookie**, ce qui ne valide pas le lecteur WebKit.

Les migrations ont été testées uniquement sur PostgreSQL jetable. Le build Next.js/OpenNext et les dry-runs sont locaux. Les certificats auto-signés des fixtures ne servent pas de preuve TLS de production.

| Validation | Résultat |
| --- | --- |
| Suite applicative `npm test` | 409 réussis, 0 échec, 0 ignoré |
| Gateway et artefacts `test:game-artifacts` | 21 réussis, dont workerd et stockage R2 local |
| Suite navigateur lecteur | 97 réussis, 0 ignoré, Chrome avec HTTPS local fermé |
| PostgreSQL complet et dérive de schéma | 42 migrations, contrôles réussis sur base jetable |
| Publication pendant une session active | Chrome et Firefox réussis, véritable Gateway et PostgreSQL |
| Matrice de cookies | Chrome et Firefox réussis ; WebKit en échec explicite |
| Diagnostic de stockage | Chrome, Firefox et WebKit réussis ; WebKit signale cookie indisponible |
| TypeScript | Réussi |
| ESLint | 0 erreur ; 3 avertissements préexistants, Navbar, UserDropdown et fixture multijoueur |
| Next.js/OpenNext Linux, dry-run portail, démarrage Worker | Réussis ; route de diagnostic vérifiée sans lecture Supabase |
| Dry-run Gateway | Réussi, sans déploiement |
| `git diff --check` | Réussi |

Les suites se recouvrent : ne pas additionner leurs nombres comme autant de scénarios indépendants. Les essais initialement bloqués par le bac à sable Windows ont été relancés hors bac à sable avec autorisation ; leurs échecs de lancement ou de boucle locale ne sont pas comptés comme des réussites.

### Principaux fichiers concernés

- Livraison : `lib/game-distribution/gateway/public-origin.ts`, `gateway.ts`, `http.ts` et nouvelle migration 006.
- Diagnostic : `lib/game-distribution/gateway/storage-probe.ts`, `components/game-runtime/StorageDiagnostic.tsx`, `app/diagnostics/game-storage/page.tsx`.
- Qualification : `tests/helpers/local-https.mjs`, `tests/cookie-transport.browser.test.mjs`, `tests/public-version-browser-db.mjs`, `tests/public-origins-db.mjs`, `tests/public-origins.test.mjs`, `tests/public-origins.worker.test.mjs`, `tests/storage-diagnostic.browser.test.mjs`, ses fixtures et `tests/cloudflare-runtime.test.mjs`.
- Outillage : `scripts/prepare-browser-https.mjs`, préflight SQL des origines publiques, contrat de schéma, inventaire des migrations, commandes npm et runner PostgreSQL.
- Documentation : présent rapport, `html5-player-gateway.md`, `stable-origins-production.md`, section des chemins dans `game-distribution.md`.

Les modifications préexistantes concernant classic/sdk, la revue et ses diagnostics sont conservées ; cette liste n'attribue pas leur création à la présente finalisation. La migration 006 est la nouvelle dépendance SQL de cette correction ; 003/004/005 restent inchangées.

**B : ne pas activer maintenant.** Restent indispensables : état complet des migrations en production, contrôle administratif Cloudflare, tests Safari Apple et cookies dans le contexte réel, puis parcours de lancement signé sur ressources de test autorisées. Les limites HTML5 ci-dessus restent explicites. Aucune modification distante, validation One more day, activation, publication, commit ou push n'a été effectué.
