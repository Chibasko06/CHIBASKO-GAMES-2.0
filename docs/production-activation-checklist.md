# Checklist d'activation production

Procédure à exécuter lors d'une phase d'activation distincte. **Toutes les cases
restent ouvertes dans PREP.** Un contrôle local ne coche pas une ressource distante.
La [matrice GO-LIVE-GATES-1](production-go-gates.md) ajoute les preuves récentes
(UUID, audit runtime, maintenance). Le lot contient désormais une migration 9 de
cleanup après les huit migrations initiales ; aucune n'est appliquée à distance ici.
Le [runbook](production-activation.md) décrit les paramètres et arrêts obligatoires.

Journal à conserver hors secrets : release SHA, lockfile SHA, images/digests,
date, environnement, résultats de contrôles, gameId/versionId/deploymentId/credentialId,
déploiement portail précédent et décision GO/NO-GO. Jamais capability hostname,
ticket, cookie, credential, JWT, URL signée ou capture réseau brute.

## Ordre de passage de bout en bout

1. [ ] **Geler la release candidate** sans la promouvoir. Inventorier les SHA du lot
   (`node scripts/production-preflight.mjs`), des dépôts, du lockfile et des images.
   Confirmer SDK npm 0.3.0 et absence de package gameplay/Git privé dans le portail.
2. [ ] **Lever les gates de conception/exploitation** : domaine dédié/PRIVATE PSL
   accepté et propagé, versions navigateur supportées, canal parallèle sans auto-push
   production, recette Docker, monitoring et scheduler cleanup. Si une gate manque,
   arrêter ; aucune activation partielle du catalogue.
3. [ ] **Traiter le rapport npm** : audit frais, correctifs ou preuve de non-accessibilité
   de chaque high sur l'artefact final. Pas de `audit fix --force` ni downgrade Next aveugle.
4. [ ] **Répéter en staging** le même ordre, ressources séparées : Supabase, R2, Queue/DLQ,
   Workers, contenu et serveur. Évaluer backup/restore et rollback avant production.
5. [ ] **Identifier la production et sauvegarder** : projet DB, rôles, policies,
   définitions, ledger, données et restauration testée ; capturer l'état du catalogue
   Pong et du précédent déploiement. Les secrets restent dans le secret manager.
6. [ ] **Préflight DB read-only** : `psql -X -v ON_ERROR_STOP=1 -f docs/sql/production-preflight.sql`.
   Comparer objets/signatures/grants/checks au lot ; résoudre tout drift avant DDL.
7. [ ] **Appliquer le suffixe manquant des migrations**, une par une dans cet ordre :
   versions → uploads → previews → launches → renewals → online → lobbies → projection/roster → maintenance.
   Stop immédiat sur erreur ; pas de reset ni push historique global. Refaire l'inventaire,
   vérifier RLS/table+colonne/RPC/trigger/FK/index et cache PostgREST.
8. [ ] **Récupérer PONG_GAME_ID** par la requête du runbook ; exactement une ligne officielle.
   Vérifier absence de `gameId/0.3.0` existante ou reprendre son workflow immuable.
   Aucun UUID fixture, aucun nouveau jeu catalogue créé pour contourner un problème.
9. [ ] **Préparer R2 privé** : staging/final séparés, média existant inchangé, public access
   fermé, S3 permissions minimales, CORS multipart exact, cleanup multipart et DB-aware.
   Ne pas expirer automatiquement les versions ou jobs encore en attente.
10. [ ] **Préparer Queue/DLQ** : producer `BUILD_VALIDATIONS`, HTTP pull, visibilité 2 h,
    retry 60 s, 5 redeliveries configurées/testées, alerte DLQ/âge backlog. Contrôler le
    contrat réel pull/ack, séparé des 3 tentatives DB.
11. [ ] **Déployer le validateur isolé**, puis réactiver le cron minute du dispatcher.
    Le dispatcher reste volontairement désactivé pendant la validation manuelle des builds.
    Node 24, child sans
    secrets, scratch/quota, egress, kill/timeout/retry, privilèges minimum. Vérifier une
    fixture en staging, conditional write, hash, duplicate delivery et cleanup.
