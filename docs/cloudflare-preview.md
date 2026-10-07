# Phase 1 — Cloudflare preview, Vercel production conservée

## Choix et limites

OpenNext adapte le véritable `next build` à Workers, avec App Router, SSR,
Route Handlers, metadata et `after()`. La documentation Cloudflare recommande
désormais vinext par défaut, mais le présente encore comme bêta : pour ce projet
existant, nous conservons le compilateur Next.js et ses scripts habituels.

- Next.js et eslint-config-next : 16.2.4 → 16.3.8 (correctifs sécurité, même majeure).
- Adaptateur : @opennextjs/cloudflare 1.20.9 ; Wrangler : 4.148.0.
- Worker séparé : `chibasko-games-preview`, uniquement workers.dev, aucune route DNS.
- R2 est utilisé uniquement pour les nouveaux uploads de miniatures ; pas de cache R2,
  KV, Docker, VPS ou serveur multijoueur.
- Cache incrémental OpenNext désactivé par défaut (`dummy`). Le catalogue est
  dynamique ; aucun ISR persistant n'est requis par le code actuel.
- Windows a passé le build local, mais n'est pas pleinement garanti par OpenNext.
  Privilégier Linux pour un futur build CI reproductible.

Documentation :
- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://opennext.js.org/cloudflare/howtos/env-vars
- https://opennext.js.org/cloudflare/howtos/custom-worker

## Commandes

Les commandes classiques restent disponibles : `npm run dev`, `npm run build`.

```sh
npm ci
npm run lint
npm test
npm run build
npm run build:cloudflare
npm run preview:cloudflare
```

`preview:cloudflare` reconstruit puis démarre workerd localement. Après un build
déjà réalisé, `node scripts/cloudflare.mjs preview --port 8787` évite de reconstruire.
Dans un autre terminal : `node scripts/cloudflare-smoke.mjs`.
Le smoke test ne crée pas de données : lectures publiques et requêtes invalides.

Après configuration et authentification manuelles seulement :

```sh
npx wrangler login
npx wrangler whoami
npm run deploy:cloudflare
```

Le déploiement cible exclusivement ce Worker ; `--keep-vars` conserve les variables
configurées dans le dashboard. Aucun push Git ni modification Vercel n'est nécessaire.
Ne pas utiliser `opennextjs-cloudflare migrate` : il peut créer du stockage R2.
Ne pas lancer un deploy automatique qui reconfigure le framework avec vinext.

## Environnement

Aucune valeur privée dans Wrangler, Git ou les fichiers publics.
Pour le build local, garder les variables publiques dans `.env.local`.
Pour le runtime local, utiliser `.dev.vars`, ignoré par Git.
Ne pas partager ces fichiers ni les bundles générés.

Le script de build retire les valeurs privées du module de fallback `.env`
généré par OpenNext. Les secrets doivent donc réellement exister dans les bindings
Workers : le build ne fournit pas de clé serveur de secours.

| Variable | Classification | Build | Runtime Worker |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | PUBLIC | Obligatoire | Configurer aussi |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | PUBLIC | Obligatoire | Configurer aussi |
| NEXT_PUBLIC_SITE_URL | PUBLIC | Facultative, canonical production | Configurer aussi si utilisée |
| SUPABASE_SERVICE_ROLE_KEY | SECRET SERVER | Inutile pour les pages générées actuelles | Secret obligatoire |
| ADMIN_EMAILS | SERVER, confidentiel | Inutile | Secret recommandé |
| PASSWORD_RESET_CODE_SECRET | SECRET SERVER | Inutile | Secret obligatoire |
| RESEND_API_KEY | SECRET SERVER | Inutile | Secret obligatoire |
| RESEND_FROM_EMAIL | SERVER, non secret | Inutile | Variable obligatoire |
| CHIBASKO_CLOUDFLARE | SERVER, non secret | Fourni par le script | Fourni par wrangler.jsonc |

