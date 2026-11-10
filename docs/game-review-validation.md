# Validation de la revue des jeux — 10 novembre 2026

## One more day

L'archive locale originale a été examinée sans exécuter le jeu, avec un processus
Node.js isolé sans accès réseau et un accès en lecture seule au ZIP. Aucun accès
de production n'a été effectué. Son statut n'a pas été modifié.

- Taille : 351 729 246 octets.
- SHA-256 avant et après : `15aed4b84ff4be5c7f9a1105c1afe19ba76a0fbb377a0382879b705743e82baa`.
- Inventaire : 920 entrées ; 352 418 299 octets décompressés annoncés.
- Plus gros fichier : 9 601 402 octets.
- Analyse textuelle bornée : 1 025 489 octets, dont les 83 fichiers HTML/JS.
- Aucun fichier HTML/JS n'a dépassé la borne d'inspection de 8 Mio ; aucun
  conteneur `.gz`, `.br` ou `.wasm` n'a été trouvé.

Le contrôle structurel réel s'arrête sur `FORBIDDEN_ARTIFACT_FILE`, fichier
`_headers`, catégorie `submission`, phase `extract`. Ce résultat est reproduit
par `npm run validate:game`, avec conservation de l'empreinte d'origine.
L'inventaire n'a trouvé aucun autre chemin refusé par les règles actuelles.
Cela ne constitue pas une certification de tous les octets ni du fonctionnement
du jeu : le parseur s'arrête à la première non-conformité.

Le manifeste présente un deuxième défaut indépendant :

```json
{
  "gameId": "53f82dd2-3d69-4116-9794-f2b5412526f4"
}
```

Le véritable validateur de manifeste le refuse avec `INVALID_MANIFEST_SCHEMA`,
champ `/schemaVersion`. Il manque également `integrationVersion`, `version`,
`capabilities` et les entrypoints. Retirer uniquement `_headers` ne suffira pas.
Le développeur doit produire lui-même un nouveau build conforme ; aucune
modification de l'original n'a été réalisée ni proposée comme contournement.

### Détection du SDK

Aucune occurrence de `ChibaskoGames`, `@chibaskogames/sdk`, `connectPlatform`,
`GAME-RUNTIME-1` ou `chibasko` n'a été détectée dans les textes examinés. Le SDK
n'est donc pas détecté statiquement, sa version ne peut pas être établie et aucune
trace d'initialisation n'est démontrée. Cette absence de marqueurs n'est pas un
test d'exécution et ne prouve pas à elle seule une incompatibilité SDK.
Un code transformé ou chargé à distance ne peut pas être exclu par cette analyse.

### Fichier `_headers`

Contenu exact :

```text
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Content-Security-Policy: default-src 'self'; script-src 'self' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' https: data:; media-src 'self' blob: https:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src https:; worker-src 'self' blob:

```

Il s'agit d'une configuration d'en-têtes destinée à un hébergeur, pas d'un script
de jeu. Aucun texte inspecté ne la référence. Elle ne contient pas d'exigence
COOP/COEP. Son utilité pour un autre hébergement ne la rend pas nécessaire au
lecteur Chibasko Games, dont le Gateway fixe ses propres protections. Le fichier
reste interdit ; il n'est ni ignoré ni supprimé automatiquement par le validateur.

## Défaut d'origine et architecture livrée

L'ancien enfant d'extraction quittait sans transmettre son exception. Le parent
réduisait son code de sortie à `validation_failed`. Les corrections locales
précédentes ont été conservées et intégrées : échec structuré expurgé dans
l'enfant, remontée au parent, projection privée et outils avancés en lecture seule.

La nouvelle étape ajoute une conservation atomique du résultat et de son
diagnostic, des événements de début/fin, une lecture CLI sans mutation de
récupération implicite, des reprises explicites et un parcours de correction.
Elle utilise les tables, le processus isolé et les services déjà présents.
La validation reste manuelle et la publication demeure une décision humaine.

L'administration présente le jeu, sa version, le développeur, le résultat et la
prochaine action. Coordonnées, métadonnées et journaux sont repliés. L'historique
permet d'ouvrir les diagnostics des précédentes tentatives. Une panne interne est
distinguée d'une archive non conforme ; demander une correction ne refuse pas le
jeu. Les anciennes propositions, la compatibilité, les tests et la publication
restent accessibles. Les UUID et détails techniques sont secondaires.

Le lecteur permet d'enregistrer un échec de chargement observé par l'administrateur
avec un code borné et une clé idempotente. Ce journal ne change ni la validation
statique ni la décision et n'invente pas une incompatibilité SDK.

