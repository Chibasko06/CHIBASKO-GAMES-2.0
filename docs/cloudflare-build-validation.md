# Validation du build Cloudflare

## Pipeline de production

La commande du dépôt est :

```sh
npm run deploy:cloudflare
```

Elle enchaîne `npm run build:cloudflare` puis
`node scripts/cloudflare.mjs deploy`. Le second appel ajoute `--keep-vars`.
La commande build-only équivalente à la première étape est :

```sh
npm run build:cloudflare
```

`scripts/cloudflare.mjs` définit CHIBASKO_CLOUDFLARE=1 et lance le CLI OpenNext
installé, sans changement de bundler. OpenNext active le standalone et le tracing,
puis exécute `npm run build`, qui termine par `next build` : Turbopack est donc le
bundler par défaut avec Next 16.3.8. OpenNext transforme ensuite les sorties Next,
génère `.open-next/worker.js`, le middleware et les assets. Le script du dépôt
supprime enfin les valeurs privées du module de repli next-env.mjs ; seules les
variables NEXT_PUBLIC_ y restent.

Wrangler utilise `cloudflare/worker.mjs`, qui importe `.open-next/worker.js` et
applique le wrapper de hostname existant. Le nom du Worker reste
chibasko-games-preview, avec les domaines publics et l’accès workers.dev déclarés
dans wrangler.jsonc. Les assets sont servis par le binding ASSETS depuis
.open-next/assets. Ni les routes, ni les bindings, ni le wrapper SEO ne sont
modifiés par cette validation.

La configuration distante des commandes Workers Builds n’est pas versionnée
dans ce dépôt. Ce document décrit le pipeline npm prévu ; comparer les commandes
affichées dans le dashboard avant une promotion. Aucune CI GitHub Actions n’est
présente dans le dépôt au moment du contrôle.

## Diagnostic constaté le 22 octobre 2026

Versions installées : Node 24.14.0, Next 16.3.8, @opennextjs/cloudflare 1.20.9,
@opennextjs/aws 4.1.8, Wrangler 4.148.0.

### Turbopack sous Windows

La commande build-only complète a été reproduite hors sandbox. Elle échoue avant
le bundling OpenNext lors du traitement PostCSS de app/globals.css :

```text
creating new process
node process exited before we could connect to it with exit code: 0
```

Le sous-processus Node lancé par Turbopack se termine avant sa connexion IPC.
La trace ne rapporte aucune erreur de syntaxe CSS ou TypeScript et ne permet pas
d’identifier plus précisément la cause interne de cette sortie. Webpack compile
les mêmes sources avec succès. L’échec est reproduit sur ce poste Windows ; son
absence sous Linux n’est pas démontrée sans exécution Linux. OpenNext avertit
explicitement de sa compatibilité Windows partielle.

### ENOENT middleware.js.nft.json

Le diagnostic « fichier source non généré » est incorrect pour le build Webpack
observé. Après celui-ci :

```text
.next/server/middleware.js                         présent
.next/server/middleware.js.nft.json                présent
.next/standalone                                  absent
required-server-files.json : config.output        non défini
```

L’appel OpenNext `copyTracedFiles()` tente une copie depuis la trace présente vers
`.next/standalone/.next/server/middleware.js.nft.json`. Le répertoire de destination
absent provoque ENOENT ; le message copyfile affiche les deux chemins et ne prouve
pas que la source manque.

La tentative séparée `npm run build -- --webpack` puis OpenNext --skipNextBuild
avait contourné `setStandaloneBuildMode()`. Cette fonction définit normalement
NEXT_PRIVATE_STANDALONE=true et NEXT_PRIVATE_OUTPUT_TRACE_ROOT avant la compilation
Next. --skipNextBuild ne transforme pas un build Next ordinaire en standalone.

Next 16 conserve le contrat de sortie middleware : avec Webpack, son build renomme
proxy.js et proxy.js.nft.json en middleware.js et middleware.js.nft.json. Le
functions-config-manifest déclare /_middleware en runtime nodejs, avec le matcher
/admin/:path*. L’absence d’entrée edge dans middleware-manifest est normale.
Le dépôt utilise proxy.ts, sans instrumentation ni option désactivant le tracing.
Les headers SEO et la configuration des images n’expliquent pas cette erreur.

### Preuve par compilation diagnostique

Sans modifier les sources ou next.config.ts, ce contrôle PowerShell prépare les
mêmes paramètres standalone que l’adaptateur, tout en isolant le crash Turbopack :

```powershell
$env:CHIBASKO_CLOUDFLARE = '1'
$env:NEXT_PRIVATE_STANDALONE = 'true'
$env:NEXT_PRIVATE_OUTPUT_TRACE_ROOT = (Get-Location).Path
npm run build -- --webpack
if ($LASTEXITCODE -ne 0) { throw 'Next build failed' }
npm run build:cloudflare -- --skipNextBuild
if ($LASTEXITCODE -ne 0) { throw 'OpenNext build failed' }
```