12. [ ] **Préparer le domaine et gateway** : domaine exclusivement contenu, PSL effective,
    wildcard DNS/TLS/route, binding `ARTIFACTS`, DB et portal origins, aucun logging de
    hostname capability. Tester TLS wildcard réel, MIME, HEAD/Range, staging/archive
    interdits, preview privée et service worker refusé. Le flag Gateway production est préparé à 1, sans déploiement effectué.
13. [ ] **Préparer le portail parallèle** depuis la release finale, sans trafic joueur,
    config/bindings/secrets propres à son origine ; catalogue Pong masqué, flags à 0.
    Ne pas déployer le fichier Wrangler canonique sur une cible dite preview par erreur.
    Vérifier homepage/auth/médias et présence des nouvelles routes sans les ouvrir.
14. [ ] **Activer les services pour recette** : gateway 1, puis uploads 1 après Queue/validator,
    puis launches 1 après API/DB/origines. Preview top-level flag facultatif. Vérifier
    les valeurs via préflight par composant sans les imprimer ; ne pas ouvrir le catalogue.
15. [ ] **Construire le vrai Pong 0.3.0** : npm ci, build:web, validate:web, pack:web avec
    PONG_GAME_ID officiel. Inspecter ZIP racine, manifest, notices, aucun secret/source map
    ou code serveur, hash conservé. Ne jamais uploader le résultat build:web:fixture.
16. [ ] **Uploader via l'API finale** avec compte autorisé : session idempotente, parts PUT
    R2, finalize, outbox/Queue/validation, completed → DRAFT. Vérifier hashes/tailles,
    inventory et versionId ; arrêter sur conflit/validation_error, pas d'insertion manuelle.
17. [ ] **Enregistrer le deployment disabled** du serveur Pong, lié au gameId/versionId exact,
    mode réel self_hosted, endpoint HTTPS public. Provisionner credential hashée, secret
    one-time injecté uniquement serveur, expiration/rotation planifiées.
18. [ ] **Recette Linux/Docker du serveur** : image immuable/non-root, port interne, proxy TLS/WSS,
    health, redémarrage, arrêt gracieux, logs expurgés, CPU/RAM/disque et routage unique.
    Pas de replicas sans routage sticky. Aucune case Docker cochée sur la seule base Windows.
19. [ ] **Activer le deployment pour preview contrôlée** (pas de trafic catalogue), configurer
    delivery policy web-v1/connect HTTPS+WSS ; préparer roster backend de comptes de recette.
    Vérifier exchange/admission et réponses invalides/replay/rate-limit. Disabled doit refuser
    l'exchange ; ne pas attendre un exchange réussi avant cette activation contrôlée.
20. [ ] **Preview DRAFT dans le même GameRuntime** : harness admin authentifié prêt,
    local puis online, START v2/ticket frais, 2 comptes, mobile/touch/resize, stop/leave,
    lazy asset 45 min/renewal, isolation origines/stockage, service worker/top navigation bloqués.
    La preview top-level seule ne valide pas le SDK Bridge.
21. [ ] **Review puis approval** : DRAFT → in_review → approved, preuves de recette liées
    à la version immuable, aucune modification de manifest/objet. Échec = rester non publiée.
    Fermer les sessions de preview avant publication, qui invalide leur autorisation.
22. [ ] **Publier et sélectionner atomiquement** : lock jeu puis version, statut approved
    attendu, UPDATE 1 published + `set_active_game_version` même jeu. Catalogue encore masqué.
    Vérifier contenu final, deployment compatible actif, aucune FK/policy contournée.
23. [ ] **Configurer la policy multiplayer** : manual retenu pour première recette, capabilities
    2/2 et public/private fournies par manifest ; scheduler partagé lobby puis online,
    observabilité et alertes opérationnelles. Aucun ticket généré avant runtime START.
24. [ ] **Autoriser le push/promotion portail seulement maintenant** : DB, R2, Queue, validator,
    gateway/domaine, serveur, version published, pointeur, env et bindings vérifiés.
    Le nouveau chemin doit être utilisable sans ancien code gameplay ni accès Git privé.
