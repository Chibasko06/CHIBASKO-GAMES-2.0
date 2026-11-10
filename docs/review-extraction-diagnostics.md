# Diagnostiquer une extraction de build

`review:game` attend l'identifiant d'un upload, pas nécessairement celui de la
soumission éditoriale. Le script SQL `scripts/sql/build-review-diagnostics.sql`
résout les deux références. Remplacer son UUID neutre et l'exécuter avec un accès
de lecture autorisé. La transaction est explicitement en lecture seule. Elle ne
retourne ni e-mail, ni secret, ni clé R2, ni ticket, ni token de lease.

## Limite des anciens échecs

L'ancien enfant d'extraction quittait avec le code 2 sans conserver l'exception.
Le parent ignorait stdout/stderr et convertissait toute sortie non nulle en
`validation_failed`. Ce code ne prouve pas une archive invalide. Les journaux
`review_job_failed` antérieurs ne contiennent que la phase et le code générique.
Un checkpoint nul n'identifie pas non plus la vérification ayant échoué.

Le répertoire temporaire est normalement supprimé après la commande. Sans ZIP
original disponible ou journal antérieur plus précis, la cause d'un ancien échec
ne peut pas être reconstruite à partir de ce seul code.

## Récupérer l'original après autorisation

Le bucket est celui de `GAME_BUILDS_STAGING_BUCKET`, normalement
`chibasko-game-staging`, et non le bucket d'artefacts ou celui des images.
La clé est générée par PostgreSQL : `staging/uploads/<upload-id>/source.zip`.
Ne pas utiliser l'UUID de la soumission éditoriale à sa place.

`review:archive` charge les quatre variables R2 depuis l'environnement ou le
fichier local ignoré `.env.review.local` : `GAME_BUILDS_R2_ACCOUNT_ID`,
`GAME_BUILDS_R2_ACCESS_KEY_ID`, `GAME_BUILDS_R2_SECRET_ACCESS_KEY` et
`GAME_BUILDS_STAGING_BUCKET`. Aucune clé Supabase n'est nécessaire à cet outil.
Ne placer aucune credential dans une commande, un ticket ou un journal. Utiliser
de préférence des credentials R2 dédiées en lecture seule sur ce bucket ; le
script ne change aucune permission et ne peut pas prouver leur portée distante.
Pour utiliser un jeu de credentials dédié sans modifier `.env.review.local`,
le renseigner dans un fichier local ignoré `.env.review.readonly.local`, puis
lancer `node --env-file=.env.review.readonly.local scripts/review-archive.mjs`
avec les mêmes arguments. Les variables déjà injectées restent prioritaires.

La vérification suivante ne contacte aucun service :

```sh
npm run review:archive -- check-config
```

Après accord pour lire R2, obtenir `expected_archive_etag` avec la requête SQL
de lecture seule. Conserver cette valeur exacte dans un fichier local privé
`etag.txt`, sans l'insérer dans une commande. Exporter `validation_limits` dans
`policy.json` sans les modifier. Choisir un dossier de sortie qui n'existe pas.

Exemple pour l'upload One more day, depuis le dépôt du portail :

```sh
npm run review:archive -- download --upload 26859697-9fd7-4156-9620-a6943049b674 --expected-size 351729246 --etag-file .distribution/private-review/etag.txt --output .distribution/private-review/one-more-day-original
```

L'outil effectue uniquement HEAD et GET. Il exige la taille et l'ETag stockés
dans l'upload, utilise If-Match pendant le GET, refuse les redirections et ne
remplace jamais un fichier existant. La copie finale `archive.zip` est mise en
lecture seule ; `receipt.json` conserve taille, ETag et SHA-256. Un transfert
incomplet ne supprime que sa propre copie partielle locale. L'ETag multipart
n'est pas un SHA-256 : l'empreinte calculée décrit la copie reçue, pas une
empreinte d'origine absente de la base.

Pour inspecter cette copie sans écrire en base ou dans R2 :