`NEXT_PUBLIC_SITE_URL` n'était pas lu avant cette phase ; il est maintenant optionnel,
avec le domaine canonique existant comme valeur par défaut. Pour la preview, conserver
la valeur du domaine de production, jamais l'origine workers.dev.

`VERCEL` reste automatique sur Vercel ; ne pas le configurer sur Cloudflare.
Le reset utilise CF-Connecting-IP uniquement dans ce Worker configuré Cloudflare,
et conserve l'ancien traitement des en-têtes sur Vercel. Sans IP valide, quota partagé.

IMPORTANT : si les deux hébergements partagent la base de production, utiliser le
MÊME PASSWORD_RESET_CODE_SECRET existant. Ne pas le régénérer : les demandes et quotas
sont partagés. Ne jamais envoyer ni enregistrer les valeurs dans la documentation.

Dans Cloudflare Workers & Pages, créer/vérifier uniquement le Worker de preview.
Configurer Settings → Variables and Secrets (type Secret pour les secrets ci-dessus).
On peut utiliser `npx wrangler secret put NOM` pour saisir une valeur sans l'inscrire
dans la commande ; cette opération crée/déploie une version du Worker concerné.
Créer/configurer le Worker avant d'exposer son application complète.
Si Git/Workers Builds est utilisé plus tard, les variables publiques doivent également
être déclarées dans les Build variables and secrets ; les runtime secrets restent séparés.

## Images

Les anciennes images et miniatures ne sont pas modifiées.
Les nouveaux uploads admin conservent le format et les octets du fichier validé :
JPG, PNG, WebP, GIF, AVIF, SVG statique. Contrôle taille (8 Mio), MIME/signature,
dimensions (40 mégapixels) et refus des SVG actifs ou avec ressources externes.
Ces contrôles vérifient les en-têtes/dimensions ; ils ne décodent pas intégralement
chaque image raster comme sharp. Aucun traitement natif ni accès filesystem.

Pas de conversion WebP, redimensionnement à 1280×720 ou normalisation EXIF serveur.
Les fichiers originaux peuvent donc être plus lourds. Préparer des miniatures adaptées
avant upload. Le CSS existant garde son rôle pour l'affichage.
Les nouveaux uploads de miniatures utilisent le binding `CHIBASKO_ASSETS` et sont
publics sur `https://assets.chibaskogames.fr/game-thumbnails/<UUID>.<extension>`.
Supabase Storage conserve les anciennes miniatures et tous les avatars.
Voir [le fonctionnement et les limites R2](r2-game-thumbnails.md).

`sharp` n'était pas une dépendance directe : c'était une dépendance transitive Next.js
importée par le code métier. Cet import est supprimé. Il peut rester installé pour le
build Next/Vercel ; il n'est pas nécessaire à l'exécution métier sur Workers.

`next/image` reste dans les composants ; `unoptimized` est activé uniquement pour
le build Cloudflare. Vercel conserve sa configuration d'optimisation habituelle.
Pas de binding Cloudflare Images ni de service d'images payant ajouté.

## SEO de la preview

Le wrapper Worker ajoute `X-Robots-Tag: noindex, nofollow, noarchive` à toutes les
réponses traitées, y compris les assets (`run_worker_first: true`). Il remplace
`/robots.txt` par `User-agent: * / Disallow: /`.
Les canonical et URLs du sitemap restent orientés vers chibaskogames.fr.
Ces règles appartiennent exclusivement à la preview Cloudflare et ne changent
pas les réponses Vercel. Ne pas réutiliser ce wrapper sans adaptation lors de
la future mise en production du domaine.
Noindex n'est pas un contrôle d'accès : le Worker reste public.
Analytics et AdSense restent présents ; les tests peuvent apparaître dans Analytics.
L'autorisation du domaine de test par AdSense reste à vérifier manuellement.

## Supabase Auth : coexistence

Ne pas remplacer la Site URL de production et ne pas modifier les credentials Google.
Après déploiement, relever l'URL HTTPS EXACTE retournée par Wrangler. Le sous-domaine
du compte Cloudflare ne peut pas être déduit du repository.

