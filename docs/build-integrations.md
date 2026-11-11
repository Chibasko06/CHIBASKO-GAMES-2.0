# Jeux classiques, SDK et preuves de validation

## Qualification locale

| Contrôle | Résultat |
|---|---|
| Suite applicative complète | 401 réussis, aucun échec ou test ignoré |
| Suite ciblée du workflow | 63 réussis |
| Autorisations administratives et routes de revue | 21 réussis |
| Tests Chrome du lecteur | 25 réussis, dont SDK npm réel et SDK masqué statiquement |
| Tests Chrome de l'administration | 8 réussis, desktop/mobile |
| PostgreSQL jetable, migrations et circuit complet | PASS |
| Contrat de schéma et préflight local | PASS |
| TypeScript | PASS |
| ESLint | Aucune erreur, 3 avertissements préexistants |
| Build Next.js/OpenNext sous Linux | PASS |
| Dry-run du portail et démarrage local du Worker | PASS, services simulés |
| Dry-run du Gateway existant | PASS |
| `git diff --check` | PASS |

Les suites se recouvrent et ne s'additionnent pas en tests distincts. Les tests
navigateur interceptent toutes les requêtes. Le SDK réellement exécuté dans ces
fixtures est le package 0.3.0 déjà installé par le portail ; cela ne prétend pas
qualifier chaque version npm. Les versions du package et du protocole restent
inchangées. Aucun test n'a utilisé la production ou l'archive de One more day.

Le circuit de diagnostic existait déjà. Ce lot ajoute la preuve d'intégration
complète sur PostgreSQL réel, le code stable dans la sortie CLI ordinaire, les
modes explicites, les indices statiques bornés et les observations de lecteur
privées. Il corrige l'obligation implicite de dialogue SDK pour les nouveaux
jeux déclarés classiques. Les corrections des lots précédents sont conservées.

Les principaux fichiers concernés sont le schéma de manifeste et son validateur
généré, `gateway/resolver.ts`, `game-runtime/{controller,bridge,contracts}.ts`,
`GameRuntime.tsx`, `admin/BuildReviews.tsx`, `server/adminBuilds.ts`, le parseur et
le job du validateur. Les nouveaux fichiers `integration.ts`,
`integration-scan.ts`, `build-integrations.test.mjs` et
`build-review-pipeline-db.mjs` portent les contrats et leurs qualifications.
Le registre et le contrat de schéma sont synchronisés avec la migration additive.

Verdict A pour la qualification locale. Restent à effectuer, après autorisation,
la migration additive, les déploiements coordonnés et des tests contrôlés avec
des builds dédiés. Ni la version réelle d'un SDK soumis ni sa provenance npm ne
sont attestables par le protocole actuel. L'absence absolue de code SDK n'est
jamais annoncée comme prouvée.

## Deux modes de distribution

Un jeu HTML5 classique n'a pas besoin du SDK. Il fournit néanmoins un manifeste
complet à la racine de son ZIP :

```json
{
  "schemaVersion": 1,
  "gameId": "11111111-1111-4111-8111-111111111111",
  "version": "1.0.0",
  "integrationVersion": 1,
  "integration": {"mode": "classic"},
  "capabilities": {"local": {"players": {"min": 1, "max": 1}}},
  "client": {"entrypoints": {"local": "index.html"}}
}
```

Le gameId est attribué au jeu par Chibasko Games. Les autres règles de manifeste,
de chemins, de tailles et de sécurité restent applicables. `integrationVersion`
décrit le contrat de distribution, pas la version npm du SDK.

Le lecteur classique conserve l'iframe isolée, l'origine distincte, la session de
lancement, son expiration, les contrôles d'accès aux artefacts et le bouton de
sortie. Il ne crée pas de bridge et n'attend pas de message SDK. Le chargement du
document retire l'indicateur d'attente ; cela ne certifie pas son gameplay. Le son
et la pause internes restent sous le contrôle du jeu. Il n'est pas possible de
déclarer le multijoueur avec admission Chibasko Games dans ce mode.

