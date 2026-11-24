# Interface de l’Espace développeur

## Navigation et pages

L’accès principal se trouve dans « Mon compte », sur ordinateur et dans le menu de compte mobile. Le lien secondaire du Dashboard est conservé. L’espace possède une navigation latérale avec état actif ; sur téléphone, ses cinq entrées sont visibles dans une grille. Le diagnostic d’un build reste rattaché à « Mes soumissions ».

| Écran | Contenu |
| --- | --- |
| Vue d’ensemble | Nombre de projets, visibilité actuelle, corrections, brouillons à reprendre et derniers dépôts |
| Mes jeux | Bibliothèque visuelle, recherche et filtre de statut, liens vers les fiches permanentes |
| Fiche du jeu | Visibilité séparée des décisions, versions exactes, motifs, historique repliable et actions de correction existantes |
| Mes soumissions | Suivi ZIP ou URL, filtres de revue, prochaine action et accès au diagnostic ; identifiants secondaires repliés |
| Statistiques | Totaux actuels par jeu, sélection du jeu, période des dépôts et répartition mensuelle des dépôts datés |
| Ressources | Préparation, intégration facultative du SDK, tests, documentation et support développeur |
| Diagnostic du build | État de la tentative, diagnostic et prévisualisation privée existante, sans modification des permissions du lecteur |

Les dates utilisent `Intl.DateTimeFormat` en français et le fuseau `Europe/Paris`. Une date invalide n’est jamais affichée comme `Invalid Date`. Une version acceptée n’est pas présentée comme un jeu public. Les couleurs accompagnent toujours un libellé explicite.

## Données, limites et sécurité

Les API, RPC, permissions SQL, décisions et historiques sont inchangés. La correction réutilise le même dossier et son ancien build ; le lien de mise à jour conserve désormais explicitement le `gameId` dans Mes soumissions également. Les doubles clics restent bloqués et la confirmation précède l’écriture.

Les composants sont recréés au changement d’utilisateur ou de jeton. Les requêtes interrompues ne réinjectent pas de données dans le compte suivant. La prévisualisation externe garde son lecteur strict et n’est montée dans le dossier qu’après ouverture du volet correspondant. Aucun code tiers n’est exécuté par les tests UX.

Les couvertures des jeux publiés sont lues depuis `games`, dans une requête publique groupée limitée aux identifiants déjà autorisés par le workspace, avec `is_published=true` et les RLS existantes. Les couvertures des brouillons proviennent du lecteur privé de brouillons existant. Une image indisponible ou non chargée utilise un visuel neutre, sans annoncer à tort l’absence de couverture. Le chargement privé des couvertures utilise les 50 premiers brouillons ; une couverture plus ancienne peut donc rester neutre. Aucun accès privé supplémentaire n’est accordé pour les images.

La bibliothèque et les soumissions gardent leur pagination et indiquent que leurs filtres portent sur la page. La synthèse et les statistiques agrègent au maximum 500 projets accessibles ; un avertissement est affiché si cette limite est atteinte. Les erreurs de chargement ne sont pas converties en statistiques nulles.

### Statistiques

- Consultations de fiches, favoris et avis : totaux actuels du workspace. Ils ne sont pas filtrables rétroactivement par période, car aucune série d’audience datée n’est disponible.
- Dépôts : dates existantes des 50 derniers builds ZIP et 50 dernières révisions URL. Le filtre de période et le graphique mensuel portent uniquement sur ces dépôts. Les périodes anciennes peuvent être incomplètes, ce qui est indiqué à côté du graphique.
- Aucun nombre de joueurs, parties, durée, revenu ou rétention n’est estimé. Aucune instrumentation nouvelle n’est ajoutée.

### Confirmation e-mail

L’inscription appelle déjà Supabase Auth `signUp`, avec le callback existant ; sans session immédiate, elle invite à confirmer l’adresse reçue par e-mail. Ce parcours n’est pas remplacé et aucun nouveau circuit d’envoi n’est ajouté.

Dans l’espace connecté, l’avertissement repose sur la vérification professionnelle retournée par le serveur. Le suivi reste accessible ; le profil permet de demander et confirmer son code. L’affichage n’accorde aucun droit.

