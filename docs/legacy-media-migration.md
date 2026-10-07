# Migration manuelle des anciens médias Supabase vers R2

Outil CLI Node **24.14+**, indépendant de Next, du navigateur et du binding Worker.
Aucun déploiement requis. Aucun DELETE Storage/R2, changement de schéma ou modification Auth.
Ne pas exécuter apply avant sauvegarde, revue du dry-run et accord opérationnel.

## Inventaire établi depuis le code et Git

- `profiles.id`, `profiles.avatar_url` : ancien bucket public `avatars`, chemin historique
  `<user-id>/avatar.<extension>` (upload avec upsert). Le champ peut aussi contenir une URL externe.
- `games.id`, `games.thumbnail_url` : ancien bucket public `game-thumbnails`, chemin historique
  `<nom-normalisé>-<uuid>.<extension>` ; d'anciens imports peuvent avoir laissé des chemins locaux.
- URL historique publique : `https://<projet>.supabase.co/storage/v1/object/public/<bucket>/<chemin>`.
  Le parseur accepte aussi des chemins encodés et imbriqués dans ces deux buckets.
- Seule l'origine EXACTE de `NEXT_PUBLIC_SUPABASE_URL` est traitée. Les URLs signées,
  transformations `/render/image/`, query strings, fragments et buckets inconnus sont signalés
  `unsupported-supabase`, sans copie ni modification. Ne pas convertir ces URLs à l'aveugle.
- R2 : `already-r2` ; origine tierce : `external` ; chemin `/...` : `local` ; null : `empty`.
  Les URLs malformées sont signalées puis l'inventaire continue.

**Nombre de lignes inconnu hors production** : aucun dump local exploitable ni accès production
n'a été utilisé pour cet outil. Le dry-run donne les IDs exacts, le bucket source et le nombre
`planned` par table. Il ne vérifie pas encore l'existence/validité des fichiers.
Les comptes `total` incluent aussi les lignes sans média et les URLs ignorées.

## Accès et variables locales

Utiliser un fichier `.env.media-migration.local` non versionné (ignoré par `.env*`),
protégé par les permissions de votre compte. Aucune valeur n'est fournie par ce document.
Ne pas utiliser les clés anonymes/publishable comme accès serveur.

| Variable | Usage | Nécessaire |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Origine du projet et API Supabase | Toujours |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT service_role ou clé serveur `sb_secret_…` ; lecture Storage et mise à jour DB | Toujours |
| `R2_ACCOUNT_ID` | Compte Cloudflare, endpoint S3 | Apply migration seulement |
| `R2_ACCESS_KEY_ID` | Identifiant d'accès S3 R2 | Apply migration seulement |
| `R2_SECRET_ACCESS_KEY` | Secret d'accès S3 R2 | Apply migration seulement |

Configurer un accès R2 limité au bucket `chibasko-assets`, avec lecture/écriture objets.
Le CLI n'utilise ni API token Wrangler ni `CHIBASKO_ASSETS` : le binding n'existe que dans
le Worker. Aucune clé n'est créée par cet outil. Aucun secret supplémentaire côté Worker.
La configuration S3 utilise `region: auto` et l'endpoint du compte, conformément à la
[documentation Cloudflare](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).
Le bucket et le domaine public sont fixes, pour éviter des URLs pointant vers un autre bucket.

## Préparation et commandes (depuis la racine du dépôt)

1. Sauvegarder au minimum `profiles(id,avatar_url)` et `games(id,thumbnail_url)` dans un
   export privé ; conserver les sources Storage. Sauvegarder aussi la base selon votre procédure.
2. Installer les dépendances avec `npm ci` ; vérifier la version de Node.
3. Charger explicitement le fichier local via Node : aucune lecture automatique de `.env.local`.

```powershell
# Inventaire uniquement : aucun téléchargement média, aucune écriture, aucun accès R2
node --env-file=.env.media-migration.local scripts/migrate-media.mjs

# Même chose, option explicite
node --env-file=.env.media-migration.local scripts/migrate-media.mjs --dry-run

# Migration RÉELLE, à lancer uniquement après validation
node --env-file=.env.media-migration.local scripts/migrate-media.mjs --apply
```

Si les variables sont déjà chargées dans le processus : `npm run migrate:media` puis,
pour appliquer, `npm run migrate:media -- --apply`.
Ne jamais placer les valeurs secrètes dans la ligne de commande, les logs ou Git.

## Algorithme, reprise et garanties

Pagination par ID, 200 lignes, traitement séquentiel. Téléchargement via le SDK Storage serveur,
jamais par fetch d'une URL fournie par un utilisateur (pas de SSRF vers une origine externe).
Validation des octets et dimensions : avatars <=5 Mio, JPG/PNG/WebP/GIF/ICO ; miniatures
<=8 Mio, formats actuels dont AVIF et SVG statique via le validateur existant. Aucun sharp,
aucune conversion. Un ancien fichier non conforme reste intact et sa ligne est signalée.
Le Content-Type est déterminé par les octets et normalisé ; une ancienne étiquette incorrecte
n'est pas reproduite. Le nom/extension historique peut donc changer, sans altérer le contenu.

