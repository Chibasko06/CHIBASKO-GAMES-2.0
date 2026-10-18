# Audit npm avant activation

Relevé historique PRODUCTION-ACTIVATION-1 PREP, avant corrections.
Le [relevé GO-LIVE-GATES-1](production-go-gates.md) le complète : runtime à zéro
alerte après source-map-js/mapping/Resend, 12 alertes dev restantes. Les versions
et gates ci-dessous décrivent le point de départ, pas l'état corrigé courant.

Relevé du 18 octobre 2026, `npm audit --json --registry=https://registry.npmjs.org`.

**17 paquets signalés : 12 high, 4 moderate, 1 low, 0 critical.** Les alertes héritées ne sont pas 17 vulnérabilités indépendantes. Aucune dépendance ni lockfile modifié dans PREP. Aucun `npm audit fix --force` exécuté.

Le second relevé `npm audit --omit=dev --json` confirme **5 alertes dans le graphe
de production : 1 high (`source-map-js`) et 4 moderate (`baseline-browser-mapping`,
`resend`, `svix`, `uuid`)**. Les trois dernières partagent la même chaîne héritée.
Le lockfile contient un autre `sharp` 0.35.5 pour Next, hors plage signalée ;
l'instance vulnérable 0.35.4 est uniquement celle de Miniflare. La présence dans
un graphe npm ne prouve pas à elle seule l'exposition dans un Worker déployé.

Le classement prod/dev vient du lockfile courant, pas de la seule sévérité npm. Les chemins ci-dessous décrivent les appels identifiés dans les sources ; ce n’est ni un test d’exploitation ni une preuve exhaustive d’absence de code dans le bundle Cloudflare.

**Gate sécurité : NO-GO tant que chaque high susceptible d’atteindre une entrée non fiable en production n’est pas corrigé ou couvert par une preuve de non-accessibilité sur l’artefact final.** `source-map-js` reste à lever explicitement ; `sharp` vulnérable ne doit pas être exposé via un service Miniflare de recette. Aucun high exploitable n’est déclaré acceptable par défaut.

| Paquet / version installée | Sévérité / direct | Chaîne et exposition | Correctif / risque |
| --- | --- | --- | --- |
| `@babel/core` 7.29.0 | low / non | ESLint/hooks, build/dev. Lecture source-map sur entrée de compilation malveillante ; aucun build de source jeu dans le portail. | Mise à jour transitive compatible proposée par npm ; tester lint/build. |
| `@next/eslint-plugin-next` 16.3.8 | high / non | ESLint, dev transitif. Propagation de fast-glob/micromatch/braces ; motifs du lint local, pas de route publique identifiée. | npm propose un downgrade major de eslint-config-next vers 14.2.35 : rejeté ; attendre correctif compatible ou évaluer une substitution testée. |
| `baseline-browser-mapping` 2.10.20 | moderate / non | Next/browserslist, présent graphe prod. Arrêt sur entrée invalide ; configuration navigateur de build contrôlée, pas de saisie distante identifiée. | >=2.11.0 ; mise à jour transitive et recette Next/Cloudflare. |
| `brace-expansion` 1.1.14, 5.0.5 | high / non | minimatch/TypeScript-ESLint/outils build, dev. Expansion CPU/mémoire/recursion sur motifs malveillants ; pas de motifs fournis par un jeu à ces outils. | Branches correctives >=1.1.21 et >=5.0.12 selon instance ; vérifier toutes les résolutions. |
| `braces` 3.0.3 | high / non | micromatch → fast-glob → ESLint, dev. DoS récursif ; chemin lint, non exposé au trafic runtime identifié. | Pas de version sûre proposée dans cette chaîne ; ne pas accepter le downgrade Next 14 automatique. |
| `browserslist` 4.28.2 | high / non | Babel, dev. Cache non borné/stats non fiables ; entrées build contrôlées, pas un parser de builds uploadés. | Mise à jour compatible hors plage <=4.28.6 ; tests build. |
| `eslint-config-next` 16.3.8 | high / oui | Direct dev. Alerte agrégée du plugin/glob ; pas une nouvelle faille indépendante. | Maintenir cohérence Next 16 ; pas de audit fix --force vers 14.2.35. |
| `fast-glob` 3.3.1 | high / non | ESLint transitif dev. Alerte héritée de micromatch/braces ; ne sert pas les requêtes joueur. | Correctif amont compatible à vérifier ; proposition major npm non retenue. |
| `js-yaml` 4.1.1 | high / non | @eslint/eslintrc, dev. DoS parseur YAML sur aliases/merge ; aucun YAML de jeu parsé par le pipeline statique. | >=4.3.2 dans cette branche ; mise à jour lock transitive et lint. |
| `micromatch` 4.0.8 | high / non | fast-glob → ESLint, dev. Alerte héritée de braces, entrées de lint contrôlées. | Correctif chaîne amont à tester ; pas de downgrade Next automatique. |
| `miniflare` 5.20261006.0-alpha | high / non | Wrangler, dev. Hérite de sharp ; émulateur local, pas Worker déployé. Ne pas exposer les serveurs locaux à des entrées non fiables. | Wrangler 4.151.1 proposé sans major ; recette OpenNext/Miniflare obligatoire. |
| `resend` 6.12.2 | moderate / oui | Direct prod. Chaîne svix/uuid ; mail reset utilisé, mais primitives UUID vulnérables avec buffer externe non identifiées dans les appels du projet. | Mise à jour compatible proposée ; tester envoi/reset et absence de dépendance vulnérable. |
| `sharp` 0.35.4 | high / non | Miniflare transitif dev, instance 0.35.4. Avis librsvg potentiellement RCE Linux sous conditions. Cette instance est celle de Miniflare, pas le sharp Next imbriqué sûr ; ne pas l’exposer en service public. | >=0.35.5 ; mise à jour Wrangler 4.151.1 proposée. Bloque si cette instance traite des images non fiables dans une recette exposée. |
| `source-map-js` 1.2.1 | high / non | PostCSS/Next, graphe prod et outils CSS. DoS event-loop via indexed source maps non fiables. Le portail compile ses propres CSS ; le validateur extrait sans compiler les sources jeu. Absence de chemin public non prouvée pour toute sortie OpenNext. | >=1.2.2 ; traitement requis ou preuve de non-accessibilité sur le bundle final avant GO. |
| `svix` 1.90.0 | moderate / non | Resend transitif prod. Hérite de uuid ; pas de webhook Svix public identifié dans les routes du projet. | Mise à jour transitive compatible proposée ; tester mails et verrouillage. |
| `uuid` 10.0.0 | moderate / non | Svix/Resend transitif prod. Avis sur v3/v5/v6 avec buffer fourni ; pas sur UUID aléatoire crypto du control plane. Aucun buffer externe identifié dans le mail projet. | >=11.1.1 ; changement major de uuid transitif, préférer mise à jour parent compatible puis tests. |
| `wrangler` 4.148.0 | high / oui | Direct dev/build. Hérite de Miniflare/sharp ; CLI de build, jamais serveur production à exposer. | 4.151.1 proposé (sans major), recette complète avant mise à jour de release. |

