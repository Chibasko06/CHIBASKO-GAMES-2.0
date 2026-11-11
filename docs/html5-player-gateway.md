# Lecteur HTML5 et Gateway

## Parcours de lancement

Le portail autorise le lancement et crée une session. Le lecteur conserve le secret de contrôle pour renouveler ou révoquer cette session. Les prévisualisations privées et l'ancien parcours utilisent une origine éphémère `l-<capacité>.chibaskogames-play.fr`. Les fichiers restent dans un préfixe R2 immuable par version ; staging et ZIP ne sont jamais exposés.

Avec `GAME_STABLE_ORIGINS_ENABLED=1`, les jeux publiés utilisent `g-<UUID-jeu-sans-tirets>.chibaskogames-play.fr`. Ce domaine doit rester sur un site distinct du portail. Chaque jeu possède son origine, commune à ses versions. Le stockage n'est pas partagé entre jeux ; une version d'un même jeu doit cependant être considérée comme appartenant au même espace de confiance que ses versions précédentes.

L'iframe charge un bootstrap contrôlé. Le ticket éphémère voyage dans un fragment retiré avant le jeu, puis est échangé une seule fois contre un cookie host-only sécurisé. Une sonde HEAD vérifie le transport du cookie. Aucun accès de secours n'est accordé si le navigateur le bloque. Le cookie n'est pas une session Supabase et sa durée ne prolonge pas le bail SQL.

Les premiers échanges sont sérialisés par Web Locks, avec timeout borné et nettoyage. Chaque lecteur garde son secret de contrôle ; fermer un lecteur n'invalide pas ceux qui possèdent encore une session autorisée.

## Versions et ressources

La migration 006 complète les migrations 003 à 005 sans les réécrire. Le Gateway emploie `distribution_exchange_versioned_public_delivery` et `distribution_check_versioned_public_delivery`. Les anciennes signatures restent présentes pour les anciens consommateurs.

L'entrée et les ressources portent `/__chibasko_build__/<UUID-version>/<chemin>`. Le cookie identifie un groupe de sessions d'un jeu, mais SQL vérifie **la version demandée et une session encore autorisée** à chaque accès. Deux versions peuvent fonctionner simultanément sans mélanger leurs fichiers. Le contexte Referer d'une ressource absolue sert seulement à choisir sa version ; il ne remplace jamais l'autorisation.

Les redirections sont des 307 sans cache. Un répertoire ne mène qu'à son `index.html` existant ; aucun inventaire n'est servi. Traversées, doubles séparateurs, caractères encodés dangereux, métadonnées réservées et service workers restent refusés. Les builds utilisant une politique no-referrer doivent privilégier des chemins relatifs ou déjà préfixés.

## Modes et protections

`classic` n'attend pas le bridge SDK. `sdk` conserve les contrôles du protocole. Les jeux legacy externes restent tributaires de leur hébergeur et des règles iframe existantes. L'origine stable ne transforme pas une URL externe en contenu maîtrisé.

`allow-same-origin` s'applique uniquement au site de contenu séparé. Le cookie `__Host-` n'accepte pas Domain. `Origin-Agent-Cluster` limite l'assouplissement de document.domain. Le secret de contrôle reste dans le parent. Révoquer une session bloque les nouveaux accès, sans supprimer le JavaScript ou les fichiers déjà chargés.

Les sauvegardes restent exclusivement dans localStorage ou IndexedDB. Elles peuvent être partitionnées par site parent ou effacées par le navigateur. Il n'existe ni sauvegarde cloud ni transfert automatique des anciennes origines éphémères.

## Fonctionnalités restant limitées

Le bouton plein écran du lecteur est conservé. La navigation native vers un autre document du jeu reste surveillée ; les ouvertures de pages légales et téléchargements génériques ne sont pas annoncés comme terminés. Aucune permission générale de téléchargement, pop-up ou navigation supérieure n'a été ajoutée.

## Qualification et production

Voir [le rapport final](stable-origins-final-qualification.md) : matrice de cookies, tests HTTPS réellement isolés, navigateur avec PostgreSQL jetable, correction du mélange de versions, diagnostic public de stockage, migrations, Cloudflare, coûts, activation et retour arrière.

**Verdict B : flag maintenu à 0.** Les preuves locales ne remplacent pas Safari Apple, la configuration Cloudflare réelle et les préflights complets du schéma de production.
