# Miniatures locales vers R2

Node 24.14+ ; depuis la racine du repo. Utilise les mêmes variables privées que
[la migration Storage](legacy-media-migration.md) ; aucune clé R2 nécessaire au dry-run.

```powershell
# Lecture seule de games et validation des fichiers locaux : aucune écriture R2/DB/journal
node --env-file=.env.media-migration.local scripts/migrate-local-thumbnails.mjs

# Application manuelle seulement après validation et sauvegarde
node --env-file=.env.media-migration.local scripts/migrate-local-thumbnails.mjs --apply

# Plan de rollback, puis restauration conditionnelle (aucune suppression)
node --env-file=.env.media-migration.local scripts/migrate-local-thumbnails.mjs --rollback
node --env-file=.env.media-migration.local scripts/migrate-local-thumbnails.mjs --rollback --apply
```

Inventaire initial : 81 jeux, 51 chemins `/games/<nom>.jpg`. Ils se résolvent sous
`public/games/` ; les URLs distantes ne sont pas traitées. Le compteur `total` concerne
uniquement les chemins locaux, et non tous les jeux. `planned` signifie fichier trouvé
et validation réussie pendant le dry-run ; il ne prouve pas encore les accès R2.

Le résolveur refuse les query strings/fragments, traversées encodées ou non, chemins
Windows et sorties de `public/` (realpath vérifie aussi les liens symboliques).
Fichier régulier, non vide, <=8 Mio ; extension cohérente avec les octets (jpeg/jpg
équivalents), MIME détecté, dimensions <=40 MP, SVG statique : validateur d'upload existant.
Pas de conversion ni sharp. Travailler depuis un checkout local de confiance, sans modification
concurrente des fichiers pendant le passage.

Le mode apply réutilise l'implémentation S3 du script précédent : PUT conditionnel sans
écrasement, GET avec comparaison SHA-256, Content-Type et métadonnées avant sauvegarde DB.
Clé `game-thumbnails/<identifiant au format UUID-v4>.<extension>` déterministe selon chemin
et contenu, donc réutilisable à la relance, sans doublon pour une source inchangée.
Métadonnées application/kind compatibles avec le nettoyage existant des miniatures.

Journal privé durable dédié : `.media-migration/local-thumbnails.jsonl` (ignoré par Git).
Intention fsync avant UPDATE, état final ensuite. UPDATE conditionnel ID + ancienne URL :
aucun changement concurrent écrasé. Erreurs par jeu isolées ; une panne du journal interrompt
le passage pour conserver les garanties de rollback. Totaux success/planned/skipped/errors,
code de sortie non nul en cas d'erreur. Aucune suppression de source locale ni d'objet R2.
Après arrêt brutal, vérifier l'absence de processus avant de retirer le fichier `.lock`.
Relancer la même commande : URLs R2 ignorées et objets déjà copiés vérifiés/réutilisés.

Sauvegarder `games(id,thumbnail_url)` avant apply. Garder les fichiers locaux dans le repo
et le journal hors Git. Vérifier les nouvelles URLs publiques et pages jeux après apply.
Rollback restaure uniquement les URLs encore égales à la destination du journal, sans annuler
les éditions ultérieures. Les fichiers locaux restent nécessaires pour ce rollback ; ne pas
les supprimer lors d'un déploiement ultérieur avant validation d'une phase de nettoyage séparée.
Les objets orphelins après conflit/échec DB restent conservés. Aucun déploiement requis.