## Avis et plages exactes

Les références sont les avis primaires fournis par le registre npm. Les plages ci-dessous sont celles du relevé, pas des versions cibles inventées.

- `@babel/core` — plage `<=7.29.0` : [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8).
- `baseline-browser-mapping` — plage `>=2.0.0 <2.11.0` : [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv).
- `brace-expansion` — plage `>=5.0.0 <5.0.6` : [GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2).
- `brace-expansion` — plage `<1.1.16` : [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp).
- `brace-expansion` — plage `>=3.0.0 <5.0.7` : [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp).
- `brace-expansion` — plage `<1.1.17` : [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg).
- `brace-expansion` — plage `>=4.0.0 <5.0.8` : [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg).
- `brace-expansion` — plage `>=4.0.0 <5.0.9` : [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
- `brace-expansion` — plage `<1.1.18` : [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
- `brace-expansion` — plage `<1.1.21` : [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- `brace-expansion` — plage `>=4.0.0 <5.0.12` : [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).
- `brace-expansion` — plage `<1.1.20` : [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7).
- `brace-expansion` — plage `>=4.0.0 <5.0.11` : [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7).
- `brace-expansion` — plage `<1.1.19` : [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).
- `brace-expansion` — plage `>=4.0.0 <5.0.10` : [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).
- `braces` — plage `<=3.0.3` : [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
- `browserslist` — plage `<=4.28.6` : [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx).
- `browserslist` — plage `<=4.28.6` : [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g).
- `js-yaml` — plage `>=4.0.0 <=4.1.1` : [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68).
- `js-yaml` — plage `>=4.0.0 <4.3.0` : [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m).
- `js-yaml` — plage `>=4.0.0 <4.3.1` : [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj).
- `js-yaml` — plage `>=4.0.0 <4.3.2` : [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
- `sharp` — plage `<0.35.5` : [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- `source-map-js` — plage `>=1.0.0 <1.2.2` : [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- `uuid` — plage `<11.1.1` : [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

## Traitement avant activation

1. Relever à nouveau audit complet et `npm audit --omit=dev --json`. Garder les preuves avec le SHA du lockfile et de la release, hors logs de secrets.
2. Corriger dans une phase de maintenance dédiée les versions compatibles proposées (source-map-js, branches brace-expansion, js-yaml, mapping, Resend/Svix, Wrangler). Examiner le diff du lockfile ; aucun ajout d’override sans tests.
3. Pour braces/chaîne ESLint sans solution compatible proposée, documenter l’absence d’entrées externes et maintenir les outils de lint hors du runtime. Ne pas rétrograder Next 16 vers 14 pour faire disparaître un compteur.
4. Inspecter le Worker OpenNext, ses traces et les bundles validator/gateway ; identifier si une bibliothèque signalée reçoit des données de requête, images, CSS/source maps ou archives non fiables. Tester sur l’artefact exact déployable.
5. Relancer unitaires, TypeScript, lint, Next et Cloudflare après tout changement. Une mise à jour dev peut modifier les sorties de build ; ne pas la traiter comme sans effet.
6. Lever chaque gate par correctif ou preuve écrite de non-accessibilité. Une exposition high confirmée bloque la mise en production. Réviser ce rapport si l’audit change.

Les archives de jeux ne sont jamais passées dans Babel, PostCSS, ESLint ou sharp par le validateur : elles sont inspectées/extraites statiquement. Cela réduit les chemins d’attaque concernés sans garantir l’absence d’une vulnérabilité dans ces parseurs ou leurs dépendances.