Une intégration SDK explicite utilise :

```json
"integration": {"mode": "sdk", "sdkVersion": "0.4.2"}
```

`sdkVersion` est facultatif et déclaratif. Le lecteur exige toujours le dialogue
d'initialisation sécurisé et conserve les délais existants. Les fonctionnalités
audio, lancement, pause/reprise et admission multijoueur restent conditionnées aux
contrats correspondants. Un SDK embarqué mais jamais initialisé ne suffit pas.

Les anciens manifestes sans `integration` ne sont pas modifiés. Ils gardent leur
lecteur avec bridge et leurs règles de publication précédentes. Les jeux legacy
servis par leur lecteur historique sont également inchangés. Le nouveau champ
ne s'ajoute pas automatiquement à un ancien build.

Les outils publics du SDK déjà publiés ne sont pas modifiés. Un ancien outil qui
embarque un schéma strict peut refuser ce nouveau champ ; utiliser le validateur
local du portail pour les ZIP classiques jusqu'à une évolution qualifiée des
outils publics. Aucun starter ni gestionnaire de paquets n'est requis pour un ZIP
HTML5 classique.

## Ce que signifie le statut affiché

L'administration affiche une seule synthèse et des détails repliés :

| État | Preuve disponible | Limite |
|---|---|---|
| HTML5 classique — déclaré, test non effectué | Manifeste valide avec `mode=classic` | Le jeu n'a pas été testé |
| HTML5 classique — chargement observé, sans SDK requis | Document chargé dans le lecteur classique pendant une session de revue | Pas une preuve d'absence de code SDK ni de fonctionnement complet |
| SDK Chibasko Games — dialogue confirmé, version indéterminée | HELLO/INIT/READY valide lié à la bonne iframe et à la session courante | Protocole opérationnel, pas attestation du package npm |
| Indéterminée — initialisation SDK non observée | Pas d'observation persistée | Ni présence ni absence démontrée |

L'analyse statique conserve uniquement des booléens et un nombre d'octets. Elle
examine au plus 1 Mio par fichier HTML/JS et 8 Mio par archive, en flux, sans
exécution. Un marqueur du SDK reste un indice. Un résultat négatif ne démontre
jamais l'absence du SDK ; une analyse tronquée est explicitement signalée.
Un SDK transformé, chargé depuis un blob ou non analysable peut fonctionner sans
produire de marqueur reconnaissable.

Le protocole actuel ne transmet pas une version authentifiée du package. Le
numéro du bridge n'est pas une version de SDK. Une chaîne déclarée par le jeu ou
trouvée dans un commentaire ne justifie donc pas « version confirmée ».
Une implémentation indépendante peut parler le même protocole : le dialogue ne
prouve pas que les octets proviennent d'un package npm précis. Aucune promesse
inverse n'est faite dans l'interface.

## Recueil et conservation

Les observations proviennent du contrôleur du lecteur. Pour le SDK, elles sont
émises après validation de l'origine, de la fenêtre source, du schéma, du
documentId, du launchId et de sa génération. Un message arbitraire envoyé à la
Navbar ou depuis une autre iframe ne constitue pas une observation.

Le portail transmet l'observation par une route réservée aux administrateurs.
PostgreSQL vérifie aussi `admin_users`, la version de l'upload, le mode du
manifeste, l'administrateur ayant ouvert le lancement, sa génération, sa date
d'expiration, sa révocation et le hash du token de contrôle. Ce token reste dans
le parent et n'est jamais journalisé. Un développeur ou un invité ne peut pas
inscrire une confirmation administrative. L'administrateur et le code du portail
restent la limite de confiance : il ne s'agit pas d'une attestation matérielle.