Dans Authentication → URL Configuration → Redirect URLs, ajouter uniquement pour
cette origine les deux chemins suivants :

- `/auth/callback`
- `/auth/callback?next=**` (paramètre next variable utilisé par le code)

Préfixer chacun par l'origine workers.dev réellement retournée, sans slash terminal.
Ne pas autoriser globalement tous les domaines workers.dev.
Google utilise toujours le callback du projet Supabase (`/auth/v1/callback`),
pas le Worker comme callback Google Console.

Email/password : la connexion n'exige aucune redirection supplémentaire.
L'inscription actuelle ne fournit pas emailRedirectTo : si confirmation email activée,
le lien conserve la Site URL de production. Confirmer le compte puis se connecter sur
la preview teste le flux existant ; une session n'est pas partagée entre les origines.
Le callback client reste compatible avec le stockage local Supabase existant.

Reset à six chiffres : aucun lien/callback dans l'email, donc aucune Redirect URL
`/reset-password` nécessaire. Demander et saisir le code sur la même preview.

## Validation manuelle avant toute bascule

Les tests locaux ne doivent pas changer les données métier de production. Pour les
tests d'écriture manuels, utiliser des comptes et propositions de test identifiables.
Une preview partageant Supabase production partage ses données, fichiers et quotas.

- Accueil, catalogue, catégories, recherche, page jeu et iframe sans compte.
- Inscription, confirmation, login, Google, callback, logout.
- Reset : email reçu, mauvais code, expiration, quotas, succès, code non réutilisable.
- Profils, annuaire, dashboard, avatar ; historique, favoris, avis, réactions.
- Admin refusé aux visiteurs ; lecture/modification autorisées aux admins.
- Upload miniature raster et SVG statique ; aucun remplacement des anciens fichiers.
- Publier un jeu, lecture admin, notes et changement de statut.
- Sitemap, manifest, robots, canonical, en-tête noindex et assets JS/CSS.
- Mobile/responsive, scripts Analytics/AdSense, anciennes miniatures et jeux.
- Vérifier les logs Workers et Resend sans y écrire des codes, tokens ou secrets.

Fallback : conserver le déploiement et domaine Vercel. En cas de panne de preview,
arrêter/retirer uniquement le Worker de preview et retirer ses Redirect URLs temporaires.
Ne pas annuler les migrations Supabase Phase 0.

## DNS

AUCUNE MODIFICATION DNS EFFECTUÉE.
Pas de changement IONOS, nameservers, domaine Vercel ou domaine principal.
La bascule DNS constitue une phase ultérieure, après validation complète.

## Vérification locale du 7 octobre 2026

- Base Git initiale propre, commit Phase 0 `75dd5fd`.
- Lint : succès, quatre avertissements de navigation détectés par la nouvelle règle Next.
- Tests : 13 réussis (9 Phase 0 + 4 compatibilité/sécurité Cloudflare).
- Build Next.js classique et build OpenNext : succès.
- Preview workerd : 20 contrôles HTTP réussis, dont catalogue réel et détail d'un jeu,
  pages publiques, assets, SEO, accès admin anonyme refusé et validation des API.
- Dry-run Wrangler : succès ; bundle gzip 2001,88 Kio ; aucun upload effectué.
- Recherche des valeurs privées locales : aucune dans les assets publics ni le bundle
  déployable ; le fallback d'environnement généré ne contient que des clés publiques.
- Aucun appel d'écriture métier ni email réel déclenché lors des smoke tests.
- Reset/Resend réel non testé : leurs trois variables sont absentes localement.
- Auth Cloudflare expirée et non renouvelable en session non interactive : déploiement
  distant non effectué. Connexion utilisateur nécessaire.
- `npm audit` signale encore 18 entrées (13 high, 4 moderate, 1 low), notamment
  des dépendances transitives de build/CLI et de Resend. Aucun `audit fix --force`
  ni changement majeur automatique appliqué. Ce relevé n'est pas une affirmation
  d'exploitabilité des parcours déployés et nécessite un triage distinct.
