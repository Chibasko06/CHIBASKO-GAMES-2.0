# Artifact Gateway production

La configuration dédiée est `cloudflare/wrangler.artifacts.production.jsonc`.
Elle cible le Worker existant `chibasko-game-artifact-gateway` et son entrée
`cloudflare/artifact-gateway.ts`. Wrangler compile directement cette entrée et
ses imports : gateway universel, adapter R2 natif en streaming et repository RPC
Supabase. Aucun build Next/OpenNext ni copie simplifiée du gateway n'est utilisé.
Le fichier `wrangler.jsonc` du portail reste indépendant.

## Bindings et configuration

| Nom | Valeur / provenance | Gestion |
| --- | --- | --- |
| `ARTIFACTS` | Bucket privé existant `chibasko-game-artifacts` | Binding R2 versionné |
| `SUPABASE_URL` | URL du projet production déjà configurée sur le Worker | Variable distante conservée |
| `SUPABASE_SERVICE_ROLE_KEY` | Credential backend du même projet, déjà configurée | Secret Cloudflare, jamais dans Git |
| `GAME_CONTENT_PUBLIC_BASE` | `chibaskogames-play.fr` | Variable versionnée |
| `GAME_CONTENT_PREVIEW_BASE` | `chibaskogames-play.fr` | Variable versionnée |
| `GAME_CONTENT_BASE_DOMAIN` | `chibaskogames-play.fr` | Variable versionnée |
| `GAME_PORTAL_ORIGINS` | `https://chibaskogames.fr,https://www.chibaskogames.fr` | Origines exactes, sans slash final |
| `GAME_ARTIFACT_GATEWAY_ENABLED` | `1` dans la configuration production | Flag versionné |

`keep_vars: true` conserve les variables distantes absentes du fichier, notamment
SUPABASE_URL. Les variables explicitement versionnées sont appliquées au déploiement :
un changement du flag uniquement dans le dashboard ne remplace pas la configuration
de release. Si la service-role key a été créée comme variable texte, la convertir
en secret Cloudflare avant activation, sans en copier la valeur dans un fichier.
Aucune credential S3, bucket staging ni binding OpenNext n'est nécessaire.

La route existante `*.chibaskogames-play.fr/*` est déclarée sur sa zone. Il s'agit
d'une route Worker, pas d'un Custom Domain wildcard à créer. Vérifier le compte
Cloudflare ciblé, le DNS wildcard proxifié et la couverture TLS réelle.
Les URL workers.dev et les URL de preview Wrangler sont désactivées.

Le Cron Trigger de quinze minutes reprend le handler existant de nettoyage des
previews et launches. Il ne travaille que lorsque le flag vaut `1`. Le
déploiement synchronise aussi ce trigger. Les logs d'invocation et les traces automatiques sont désactivés ;
seuls les logs structurés expurgés du gateway sont activés. Vérifier également
les règles de logs/analytics de zone qui pourraient enregistrer les capabilities.

## Isolation sans PRIVATE PSL

La PRIVATE PSL est un durcissement futur facultatif, pas un prérequis d'activation.
La base doit être un domaine enregistrable distinct du site de chaque origine portail
autorisée (ou une frontière PRIVATE PSL déjà reconnue). `chibaskogames-play.fr` satisfait
ce contrat sans inscription privée. Le flag production est configuré à `1`.

Le Worker exige une base de lancement et n'accepte que `l-<48 hex>.<base>`.
Chaque capability de 192 bits est créée aléatoirement et autorisée en base par son
hash, avec expiration/révocation et droits sur une version exacte. Les cookies entrants
ne sont jamais utilisés pour cette décision. Aucun chemin de ce Worker ne crée de cookie.
Les hosts `v-`, `p-`, l'apex et les sous-domaines supplémentaires sont refusés.
Les previews utilisent les launches autorisées existantes, comme les versions publiées.
L'ancien échange top-level par cookie reste réservé au gateway historique sans base de
lancement ; il n'est pas accessible depuis ce Worker de production.

