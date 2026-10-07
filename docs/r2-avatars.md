# Nouveaux avatars sur R2

Les nouveaux fichiers sont envoyés via `CHIBASKO_ASSETS` vers
`avatars/<UUID utilisateur>/<UUID v4 fichier>.<jpg|png|webp|gif|ico>`.
L'URL publique stockée dans `profiles.avatar_url` commence par
`https://assets.chibaskogames.fr/avatars/`.

- `POST /api/profile/avatar` vérifie le JWT Supabase, utilise uniquement l'identifiant
  de cet utilisateur, valide le fichier, écrit R2 puis sauvegarde le profil côté serveur.
- `DELETE /api/profile/avatar` vérifie le même utilisateur et met son avatar à null.
  Le dashboard utilise ce chemin pour son bouton de suppression.
- `POST /api/admin/users/[id]/avatar` conserve `requireAdmin()` et sauvegarde
  l'avatar de l'utilisateur ciblé après upload R2.
- `PATCH /api/admin/users/[id]` conserve les champs éditables existants et nettoie
  l'ancien avatar après remplacement d'URL ou effacement du champ.
- La suppression d'un compte via `DELETE /api/admin/users/[id]` est inchangée.
  Elle ne déclenche pas de nettoyage de fichiers dans cette phase.

Validation serveur : fichier non vide, 5 Mo maximum, format détecté et MIME cohérents,
JPG/PNG/WebP/GIF/ICO, 40 millions de pixels maximum par image déclarée.
Les deux MIME ICO historiques sont acceptés. SVG reste refusé. Aucune conversion,
aucun redimensionnement, aucune dépendance à sharp.

La sauvegarde compare l'ancienne URL : une modification concurrente entraîne un
conflit HTTP 409. Aucun ancien fichier n'est supprimé en cas d'échec de sauvegarde.
Après succès, le nettoyage accepte seulement une URL R2 canonique appartenant au
même utilisateur, avec les métadonnées application/type/propriétaire attendues.
Toute référence restante dans les profils ou miniatures bloque la suppression.
Les anciens fichiers Supabase, les URL externes et les objets non reconnus sont conservés.

PostgreSQL et R2 ne partagent pas de transaction : un échec DB après upload peut
laisser un nouvel objet orphelin. Un échec de nettoyage conserve l'ancien objet et
n'annule pas la sauvegarde. La suppression R2 ne purge pas les caches CDN/navigateur.

Aucune migration SQL, aucun transfert des anciens fichiers, aucune nouvelle variable
ou configuration du bucket n'est nécessaire. Après un déploiement décidé séparément,
vérifier upload/remplacement/suppression depuis le dashboard et l'admin, affichage
sur profil/annuaire/avis et conservation des anciennes URL Supabase.