Le journal privé `game_build_review_events` conserve les indices et les
observations, sans nouvelle table ou service. Les écritures sont idempotentes.
L'analyse est protégée par la lease de validation ; l'observation par la session
de lancement. Les réponses publiques et développeur n'exposent pas ces événements.
La conservation suit le journal existant ; aucun nouveau contenu du jeu, e-mail
ou secret n'y est copié.

Pour un nouveau manifeste déclarant son mode, PostgreSQL refuse la publication
tant qu'une observation correspondante n'a pas été enregistrée. Cette condition
s'ajoute à la revue humaine existante ; elle ne remplace pas les contrôles de
contenu ni le test du jeu. Les anciennes soumissions gardent leurs règles.
Un contrôle `service_role` direct reste privilégié : cette clé doit rester limitée
aux composants serveur autorisés.

## Diagnostic dès la première tentative

Le test `build-review-pipeline-db.mjs`, exécuté par la qualification du schéma,
fait passer de vrais ZIP de fixtures dans le vrai processus enfant isolé. Il
utilise le parent compilé et la commande de revue, les RPC et tables d'un
PostgreSQL jetable, le véritable handler admin puis le composant de diagnostic.
Le transport R2 et Auth est simulé ; aucun projet distant n'est utilisé.

Il vérifie dès la tentative 1 :

- `_headers` : `FORBIDDEN_ARTIFACT_FILE`, fichier et correction ;
- manifeste incomplet : `INVALID_MANIFEST_SCHEMA`, champ `/schemaVersion` ;
- processus enfant indisponible : catégorie interne et motif `EXTRACTOR_EXITED` ;
- ZIP classique valide : version créée sans SDK et indices négatifs non conclusifs.

Les motifs connus sont conservés atomiquement avec l'échec et affichés par la
commande sous forme de code, phase, fichier/champ et action. La date et le numéro
de tentative restent consultables. Une panne totale de PostgreSQL peut empêcher
la persistance ; le programme ne prétend pas avoir conservé un diagnostic dans
ce cas. Les anciens échecs sans information restent indéterminés, sans retraitement
automatique. Aucun test n'utilise One more day.

## Coût et déploiement

Pas de polling, nouveau Worker, cron, dépendance ou secret. Une validation ajoute
une RPC d'enregistrement du scan. Le détail administratif ajoute une lecture
privée ciblée. Une observation ajoute un POST administratif contenant une écriture
puis une lecture ciblée. Rien n'est ajouté à la consultation ordinaire d'un jeu ;
le mode classique n'ouvre pas de heartbeat SDK.

Ordre après validation et autorisation :

1. Appliquer uniquement `20261110000300_build_integrations.sql`, après le workflow
   de revue déjà installé. Ne pas réappliquer ses migrations historiques.
2. Vérifier les signatures et EXECUTE : fonctions réservées à service_role,
   aucun droit anon/authenticated, RLS et droits du journal inchangés.
3. Déployer le Gateway existant avec le nouveau schéma de manifeste. L'ancien
   Gateway refuserait le champ additionnel ; les anciens builds restent acceptés.
4. Déployer le portail, puis mettre à jour le validateur local avec le même code.
   Garder le dispatcher automatique désactivé. Les bindings, domaines et secrets
   restent inchangés.
5. Qualifier de nouveaux builds dédiés, classique et SDK, sans modifier les
   soumissions existantes. Vérifier observation, refus avant test et publication
   après revue explicite.

La migration ne modifie aucune version ni décision existante. Elle conserve la
signature de `distribution_review_action` en déléguant ses opérations historiques
à une fonction core privée. La condition supplémentaire vise uniquement les
manifestes déclarant explicitement leur mode. Les autres nouvelles RPC sont
additives.

En cas de retour arrière, arrêter les nouveaux dépôts utilisant `integration` et
laisser SQL en place. Ne pas revenir à un Gateway ou un portail incapable de lire
les nouveaux manifestes tant que des jeux correspondants sont publiés. Ne pas
retirer le champ d'un artefact immuable ni effacer son historique pour contourner
ce problème. Un retour de code doit conserver la lecture de cette extension.