Résultat : config.output vaut standalone, la trace source et le middleware
standalone sont présents, le bundling middleware/serveur/assets réussit et
OpenNext annonce « Worker saved » puis « OpenNext build complete ».
Aucun fichier de tracing n’a été créé, renommé ou copié manuellement.
Ces variables privées sont un outil de diagnostic, pas un changement permanent
du pipeline de production.

## Artefact contrôlé

La compilation diagnostique a produit :

| Sortie | Taille constatée |
| --- | ---: |
| .open-next/worker.js | 2 278 octets |
| .open-next/middleware/handler.mjs | 2 580 064 octets |
| .open-next/server-functions/default/handler.mjs | 6 386 989 octets |
| .open-next/assets/ads.txt | 59 octets, identique à public/ads.txt |

Le vrai point d’entrée et sa configuration ont ensuite été compilés localement :

```sh
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config wrangler.jsonc --outdir .distribution/cloudflare-build-validation
```

Résultat : code de sortie 0, 239 assets, bundle total 11 430,96 KiB, gzip
2 705,25 KiB, puis « --dry-run: exiting now ». Le fichier wrapper, le serveur,
le middleware et les bindings sont pris en compte. La commande ne déploie aucun
Worker et ne crée aucune ressource. Le contrôle next-env confirme que ses exports
ne contiennent que des noms NEXT_PUBLIC_.

Cette preuve valide l’artefact Webpack/standalone. Elle ne valide pas par
substitution le chemin Turbopack par défaut ni l’exécution Linux de ce dernier.
Le support du middleware Node dans cette version OpenNext reste expérimental ;
les contrôles d’autorisation admin ne sont ni supprimés ni déplacés.

## Recette Linux / WSL / CI

Aucune distribution WSL ni runtime Docker n’est disponible sur le poste du
diagnostic. Aucun test Linux n’a été exécuté ; aucun succès Linux n’est annoncé.

Utiliser Node 24.14.0 et un filesystem Linux. Ne pas réutiliser les node_modules,
.next ou .open-next Windows. Pour tester les changements non commités, copier
le working tree plutôt que cloner une ancienne révision :

```sh
mkdir -p "$HOME/src/chibasko-games-cloudflare-audit"
rsync -a \
  --exclude=node_modules --exclude=.next --exclude=.open-next \
  --exclude=.distribution --exclude=.wrangler --exclude=.git --exclude='.env*' \
  /mnt/c/Users/chiba/ChibaskoGames/CHIBASKO-GAMES-2.0/ \
  "$HOME/src/chibasko-games-cloudflare-audit/"
cd "$HOME/src/chibasko-games-cloudflare-audit"
node --version
npm ci
```

Sur une CI Linux, utiliser le checkout de la révision à valider dans un workspace
neuf ; aucune clé Cloudflare ou service_role n’est nécessaire au build-only.
Les trois paramètres publics utilisés à la compilation sont
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et NEXT_PUBLIC_SITE_URL.
Ils peuvent venir de l’environnement CI ou d’un fichier local ignoré.
Pour cette copie isolée, les reprendre directement depuis les vars versionnées,
sans copier de secrets de développement :

```sh
node --input-type=module <<'NODE'
import {readFileSync, writeFileSync} from 'node:fs';
const {vars} = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const lines = Object.entries(vars)
  .filter(([name]) => name.startsWith('NEXT_PUBLIC_'))
  .map(([name, value]) => `${name}=${JSON.stringify(value)}`);
writeFileSync('.env.production.local', lines.join('\n')+'\n', {flag:'wx', mode:0o600});
NODE
```

Le flag wx refuse d’écraser une configuration locale déjà présente.
Exécuter ensuite le chemin de production sans override Webpack et sans skip :

```sh
npm run build:cloudflare
test -s .open-next/worker.js
test -s .open-next/middleware/handler.mjs
test -s .open-next/server-functions/default/handler.mjs
cmp public/ads.txt .open-next/assets/ads.txt
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config wrangler.jsonc --outdir .distribution/cloudflare-build-validation
```

Ne pas exécuter npm run deploy:cloudflare pour cette recette. Conserver les logs
du build-only et du dry-run. Leur succès sous Linux lève la vérification restante
du pipeline par défaut. En cas d’échec, conserver la trace exacte avant toute
modification de version ou du proxy ; ne pas fabriquer de .nft.json et ne pas
retirer les protections admin.

Références :

- https://opennext.js.org/cloudflare
- node_modules/@opennextjs/aws/dist/build/buildNextApp.js
- node_modules/@opennextjs/aws/dist/build/copyTracedFiles.js
- node_modules/@opennextjs/cloudflare/dist/cli/build/build.js
- node_modules/next/dist/build/index.js
