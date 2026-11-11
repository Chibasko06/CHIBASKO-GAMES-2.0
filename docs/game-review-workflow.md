# Revue des jeux : diagnostic et correction

Le [guide des intégrations HTML5 et SDK](build-integrations.md) distingue le
manifeste de distribution, le SDK facultatif et les observations du lecteur.
Il décrit la migration additive et le déploiement coordonné du Gateway et du
portail nécessaires aux nouveaux modes explicites.

## Parcours courant

1. Ouvrir Administration → Publications de jeux, puis le dossier du build.
2. Copier la commande de vérification et l'exécuter sur le poste de revue
   configuré avec Node.js 24. Le navigateur ne peut pas lancer le processus local.
3. Lire le résultat de la commande, puis actualiser le dossier. Le diagnostic
   présente le motif, le fichier ou champ et la suite recommandée. Aucun accès SQL
   ou téléchargement R2 manuel n'est nécessaire pour les nouvelles tentatives.
4. Si la vérification réussit, lancer le jeu dans le lecteur isolé, compléter la
   revue et enregistrer les contrôles avant toute décision de publication.
5. Si le build doit être corrigé, utiliser **Demander une correction** avec un
   motif précis. Le dossier reste ouvert ; un échec technique ne refuse pas le jeu.

```sh
npm run review:game -- <upload-id>
npm run review:game -- <upload-id> --details
npm run review:game -- <upload-id> --json
```

Une réussite technique renvoie 0 ; une vérification échouée ou interrompue renvoie
1. La commande relit le résultat enregistré, même si la réponse de finalisation a
été interrompue. Elle n'annonce pas de publication.

Exemple d'un fichier interdit :

```text
Échec : fichier interdit
Fichier : _headers
Phase : extract
Cause : Type de fichier interdit
Action : Vérifier l’utilisation de ce fichier et préparer une archive corrigée sans fichier de configuration d’hébergement.
Tentative : 1
```

Les anciens échecs sans diagnostic sont indiqués comme indéterminés. Ils ne sont
pas requalifiés arbitrairement. Le script SQL et l'inspection locale avancée
restent disponibles pour ces incidents historiques.

## Incidents et reprises

Le validateur traite successivement le disque temporaire, le téléchargement,
l'extraction isolée, le checkpoint, les artefacts et la finalisation. Un diagnostic
persisté contient une version de format, le numéro de tentative, la phase, la
catégorie et un motif stable. L'événement conserve sa date et son upload. Le numéro
de tentative forme avec l'UUID d'upload un identifiant de corrélation.

Le diagnostic et l'échec sont enregistrés par une seule RPC transactionnelle,
protégée par la lease. La réussite et son événement utilisent aussi une transaction.
Les phases de démarrage sont journalisées sans doublon. Une panne de PostgreSQL
peut empêcher toute conservation distante : la commande rapporte alors l'incident
et n'annonce pas un résultat durable fictif. Les messages bruts de transport ne
sont jamais conservés comme diagnostics.

Après résolution d'un incident interne ou de stockage, le bouton **Préparer une
nouvelle tentative** remet explicitement le build en attente. Il faut ensuite
exécuter la commande. L'équivalent sur le poste de revue est :

```sh
npm run review:game -- <upload-id> --retry-internal
```

La commande manuelle ne reprogramme pas seule les incidents temporaires. La reprise
ne remet jamais les tentatives à zéro, ne prolonge pas la conservation et ne
modifie pas une décision définitive. Les non-conformités et les anciens échecs
indéterminés ne deviennent pas éligibles à une reprise interne par ce bouton.
Les traitements automatiques existants gardent leur politique bornée, mais leur
activation reste inchangée et le dispatcher n'est pas réactivé.

Une archive expirée, nettoyée ou arrivée au maximum de tentatives nécessite un
nouvel envoi. La base ne peut pas prouver que l'objet R2 existe encore : le GET
conditionnel au moment de la reprise reste l'autorité sur sa disponibilité.

Un test dans le lecteur peut signaler un incident de chargement. L'administrateur
peut l'enregistrer avec **Enregistrer l'incident du test**. Le code transmis est
limité à une liste connue ; la requête est idempotente et journalisée séparément.
Un timeout du lecteur n'est pas une preuve d'incompatibilité SDK. La validation
statique ne certifie ni le gameplay ni le fonctionnement du SDK ; seule la revue
dans le lecteur sécurisé permet de vérifier les interactions réelles.

## Build corrigé et historique

Le développeur ouvre **Mes soumissions → Préparer un build corrigé**. Pour un jeu
non publié qu'il possède, l'opération conserve le gameId, les métadonnées et
l'historique, puis détache uniquement le transport de l'ancien brouillon. Le
formulaire existant produit un nouvel upload et une nouvelle soumission éditoriale
pour le même jeu. L'ancienne archive et les décisions ne sont pas écrasées.

Si aucune game_version n'a été créée, la version corrigée peut garder le même
numéro. Si une version a déjà été validée, choisir une nouvelle version : les
artefacts restent immuables. Pour un jeu publié, utiliser le parcours existant
**Nouvelle version**. Une décision de refus ou d'archivage ne se rouvre pas par la
préparation d'une correction.