Deux launches restent des origines distinctes, mais sont same-site sans PRIVATE PSL.
Un jeu peut poser un cookie `Domain=chibaskogames-play.fr` lisible par un autre jeu :
ce stockage ne doit contenir aucune identité ou donnée sensible. Le Gateway l'ignore.
Cette garantie n'est donc pas une isolation de cookies, de processus navigateur ou de
disponibilité : du cookie bombing peut nécessiter une protection amont. La sandbox CSP
et iframe, Origin-Agent-Cluster, CORP same-origin et la validation exacte du bridge
conservent l'isolation DOM/stockages par origine et empêchent le relâchement document.domain.
Les Service Workers restent refusés. Le domaine principal n'est jamais un site frère.

Toutes les réponses de lancement, erreurs comprises, sont private/no-store avec
CDN-Cache-Control et Cloudflare-CDN-Cache-Control no-store. Aucun Cache API ni clé
partagée n'est utilisé : chaque requête réautorise son propre hostname. Ne configurer
aucune règle Cloudflare forçant le cache ou supprimant l'hôte de la clé. L'accès R2
reste limité au prefix client validé ; archives, inventory et staging restent exclus.
Les capabilities de hostname sont sensibles et doivent rester absentes des logs amont.

Contrôles de déploiement :

1. Vérifier le domaine dédié, les origines portail exactes et l'absence de règle
   CDN forçant le cache ; tester que les cookies parent-domain n'autorisent aucun accès.
2. Vérifier le drift SQL et appliquer séparément les migrations requises par les
   versions, policies, previews, launches et renouvellements. Le fichier de configuration
   n'applique aucune migration ; une variable Supabase présente ne prouve pas les RPC.
3. Vérifier le secret backend, le binding R2, les objets validés et leurs métadonnées
   SHA-256, les lignes game_versions et leurs prefixes immuables.
4. Aligner les quatre variables domaine/origines du portail avec ce Worker lors de
   l'activation du runtime.
5. Valider DNS/TLS, réponses HEAD/Range, preview autorisée, version publiée, expiration
   et refus service worker sur une recette réelle.
6. Vérifier le flag versionné à `1` avant le déploiement.

Avec le flag à `0`, le Worker répond 503/no-store et son cron reste inactif. Le domaine,
la route, le bucket et les variables distantes sont déclarés existants ; leur état
effectif n'est pas certifié par une compilation locale.

## Commandes

Depuis la racine du dépôt, après installation des dépendances verrouillées :

```powershell
$env:CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
$env:WRANGLER_SEND_METRICS = 'false'
npx --no-install wrangler deploy --config cloudflare/wrangler.artifacts.production.jsonc --dry-run --outdir .distribution/gateway-production
npm run test:game-artifacts
```

Le preflight existant contrôle les noms de configuration et la séparation des domaines avec les variables
déjà gérées dans le shell, sans afficher leurs valeurs ni lire le dashboard :

```text
node scripts/production-preflight.mjs --component=gateway
```

Commande de déploiement, avec une authentification Wrangler autorisée sur
le compte contenant le Worker et la zone :

```text
npx --no-install wrangler deploy --config cloudflare/wrangler.artifacts.production.jsonc
```

Ne pas utiliser `npm run deploy:cloudflare` pour ce Worker : cette commande cible
le portail. Le flag à `1` activera le Gateway et son nettoyage planifié au prochain
déploiement.

Référence : [configuration Wrangler](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Validation locale du 18 octobre 2026

Relevé du 18 octobre : 26 tests gateway/runtime, quatre tests preflight
et 17 tests Chrome réussis. Le test navigateur constate qu'un cookie parent
est effectivement partagé, puis vérifie qu'il n'autorise pas une launch révoquée et
que localStorage reste séparé. TypeScript est validé. Le dry-run Wrangler produit
237,55 KiB (gzip 64,22 KiB).
Le dry-run ne vérifie pas la présence distante des secrets, la DB, les objets R2,
le DNS ou TLS. La configuration versionnée utilise le flag `1`.