```sh
npm run review:archive -- inspect --archive .distribution/private-review/one-more-day-original/archive.zip --game 53f82dd2-3d69-4116-9794-f2b5412526f4 --version 1.0.0 --policy .distribution/private-review/policy.json --report .distribution/private-review/inspection.json
```

Cette commande ne charge pas les credentials. Elle travaille sur une seconde
copie temporaire avec le parseur isolé, conserve son diagnostic ou son inventaire
dans un nouveau fichier privé et vérifie que le ZIP source est inchangé. Elle
ne lance aucun jeu et ne fait aucun appel distant. Le contrôle local conserve uniquement les pages de lancement et le manifeste sur
disque ; prévoir la taille du ZIP, 3 Mio pour ces fichiers et 1 Gio de marge.
Les assets sont lus, décompressés, contrôlés et hachés sans être conservés. Un rapport d'échec n'entraîne aucun refus du jeu.

## Diagnostics futurs

Le parseur isolé écrit un diagnostic borné dans son propre répertoire temporaire.
Seuls des motifs connus, un champ de schéma et un chemin relatif expurgé peuvent
remonter. Aucun message brut d'exception, valeur de manifeste, chemin serveur,
pile d'appels ou environnement n'est transmis. Les restrictions de processus,
de réseau, de fichiers et les quotas restent identiques.

La migration additive `20261110000200_build_review_workflow.sql` ajoute les RPC
qui enregistrent le diagnostic et le changement de statut dans la même transaction.
L'écriture est protégée par le token de lease et sa date d'expiration. Un échec de
journalisation annule le changement ; l'outil signale l'incident au lieu de
prétendre avoir conservé le diagnostic. Une panne totale de PostgreSQL reste
visible dans la commande, mais ne peut pas être journalisée dans cette même base.

Le journal privé existant `game_build_review_events` conserve acteur, date,
numéro de tentative, phase, code stable, catégorie et chemin ou champ expurgé.
Les messages et actions correctives sont dérivés d'un catalogue de motifs, sans
copier de message d'exception. Les détails restent derrière les contrôles admin.
La projection développeur reçoit uniquement l'état et le motif administratif.

Voir [le parcours de revue](game-review-workflow.md) pour les reprises contrôlées,
les builds corrigés et le contrôle local sans compte.

## Préserver et reprendre un build

1. Consulter le statut, la décision humaine, les tentatives, l'expiration et
   `cleaned_at` avec la requête de lecture. Ne rien réinitialiser à ce stade.
2. Vérifier par une lecture R2 autorisée la présence, la taille et l'ETag de
   l'archive originale. `staging_finalized=true` n'en prouve pas la présence
   actuelle. Ne pas réutiliser un ancien lien signé expiré.
3. Si une copie est nécessaire, la télécharger uniquement avec un accès de
   lecture autorisé, dans un répertoire privé. Conserver ses empreintes et la
   comparer aux métadonnées disponibles. Ne pas modifier cette copie ni le ZIP
   original et ne pas exécuter le jeu pour diagnostiquer sa structure.
4. Contrôler l'inventaire et l'extraction avec le parseur isolé et les limites
   enregistrées pour cet upload. Un mauvais manifeste doit être comparé à
   `game_id` et `version` de l'upload, pas au titre ou à l'UUID de soumission.
5. Après résolution d'un incident interne, préparer explicitement une nouvelle
   tentative depuis le dossier admin, ou utiliser `--retry-internal` avec la
   commande de revue. La RPC refuse les non-conformités, les archives expirées,
   nettoyées, les décisions définitives et le dépassement de maxAttempts. Elle ne
   remet jamais les tentatives à zéro et conserve les journaux.
6. Exécuter ensuite `npm run review:game -- <upload-id>`. Cette commande écrit
   en base et dans R2 ; ce n'est pas un diagnostic en lecture seule. Une réussite
   technique ne publie pas le jeu.

Les uploads terminés, échoués ou expirés peuvent être nettoyés après un jour par
la maintenance existante. La présence réelle de l'archive doit donc être
contrôlée avant de promettre une reprise sans nouvelle archive. Aucun nettoyage
ni changement de rétention n'est effectué par ces contrôles.