25. [ ] **Promouvoir la release sur l'origine canonique**, contrôler l'URL API utilisée par
    Pong et le CSP frame-ancestors/connect, tester disponibilité/auth/refus attendus.
    Garder le catalogue masqué jusqu'à réussite de ces sondes et du contrôle de rollback.
26. [ ] **Ouvrir le catalogue et faire le smoke test** ci-dessous avec deux comptes dédiés.
    Un lobby/lancement published positif nécessite cette ouverture contrôlée ; il
    n'est pas validable pendant le masquage du jeu. Le flow complet est déjà éprouvé
    en staging avant cette fenêtre.
    Sur erreur bloquante : masquer/fermer explicitement, conserver artefacts et schéma,
    appliquer le rollback documenté, pas de fallback caché.
27. [ ] **Observer la fenêtre de stabilisation** : upload/gateway/renew/exchange/lobby/Pong,
    résultats/replay, backlog et cleanup ; vérifier rotation/expiration et sauvegardes.
    Consigner GO final et écarts restant non bloquants, sans données d'auth.

## Smoke tests sur l'origine canonique

| Contrôle | Résultat attendu | Preuve expurgée |
| --- | --- | --- |
| Homepage/catalogue/fiche | Pages et médias OK ; modes issus de la version active exacte | Status, versionId |
| Auth | Connexion/déconnexion/reset opérationnels ; pas d'identité Auth dans le jeu | Succès/échec par code |
| Local anonyme | Chargement iframe, Bridge prêt, START, 2 joueurs, score/résultat/replay | Résultat, formats écran |
| Public, compte A | Lobby waiting discoverable, version épinglée, pas de code privé exposé par directory | LobbyId |
| Compte B/refresh | Join durable ; refresh restaure membership, pas de slot fantôme | Effectif/status |
| Ready/START | Unique online session, roster opaque distinct, deployment exact | SessionId/deploymentId |
| Ticket/admission | Ticket frais seulement START, HTTPS body, échange unique + retry borné ; aucun JWT | Codes/statuts, pas ticket |
| Partie | WebSocket TLS, déplacements/collisions/countdown/point pause, premier à 5 | Score final |
| Results/replay | Session fermée, même lobby, nouvelle session et nouveaux tickets | Deux sessionId distincts |
| Privé | Code normalisé, lookup/join 2 comptes, non visible public, rate limit | Statuts sans code partagé |
| Leave/forfait | Départ avant/après début conforme, owner transfer, roster non usurpable | Lifecycle |
| Mobile | 390×844, 768×1024, 844×390, desktop ; touch et sortie hors iframe | Dimensions, captures expurgées |
| Longue session | Lease renouvelée, assets lazy accessibles après 45 min ; preview aussi | Horodatages et HTTP codes |
| Révocation | Credentials/session/participant/launch révoqués refusent nouvelles admissions | Codes attendus |
| Isolation | Mauvais origin/source/génération refusés ; cookies parent/stockage partagés/SW/top navigation bloqués | Assertions navigateur |
| Opérations | Health, crash/restart, cleanup partagé, DLQ/alertes, aucune fuite logs | Alertes et restauration |

## Rollback de première version

- [ ] Bloquer nouvelles parties et annoncer l'interruption si masque catalogue/revocation
  nécessaire ; ces actions peuvent aussi invalider les renouvellements des parties en cours.
- [ ] Fermer les sessions/lobbies concernés par opérations backend contrôlées, conserver historique.
- [ ] Après drainage/arrêt, retirer le pointeur via `set_active_game_version(gameId,NULL)`.
  Il n'existe aucune version artifact précédente à restaurer pour ce premier passage.
- [ ] Conserver DB/R2, corriger par nouvelle version/migration ; pas de drop/delete global.
- [ ] Rollback portail antérieur seulement si artefact immuable, configuration ET backend
  historique existent encore et sont sûrs. Sinon laisser le portail courant avec Pong indisponible.
- [ ] Si fuite d'un published public, archiver après retrait du pointeur et évaluer purge cache ;
  les copies déjà téléchargées ne peuvent pas être rappelées.
- [ ] Garder gateway/renew/exchange nécessaires aux sessions drainées ; aucun flag global
  coupé par réflexe sans évaluer son impact. Documenter l'état final et les limites.
