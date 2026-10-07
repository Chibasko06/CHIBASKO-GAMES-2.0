# Miniatures R2 — nouveaux uploads uniquement

## Parcours

`POST /api/admin/games/thumbnail` conserve la vérification admin existante et le
format multipart `file`. Le champ historique `slug` est toléré mais n'est plus
utilisé pour nommer l'objet. La réponse reste `{ thumbnailUrl }`.

1. Valider avec `validateGameThumbnail` : 8 Mio, formats/MIME, dimensions jusqu'à
   40 mégapixels et contrôles SVG existants, sans sharp.
2. Obtenir `CHIBASKO_ASSETS` via `getCloudflareContext()` dans la requête OpenNext.
3. Écrire `game-thumbnails/<UUID-v4>.<extension-détectée>` dans `chibasko-assets`.
4. Utiliser une création conditionnelle (If-None-Match: *) sans écrasement.
5. Renvoyer `https://assets.chibaskogames.fr/<clé>`.
6. L'admin sauvegarde ensuite le formulaire, qui stocke l'URL dans
   `games.thumbnail_url` comme auparavant. Aucune modification de schéma SQL.

Les métadonnées R2 incluent Content-Type, un cache public immutable d'un an et
les marqueurs `application=chibasko-games`, `kind=game-thumbnails`.
Les octets originaux sont conservés. Pas de copie, déplacement ou suppression
des objets Supabase Storage. Les anciens chemins Supabase restent autorisés
dans `next/image`, en plus du domaine R2 pour les miniatures.

## Remplacement

Ne rien supprimer pendant l'upload : l'utilisateur peut abandonner le formulaire.
Après la réussite du PATCH du jeu et de ses catégories, le backend considère
l'ancienne URL lue en base (jamais une URL de suppression envoyée par le client).
La mise à jour compare cette ancienne valeur pour détecter une modification
concurrente pendant la requête ; elle renvoie 409 en cas de conflit.

Le nettoyage est limité aux URLs HTTPS canoniques de `assets.chibaskogames.fr`,
sans credentials, query string ou fragment, au préfixe game-thumbnails et aux
fichiers UUID-v4 reconnus. L'objet doit porter les marqueurs de cette application.
Une référence restante dans `games.thumbnail_url` ou `profiles.avatar_url`, une
erreur SQL, un résultat inconnu ou une erreur R2 empêche le nettoyage ou laisse
l'ancien fichier en place. Une erreur de nettoyage ne fait pas échouer le jeu
déjà sauvegardé. Une URL Supabase ou externe n'est jamais supprimée.

Limite : le contrôle de références PostgreSQL et la suppression R2 ne constituent
pas une transaction distribuée. Une réassignation manuelle de l'ancienne URL
exactement entre ces opérations reste possible ; les marqueurs et contrôles
réduisent le périmètre sans garantir une exclusion globale de tous les écrivains.
Ne pas réaffecter simultanément une miniature en cours de remplacement. Une
garantie plus forte nécessiterait un protocole partagé de gestion des références.

Les uploads abandonnés et les objets conservés par prudence peuvent rester
orphelins. Aucun job de purge, lifecycle automatique ou suppression à la
suppression d'un jeu n'est ajouté dans cette phase.

## Environnements et vérification

Le binding doit être disponible sur Cloudflare. Aucun token S3 supplémentaire.
Sans binding (notamment next dev/next start ou Vercel), l'upload échoue explicitement
et n'écrit pas dans Supabase par défaut. L'affichage et les autres fonctionnalités
restent disponibles. Tester les uploads avec le runtime Cloudflare.

La preview locale émule R2 : ses objets ne sont pas accessibles sur le domaine
public distant. Ne pas enregistrer leurs URLs dans une base de production lors
d'un test manuel local. Les tests automatisés utilisent des réponses SQL simulées.

Si Vercel reste le fallback avec une base partagée, sa version déployée doit aussi
autoriser `assets.chibaskogames.fr/game-thumbnails/**` dans next/image avant les
premiers uploads R2 persistés. La modification de configuration est présente
ici, mais aucun déploiement Vercel n'est réalisé par ce changement.

Le domaine public R2 doit être associé au même bucket que le binding. Sa
configuration est déclarée active par l'utilisateur ; elle n'est pas modifiée
ni validée par un upload distant pendant ce changement.

`npm test` couvre les validations, le binding absent, les erreurs d'écriture,
l'autorisation admin, les URLs non possédées, objets partagés, erreurs SQL/R2,
conflits et l'ordre sauvegarde/nettoyage. Un test utilise un binding R2 local
workerd avec persist:false et remote:false, sans credentials de production.

Après un futur déploiement autorisé, tester manuellement un upload admin, son URL
publique, l'enregistrement du jeu, le remplacement R2 et le remplacement d'une
ancienne URL Supabase. Vérifier l'affichage des anciennes miniatures et les
avatars inchangés. Aucune migration de données n'est requise.
