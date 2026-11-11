# Origines stables : procédure de production

La procédure à jour est dans [Qualification finale et mise en production](stable-origins-final-qualification.md).

Elle remplace le précédent rapport : la migration additive 006 permet désormais deux versions simultanées avec des chemins épinglés. Le Gateway utilise les RPC versionnées et non l'ancien échange partagé. Les migrations 003, 004 et 005 restent nécessaires et inchangées.

**Verdict B.** Conserver `GAME_STABLE_ORIGINS_ENABLED=0` jusqu'aux contrôles Supabase complets, aux vérifications Cloudflare et aux tests Safari sur appareil Apple dans le contexte réel. La page `/diagnostics/game-storage` permet de vérifier le stockage sans ouvrir une session de jeu et sans activer le flag.

Ne pas appliquer les anciennes instructions de déploiement ni conclure de l'échec WebKit Windows que Safari réel échoue nécessairement. La nouvelle procédure précise les preuves, limites, commandes et conditions de retour arrière.