La requête de correction doit provenir du propriétaire vérifié ; un autre membre
ne récupère pas son brouillon. Les comptes restreints et les permissions retirées
restent contrôlés par les fonctions existantes. Un nouveau dépôt concurrent
produit un conflit plutôt que de détacher son archive. La demande administrative
nécessite un administrateur vérifié et refuse une validation en cours.

## Confidentialité et coût

Le journal privé existant est réutilisé : aucune table, Queue, tâche planifiée ou
infrastructure supplémentaire. Les diagnostics par tentative font moins de 2 Ko
et le nombre d'essais reste plafonné par la politique de l'upload. Les paths sont
relatifs, bornés et expurgés ; les champs suivent une liste de chemins de schéma.
Pas de pile d'appels, de credentials, de lien signé ni de contenu du jeu dans ces
événements. Les dossiers admin ne sont pas mis en cache publiquement.

La rétention existante du journal n'est pas raccourcie. Les fichiers staging et
artefacts partiels suivent les mécanismes de maintenance déjà installés. La
conservation d'un événement ne promet donc pas la conservation de son ZIP.
Les diagnostics de validation restent privés ; le développeur reçoit l'état et
le motif de correction rédigé par l'administrateur.

## Contrôle avant envoi

Un contrôle local est disponible depuis le dépôt du portail :

```sh
npm ci
npm run validate:game -- chemin/jeu.zip
npm run validate:game -- chemin/jeu.zip --game <gameId> --version 1.0.0
```

Le [guide du validateur public](../tools/public-cli/README.md) décrit la commande
`npx @chibaskogames/cli validate mon-jeu.zip`. Elle sera disponible après
publication du package. Le CLI réutilise le parseur isolé de la revue et la
politique du dépôt. Il ne demande ni SDK, ni compte, ni accès au stockage distant.

Il n'utilise ni compte, ni Supabase, ni R2, ni SDK. Il accepte un ZIP déjà construit
quelle que soit la structure du projet. Le parseur s'exécute sans réseau, sans
processus enfant supplémentaire autorisé et avec accès limité à sa copie
temporaire. Il vérifie chemins, manifeste, entrypoints, tailles réelles, CRC,
quotas et hashes. Il ne lance aucun JavaScript du jeu et vérifie l'empreinte de
l'original avant et après. Les assets sont contrôlés en flux sans être conservés
sur disque ; les pages HTML et le manifeste restent bornés.

Sans `--game`/`--version`, il valide le format déclaré ; il ne prouve pas que ces
références appartiennent au développeur. Avec ces options, il vérifie leur
concordance. La validation serveur reste obligatoire.

Le SDK public 0.4.2 n'est pas modifié. Pour distribuer ce contrôle, préparer dans
une version ultérieure du SDK un exécutable `chibasko-validate` empaquetant le
parseur isolé, ses règles et sa politique générées depuis le portail. Qualifier
le tarball sur Windows/Linux et les archives de référence avant publication.
Ne pas recopier manuellement les règles dans un deuxième validateur. Cette
commande publique n'est pas encore annoncée comme disponible sur npm.

## Migration et mise en ligne

1. Sauvegarder la base selon la procédure habituelle ; ne pas réécrire les
   migrations historiques. Examiner le diff et les validations locales.
2. Exécuter `scripts/sql/build-review-workflow-preflight.sql` avec une connexion
   de lecture autorisée. Les dépendances existantes doivent être présentes.
3. Appliquer une seule fois `20261110000200_build_review_workflow.sql`, après
   les migrations actuelles du dépôt. Elle ne réécrit aucun upload ni décision.
4. Refaire le préflight : les nouvelles fonctions sont `SECURITY INVOKER`, avec
   search_path fixé, EXECUTE réservé à service_role, et les tables privées restent
   inaccessibles à anon/authenticated. Comparer le snapshot au contrat versionné.
5. Déployer le portail et mettre à jour le poste de revue dans la même opération
   planifiée. La migration est additive et conserve les anciennes RPC : l'ancien
   portail reste compatible pendant cette transition. Le nouveau code exige la
   migration ; ne pas inverser cet ordre.
6. Tester avec un build de qualification neuf : fichier interdit, correction,
   nouvel upload du même jeu, archive valide, test isolé et décision humaine.
   Aucun besoin de changer One more day pour cette qualification.
7. Conserver les flags et ressources Cloudflare existants, notamment le validateur
   automatique désactivé. Aucune nouvelle variable ou secret requis.

En cas de retour arrière, redéployer le précédent portail et remettre l'ancien
validateur local. Laisser la migration additive et les événements en place ; ne
pas effacer les tentatives ou faire redescendre les statuts par SQL. Vérifier le
résultat d'une tentative interrompue avant une reprise. Les anciennes versions
ne présentent pas les nouveaux diagnostics mais continuent à fonctionner.

## Commandes de validation

```sh
npm run test:review-workflow
node tests/production-schema-reference.mjs
npm run test:build-review-browser
npx tsc --noEmit
npm run lint
```

Le test SQL construit exclusivement un PostgreSQL jetable. Les tests de commande
et de navigateur utilisent des comptes et stockages simulés, jamais une soumission
réelle. Le contrat SQL doit être régénéré avec `--write` uniquement après examen
d'une modification de migration locale.
