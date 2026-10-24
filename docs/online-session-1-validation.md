# Sessions online — contrat et validation

## Contrat

SDK 0.3.0, Bridge v2 et integrationVersion 1 définissent le contexte online.
Le runtime conserve la compatibilité Bridge v1 avec SDK 0.2.0. Le SDK est
distribué séparément du portail.

Le navigateur reçoit le bootstrap uniquement au START après READY. Le control
plane conserve les identités Auth, sélectionne le deployment et vérifie les
participants. Le ticket aléatoire de 256 bits, valable au plus trois minutes,
est uniquement hashé. Le serveur échange le ticket avec sa propre credential,
également hashée, pour obtenir les claims publics de session et de participant.
La réponse retry est stable pendant 30 secondes avec la même credential et la
même clé d'opération ; les autres rejeux sont refusés atomiquement en PostgreSQL.
Le serveur gameplay conserve l'unicité de l'admission et gère son reconnect.

Voir `online-sessions.md` et `sdk-browser-bridge-v2.md` pour les API, ressources,
permissions, limites, erreurs, révocation, nettoyage et transitions.

## Référence de validation du 17 octobre 2026

- SDK : npm ci, build, compilation serveur sans DOM, typecheck et 25 tests
  core/client/server/React/release ; aucun nouveau runtime dependency.
- SDK : 12 tests Chrome 155, ESM et standalone, intégration au bridge réel,
  consommateur tarball extérieur, HTML sans bundler et TypeScript client/serveur.
- Plateforme : 26 tests runtime/compatibilité, 6 tests online et 16 scénarios
  Chrome runtime, dont sessions preview/published et lazy assets à 45 minutes.
- Compatibilité : 4 scénarios Chrome du vrai contrôleur GameRuntime avec son
  client HTTP, le SDK 0.2.0 installé depuis npm et le tarball 0.3.0, en local/online.
  Le scénario online v2 utilise un roster de 128 participants et reçoit le ticket
  uniquement via l'appel START. Toutes les routes HTTPS sont interceptées localement.
- PostgreSQL 18 jetable : migrations distribution/upload/preview/launch/renewal
  et online, RLS, contraintes, roster 128, expiration, rotation, révocation,
  consommation atomique, retry/replay et deux exchanges concurrents.
- Régression distribution : 8 tests build/ZIP/hash/keys, 35 tests upload/gateway
  incluant les sous-tests ZIP dangereux, TypeScript et lint ciblé.
- Build Next Webpack réussi ; bundles validator, dispatcher et Artifact Gateway
  réussis. Le build par défaut Turbopack échoue dans le traitement CSS du package
  Pong legacy, également hors sandbox Windows. Aucune correction Pong associée.
- Les tests de temps virtuel utilisent une base d'horloge backend fixe pour éviter
  une dérive avec le temps mural du runner. Aucune policy de bail n'est relâchée.
- Contrôles de formatage et de credentials réussis sur le périmètre testé.

Archive SDK préparatoire : `chibaskogames-sdk-0.3.0.tgz`, 30 fichiers, 29033 octets.
SHA-256 : `18cac82210d4fc3af2250da16adbe98da97d9700f00d9fb2af0d28ebed6c180c`.
Le tarball contient JS/déclarations, standalone/intégrité, README/CHANGELOG, licence,
FAQ et documentation publique online. Aucun test, source TS ou script interne.

## Prérequis d'exploitation

Le lobby utilise le port backend de préparation de session. Un mode online
nécessite un deployment compatible, une policy réseau approuvée, l’exchange
côté serveur gameplay et le contexte START dans le build client.
Vérifier séparément les migrations et les flags de l’environnement cible.
Les résultats de la référence ci-dessus utilisent uniquement des credentials
et tickets de fixtures ; ils ne certifient pas l’infrastructure distante.