Clés : `avatars/<user-id>/<identifiant-UUID>.<extension-détectée>` ou
`game-thumbnails/<identifiant-UUID>.<extension-détectée>`. Identifiant déterministe dérivé
de la source, de son SHA-256 et du propriétaire avatar, avec syntaxe UUID-v4 acceptée par
l'application. Ce n'est pas un UUID aléatoire. Une relance avec la même source produit la même clé.

PUT conditionnel `If-None-Match: *` : aucun écrasement d'objet. Une clé déjà présente doit
passer la même vérification. GET R2 avec comparaison SHA-256 des octets, Content-Type et
métadonnées AVANT toute mise à jour PostgreSQL. Métadonnées : application, kind, migration,
sha256, propriétaire avatar. Cache public immutable un an. Les métadonnées arbitraires
de Supabase ne sont pas copiées ; les informations nécessaires à la reprise sont conservées.

Journal privé append-only `.media-migration/journal.jsonl` (ignoré par Git), fsync avant
mise à jour DB (`prepared`), puis état `committed` ou `conflict`.
Mise à jour conditionnelle sur ID ET ancienne URL exacte : un changement concurrent n'est
jamais écrasé. Les erreurs individuelles sont comptées, le traitement continue, code de sortie 1.
Une erreur de journal arrête immédiatement le traitement. Les logs n'affichent ni clés, ni
URLs complètes, ni messages SDK susceptibles de contenir des informations sensibles.

Relancer la même commande après interruption. Les URLs R2 sont ignorées ; un objet copié
avant une interruption est vérifié puis réutilisé. Si la source a changé, une nouvelle clé
est calculée. Des objets orphelins peuvent rester après conflit/échec DB : aucune suppression
automatique. Un verrou `<journal>.lock` empêche deux apply utilisant le même journal.
Après arrêt brutal, vérifier qu'aucun processus ne tourne avant de retirer MANUELLEMENT
ce seul verrou. Ne pas lancer plusieurs migrations avec des journaux différents.

## Vérification après application

- Conserver le journal, l'export et les logs dans un emplacement privé sauvegardé.
- Relancer dry-run : les lignes migrées doivent être `already-r2`, examiner tous les `errors`.
- Contrôler dans PostgreSQL les IDs du journal : URLs attendues sous le domaine assets.
- Tester les URLs publiques R2 dans le navigateur (le GET de vérification utilise S3,
  il ne garantit pas la configuration du domaine/CDN public), profils et pages jeux,
  ordinateur/mobile et anciennes URLs Supabase.
- Vérifier Content-Type/cache et comparer le SHA-256 au journal si nécessaire.
- Pas de nettoyage source avant une phase séparée validée avec sauvegardes et délai de recul.

## Rollback des URLs seulement

```powershell
# Plan de rollback, aucune écriture
node --env-file=.env.media-migration.local scripts/migrate-media.mjs --rollback
# Restaurer uniquement les lignes dont l'URL actuelle correspond à l'URL migrée
node --env-file=.env.media-migration.local scripts/migrate-media.mjs --rollback --apply
```

Autre journal : ajouter `--journal <chemin>` aux commandes. Le journal contient des IDs et
URLs, aucune clé ; il reste sensible et ne doit pas être partagé publiquement. Le rollback
traite aussi les intentions `prepared`, pour couvrir une interruption juste après la sauvegarde
DB. Il restaure par comparaison conditionnelle `id + newUrl`, conserve les modifications
plus récentes et ne supprime rien dans R2. Le dry-run rollback compte les intentions du journal,
pas les lignes actuellement restaurables. Une erreur DB arrête le rollback ; relancer est sûr.
Une ligne peut aussi être restaurée individuellement depuis l'export, en exigeant que sa valeur
actuelle égale exactement `newUrl` du journal. Ne pas réimporter toute une table à l'aveugle.

Les sources Supabase restent disponibles pour le rollback. Attention : après un remplacement
ultérieur dans l'interface, le nettoyage normal peut supprimer un objet R2 devenu inutilisé.
Le journal de cette migration n'annule pas ces modifications ultérieures. Les clés de métadonnées
S3 peuvent être normalisées en minuscules (`userid`) ; le nettoyage actuel qui attend `userId`
peut conserver un avatar migré inutilisé, par prudence. Cela n'affecte pas son affichage ni le rollback
et ne justifie aucune suppression manuelle sans audit des références.

## Limites opérationnelles

Pas de transaction distribuée R2/PostgreSQL ; journal + copie vérifiée + CAS assurent une reprise
conservatrice. Pas de snapshot global : éviter les éditions massives pendant le passage, puis
relancer l'inventaire. Une ancienne source réécrite pendant le téléchargement ne peut être figée
par ce CLI ; les anciens uploaders doivent rester retirés. Les suppressions de profils/jeux
concurrentes produisent un conflit, pas une recréation. Transferts et requêtes peuvent occasionner
des frais. Formats privés/signés, mauvais fichiers, fichiers manquants et URLs historiques
inattendues nécessitent une revue manuelle ; aucun contournement automatique.