Les nouveaux événements utilisent uniquement l’adresse professionnelle vérifiée. Les messages historiques sont conservés sans réémission ; les alertes internes restent inchangées. Voir [le contrat actuel](developer-professional-email.md).

Les flags de notification restent à `0`. L’interface ne promet ni activation ni réception effective d’un e-mail. Le 24 novembre, une lecture du seul endpoint public Supabase Auth `/auth/v1/settings` a confirmé `external.email=true` et `mailer_autoconfirm=false` : l’auto-confirmation des adresses est désactivée en production. Aucun réglage Auth, compte ou modèle distant n’a été modifié. Les parcours d’inscription et de notification n’ont pas été déclenchés réellement ; ils sont examinés dans le code et les fixtures locales.

## Vérifications et captures locales

`npm run test:developer-ux` exécute les tests de présentation et Chrome. Les composants réels sont assemblés dans un serveur de test local ; seules l’identité et les réponses réseau sont simulées. Les requêtes externes sont bloquées. Les jeux et valeurs visibles dans les captures sont fictifs et signalés comme tels. Ces captures ne constituent pas une navigation de production ni un test de Safari ou Firefox.

Les captures sont enregistrées dans `.distribution/developer-ux/`, ignoré par Git : chaque écran existe en 1440 px et 390 px, avec des captures supplémentaires pour l’état non confirmé et les révisions externes. Les contrôles couvrent les débordements, la navigation clavier du compte, les filtres, la confirmation avant correction, les liens exacts, les états anonymes et refusés, ainsi que l’absence de montage implicite d’une iframe externe.

Les tests existants du workspace vérifient l’identité serveur et les corrections ; ceux des soumissions couvrent toujours les formulaires ZIP et URL. Le test navigateur du ZIP distribué par le SDK est ignoré lorsque son artefact externe n’est pas fourni : cet état n’est pas un succès.

Aucune migration ni configuration supplémentaire n’est nécessaire. Aucun commit, push, déploiement, envoi réel ou activation de notifications n’a été effectué.

## Résultats du 24 novembre 2026

Fichiers concernés :

- Navigation : `components/Navbar.tsx`, `components/UserDropdown.tsx`, `components/DeveloperNavigation.tsx`, `app/developer/layout.tsx`.
- Écrans : `components/DeveloperWorkspace.tsx`, `components/DeveloperSubmissions.tsx`, `components/ExternalSubmissions.tsx`, `components/BuildReviewStatus.tsx`, `app/developer/resources/page.tsx`.
- Présentation commune : `components/developer/DeveloperUI.tsx`, `components/developer/DeveloperSections.tsx`, `components/developer/developer.module.css`, `lib/developerPresentation.ts`.
- Correction de texte uniquement : `lib/game-distribution/developer-build-preview.ts` ; conditions de prévisualisation inchangées.
- Vérifications : `tests/developer-presentation.test.mjs`, `tests/developer-workspace.browser.test.mjs`, commande `test:developer-ux` dans `package.json` et ce document.

| Contrôle | Résultat |
| --- | --- |
| Présentation, dates, statuts, confirmation e-mail et navigation | 6 tests réussis |
| Chrome : sept écrans en 1440 et 390 px, puis parcours interactifs et titre long | 20 tests réussis, aucun ignoré |
| Workspace : service et corrections dans l’interface DOM | 12 tests réussis |
| Formulaires et contrats de soumission existants | 23 tests réussis |
| Conditions de prévisualisation | 4 tests réussis |
| Chrome : non-régression des dépôts ZIP/URL et reprises | 8 réussis ; 1 ignoré, faute d’artefact ZIP SDK externe |
| TypeScript | Réussi |
| ESLint ciblé | Aucune erreur ; deux avertissements préexistants dans les déconnexions de Navbar et UserDropdown |
| Build Cloudflare Linux et démarrage OpenNext | Réussis, services simulés, aucun déploiement |
| `git diff --check` | Réussi |

La galerie locale `.distribution/developer-ux/index.html` rassemble les captures ordinateur et mobile. Les limites restantes concernent les données disponibles, le chargement de certaines couvertures anciennes et l’absence de vérification Safari/Firefox ou de navigation connectée en production ; elles ne nécessitent aucune modification des règles de publication.