Le [guide d'exploitation](game-review-workflow.md) décrit les commandes, les
messages, les corrections et le retour arrière. Les outils SQL/R2 avancés restent
disponibles pour les anciens échecs indéterminés et les incidents exceptionnels.

## Fichiers concernés

Correctifs de diagnostic intégrés et workflow :

- `lib/game-distribution/{build,manifest,paths,zip,review,admin-review-presentation,validation-diagnostics}.ts`.
- `lib/game-distribution/uploads/repository.ts`.
- `services/build-validator/{child,extract,job,review,review-job,review-diagnostics,extraction-diagnostics,read-only-archive}.ts`.
- `scripts/{review-game,review-archive,validate-game,production-preflight}.mjs`.
- `scripts/sql/{build-review-diagnostics,build-review-workflow-preflight}.sql`.
- `lib/server/{adminBuilds,developerDrafts}.ts`.
- `components/admin/{BuildReviews,BuildValidationDiagnostic}.tsx`.
- `components/{DeveloperSubmissions,SubmitGamePageClient}.tsx` et
  `components/game-runtime/GameRuntime.tsx`.
- `supabase/migrations/20261110000200_build_review_workflow.sql`.
- `contracts/production-schema.v1.json` et `package.json`.
- `tests/{extraction-diagnostics,review-archive-readonly,build-review-cli,build-review,review-game-config,game-upload,build-validator-runtime,admin-review-presentation,submission-drafts,production-preflight}.test.mjs`.
- `tests/admin-build-review.browser.test.mjs`, `tests/submission-browser.test.mjs`,
  `tests/build-review-db.sql`, `tests/build-review-workflow-db.mjs` et
  `tests/production-schema-reference.mjs`.
- `docs/{manual-build-review,review-extraction-diagnostics,game-review-workflow,game-review-validation}.md`.

Les six modifications documentaires et de tests préexistantes ont été préservées :
`app/developpeurs/page.tsx`, `docs/game-distribution.md`,
`docs/manual-build-review.md`, `lib/developer-guide.ts`,
`tests/developer-guide.test.mjs`, `tests/submission-browser.test.mjs`.
Les deux fichiers partagés avec le nouveau parcours ont été complétés localement.
Aucune migration historique, configuration de Worker ou version du SDK n'a été
modifiée. Les rapports contenant l'inventaire du jeu restent sous `.distribution`,
ignoré par Git, et ne font pas partie des documents publics.

## Vérifications

| Contrôle | Résultat |
|---|---|
| Suite applicative complète `npm test` | 397 réussis, 0 échec, 0 ignoré |
| `npm run test:review-workflow` | 63 réussis, 0 échec, 0 ignoré |
| Chrome, revue et soumission | 13 réussis, 0 échec, 1 ignoré |
| PostgreSQL 18 jetable, toutes migrations et intégrations | PASS |
| Contrat de schéma et détection de drift | PASS |
| TypeScript | PASS |
| ESLint | 0 erreur ; 3 avertissements préexistants |
| Next.js Webpack | PASS, services distants simulés |
| OpenNext sous Linux, Node 24.22.1 / npm 10.9.2 | PASS |
| Wrangler dry-run et Worker local sous Linux | PASS, aucun accès distant |
| `git diff --check` | PASS |

Les suites se recouvrent : les nombres ne s'additionnent pas en tests distincts.
Le test navigateur ignoré nécessite un ZIP distribué du SDK fourni par
`SDK_TEST_BUILD_ZIP` ; il n'est pas compté comme une réussite. Les tests ont couvert
les vraies routes, le vrai parseur, les droits SQL, les leases périmées ou fausses,
les reprises concurrentes, le rollback si le journal échoue, les corrections
idempotentes, la confidentialité, les quotas, chemins dangereux, fichiers
interdits, manifestes invalides, pannes de parseur/stockage/réseau et nettoyage.

Un test du mode de prévalidation a d'abord comparé deux ZIP régénérés dont les
horodatages différaient ; il a été corrigé pour comparer les deux traitements des
mêmes octets. Un contrôle ESLint a aussi conduit à initialiser le mode du formulaire
depuis les paramètres de navigation, sans mise à jour synchrone dans un effet.

OpenNext sous Windows a échoué sur un fichier `middleware.js.nft.json` manquant.
Cette tentative n'est pas comptée comme réussie ; la qualification complète a été
effectuée dans une copie Linux neuve, sans `.env` ni credentials, avec mock local.
Les images de contrôle mobile/desktop ont été relues et aucun débordement
horizontal n'a été constaté dans les tests.

## Limites et mise en ligne

La migration est additive et n'est pas appliquée à distance. Le nouveau code ne
doit pas être déployé avant elle. Les anciennes RPC restent présentes pour une
transition compatible et un retour au précédent portail. Aucun secret nouveau
n'est nécessaire. Le préflight de lecture seule et l'ordre exact figurent dans le
guide d'exploitation.

Le contrôle local est utilisable depuis le dépôt, mais sa distribution comme outil
public du SDK nécessite une future version qualifiée. La 0.4.2 reste intacte.
Ni la présence du SDK ni un contrôle structurel réussi ne remplacent un test dans
le véritable lecteur. Aucun test de jeu réel ni aucune reprise de One more day
n'a été déclenché pendant cette intervention.

Pour One more day, demander au développeur un manifeste complet et un nouveau ZIP
ne contenant pas la configuration d'hébergement. Tester ensuite l'intégration
dans le lecteur avant toute acceptation administrative. L'archive et le statut
actuels restent inchangés jusqu'à une décision explicite.

**Verdict A pour la livraison locale du workflow.** La mise en production reste
conditionnée à la migration additive, aux contrôles de permissions et à une
qualification contrôlée. Ce verdict ne certifie pas le jeu One more day ni une
fonctionnalité multijoueur non exécutée.
