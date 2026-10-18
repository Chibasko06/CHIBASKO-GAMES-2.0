# Validation locale de la préparation d'activation

Relevé du 18 octobre 2026. Aucun contrôle distant Supabase/Cloudflare, aucune
création de ressource, credential, DNS, migration, upload ou promotion effectués.

| Contrôle | Résultat |
| --- | --- |
| Préflight local dépendances + migrations | PASS, 8 migrations transactionnelles ordonnées et SHA-256 relevés |
| Tests du préflight | PASS, 4 tests : inventaire, environnement absent/secret non exposé, PRIVATE PSL/séparation des sites, buckets/identifiants |
| Préflight avec environnement gateway absent | Refus attendu ; noms manquants retournés, aucune valeur affichée ; remoteReadiness/bindingReadiness not_checked |
| PostgreSQL 18 jetable | PASS, lot complet + préflight SQL READ ONLY, RLS/FK/guards, droits, version immutable, leases, races ticket/join/start, rotation/révocation, replay, deux instances, 128 participants |
| Template de publication du runbook | PASS sur PostgreSQL jetable : mauvaise version refusée avec rollback/code 3, publication/pointeur atomiques, seconde publication refusée ; aucune donnée distante |
| Chrome + PostgreSQL jetable | PASS, API/UI public/private, join, refresh, START, résultats et replay génériques |
| npm test plateforme | PASS, distribution, storage/validation isolée, gateway, runtime, online, lobby, catalogue, sécurité/admin |
| Chrome runtime | PASS, 16 tests ; isolation, fausses origines/messages, retry/génération, responsive, chargement long et lazy assets à 45 min en preview/published |
| TypeScript et lint ciblé | PASS, tsc --noEmit et ESLint sur les trois fichiers exécutables modifiés/ajoutés |
| Build distribution | PASS, bundles validator main/child, dispatcher et gateway produits par les tests |
| Build Next | PASS dans une copie de validation sans .env et avec Git désactivé, après nettoyage du cache .next |
| Build Cloudflare/OpenNext | PASS dans cette même copie, SDK npm 0.3.0, aucun package gameplay ni accès Git privé, fallbacks .env privés retirés |
| Pong fixture | PASS, build/validate/pack avec --fixture, 9 fichiers, 430 331 octets, ZIP 140 107 octets ; aucune source Pong modifiée |
| Audit npm complet | 17 alertes : 12 high, 4 moderate, 1 low ; rapport dédié, aucune mise à jour de dépendance |
| Audit npm --omit=dev | 5 alertes : 1 high et 4 moderate ; exposition à lever avant GO |
| Docker/Linux | NON EXÉCUTÉ : Docker indisponible sur ce poste ; checklist obligatoire avant activation |
| Diff, secrets, rédaction et liens | PASS sur les fichiers ajoutés/modifiés ; aucun motif de credential, lien local manquant, formulation méta ou espace final détecté ; diff --check des trois dépôts sans erreur |

Le premier build Next sous sandbox a échoué lors du lancement du sous-processus
CSS Turbopack ; le cache généré a été retiré dans la copie isolée. Le build propre
autorisé hors sandbox, puis le build OpenNext, ont réussi sans changement de source.
PostgreSQL initdb et Miniflare nécessitent aussi l'exécution locale hors sandbox
pour leurs fichiers temporaires/sockets. Leurs recettes réussies restent locales.

OpenNext signale la compatibilité Windows partielle et le middleware Node
expérimental sur Cloudflare. La recette du déploiement parallèle/staging doit
vérifier auth/middleware et runtime sur l'infrastructure cible ; le succès d'un
build local ne constitue pas cette validation.

ZIP fixture uniquement : SHA-256
`55d834be8bb63d3b1cae65d6975b912269aa8963c8eb6b617f64a80c0455e0a6`.
Ce fichier n'est pas un artefact production et n'a pas été uploadé. Le build réel
0.3.0 attend encore PONG_GAME_ID officiel.

Les fichiers runtime applicatifs, migrations existantes, dépendances et références
SDK/Pong restent inchangés. Les ajouts sont le runbook, les inventaires/checklists,
le préflight read-only et ses tests. L'application de production n'a pas été interrogée.
Le [runbook](production-activation.md) et sa [checklist](production-activation-checklist.md)
restent la source des gates d'activation ; aucun succès local ne les coche à distance.
