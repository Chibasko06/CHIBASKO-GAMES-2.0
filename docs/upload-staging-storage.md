# Stockage des uploads dans le portail

Le service conserve le port `StagingStorage`. La session autorisée en base fournit
la clé staging et le transport, jamais un chemin libre envoyé par le navigateur.

## Cloudflare Workers

Le Worker `chibasko-games-preview` utilise le binding R2 privé
`GAME_BUILDS_STAGING` vers `chibasko-game-staging`, déclaré dans `wrangler.jsonc`.
`CHIBASKO_ASSETS` reste indépendant. Le Gateway et son binding `ARTIFACTS` ne
sont pas concernés.

`NativeStagingR2` utilise le binding pour créer, compléter et abandonner un
multipart, lire les métadonnées et supprimer un objet. L’ETag HTTP cité est
conservé pour la validation ultérieure du ZIP. Les ETag des parties S3 sont
normalisés avant `complete()` natif.

L’API R2 Workers n’expose pas `ListParts` ni de signature d’URL S3. Le même
adaptateur délègue ces deux opérations à `DistributionR2`. Le ZIP reste envoyé
directement par le navigateur à R2, sans proxy Next.js, avec des URLs temporaires.
Les credentials restent exclusivement côté serveur. Une configuration Worker
sans binding échoue explicitement, sans fallback S3 silencieux.

Ces variables restent donc nécessaires au Worker **et** aux outils Node :

- `GAME_BUILDS_R2_ACCOUNT_ID` : configuration serveur.
- `GAME_BUILDS_R2_ACCESS_KEY_ID` : secret serveur.
- `GAME_BUILDS_R2_SECRET_ACCESS_KEY` : secret serveur.
- `GAME_BUILDS_STAGING_BUCKET=chibasko-game-staging` : configuration serveur.

Le bucket indiqué pour S3 doit être celui du binding. Les outils de validation
Node conservent leur configuration artifacts et leur adaptateur S3 intégral.
Le binding ne remplace pas les credentials utilisés pour les URLs présignées.
Une URL S3 présignée contient l’identifiant d’accès dans `X-Amz-Credential`
et une signature temporaire limitée à la partie ; elle ne contient jamais la
clé secrète. Aucun credential brut ni configuration S3 complète n’est ajouté
aux réponses JSON. Masquer aussi cet identifiant demanderait de remplacer
l’envoi S3 direct par un autre transport, hors de ce contrat.

Référence : [API Workers R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
Les multipart créés par binding sont utilisables depuis S3 et réciproquement.

## Erreur de création S3 dans workerd

`redirect: "error"` n’est pas pris en charge par workerd. L’ancien fetch S3
levait `TypeError: Invalid redirect value` avant de recevoir une réponse R2 ;
le catch le classait `network_error`. L’adaptateur utilise désormais `manual`.
Les réponses 3xx sont rejetées par le contrôle HTTP existant et ne sont jamais
suivies avec les en-têtes signés. Les autres erreurs réseau restent distinctes
des refus HTTP. Les erreurs du binding produisent `binding_error` avec l’action
concernée, sans message brut, clé d’objet, credential ou URL signée.

## Activation après livraison du code

1. Workers & Pages → `chibasko-games-preview` → Bindings → Add binding → R2 bucket.
2. Nom : `GAME_BUILDS_STAGING`. Bucket : `chibasko-game-staging`. Conserver les
   autres bindings ; la déclaration Wrangler doit rester identique au dashboard.
3. Settings → Variables and Secrets : vérifier les quatre noms ci-dessus,
   les paramètres Supabase existants et `GAME_DISTRIBUTION_UPLOADS_ENABLED=1`.
4. R2 → `chibasko-game-staging` → Settings → CORS : vérifier les origines
   exactes autorisées du portail, les PUT et les en-têtes signés. Ne pas rendre
   le bucket public et ne pas activer son domaine r2.dev.
5. Une fois le binding effectif sur la version livrée, reprendre un upload connu
   avec la même clé d’idempotence et le même ZIP. Vérifier création, liste des
   parties, PUT direct, reprise et finalisation. Aucun nouveau gameId requis.

Si l’intégration Git déploie automatiquement au push, préparer le binding avant
la livraison ou vérifier sa présence immédiatement sur la version livrée.
Wrangler le conserve également lors du processus de déploiement CLI existant.

## Tests locaux

- `npm run test:game-uploads` : contrats, autorisations, erreurs et binding simulé.
- `npm run test:r2-worker` : workerd réel avec R2 local, reproduction du mode
  redirect rejeté, multipart natif, signature S3, reprise/ETag et suppression.
  Aucun bucket, token ou appel réseau de production n’est utilisé.
