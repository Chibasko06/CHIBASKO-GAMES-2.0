# Invitations à l’authentification

## Présentation commune

Les actions anonymes qui exigent un compte appellent `requestAuthentication(reason, trigger)` dans `lib/authInvitation.ts`. `AuthInvitationHost`, monté une seule fois dans le layout, présente un dialogue natif modal. Une demande répétée ne crée pas de deuxième dialogue et ne remplace pas le contrôle auquel rendre le focus.

Le dialogue appartient au lecteur à l’origine de l’action, y compris en plein écran natif ou immersif. Il ne remplace aucun bouton, ne réserve aucune ligne dans le dock et ne modifie ni l’iframe ni ses attributs. Les contrôles d’agrandissement ignorent Échap tant qu’un dialogue est ouvert. Le dialogue ferme avant le panneau des commandes et avant l’immersion.

Sur une page classique, le défilement de fond est immobilisé en conservant la largeur du corps et la position de défilement. En immersion, le verrou du lecteur reste propriétaire du document. Les dimensions du dialogue suivent `visualViewport`, ses décalages et les safe areas ; le contenu long défile à l’intérieur. Les liens ont des cibles d’au moins 44 pixels et le focus reste dans le dialogue. Fermeture par bouton, Échap ou clic sur le fond ; restauration du focus sur le contrôle d’origine ou le résumé du menu.

`AuthRequired` reste une présentation intégrée pour les pages privées et les espaces réservés aux comptes. Les deux présentations réutilisent `AuthActions` et `safeAuthNext` pour la connexion et l’inscription. Le retour contient le chemin et les paramètres publics admissibles, sans destination externe ni paramètre de session. Il ne contient pas les fragments. Aucun état de jeu ni action différée n’est transféré à l’authentification.

Fermer l’invitation conserve la partie. Naviguer vers la connexion ou l’inscription quitte la page et peut interrompre la partie. Les contrôles d’autorisation serveur, RLS et gardes administrateur restent inchangés.

## Inventaire des parcours

| Zone / composants | Présentation et comportement |
| --- | --- |
| `GameReactions` : like et dislike, fiche et dock | Dialogue commun ; aucun bloc ajouté à la rangée de boutons. |
| `FavoriteButton` : fiche, cartes et dock | Dialogue commun ; le bouton reste monté, sans mutation anonyme. |
| `GameReviews` : publication d’un avis | Dialogue commun ; le texte et la note restent dans le formulaire après fermeture. |
| `ProfileSocialActions` : profils publics et résultats de communauté | Action « Gérer la relation » ouvrant le dialogue ; le menu n’embarque plus une grande invitation. |
| `GameSharingMenu` : partage à un ami | Dialogue commun pour les invités ; partage public du lien toujours disponible. |
| `ReportButton` / `ReportForm` / `/contact` | Les signalements anonymes restent autorisés via le formulaire de contact protégé. Aucun compte imposé et aucun changement des règles de modération. Les signalements authentifiés gardent leur formulaire. |
| `CommunityHub` | Invitation intégrée commune pour l’espace d’amis privé ; recherche publique conservée. |
| `/favorites`, `/dashboard`, `/dashboard/blocked`, `AccountModeration` | Invitation intégrée commune ; retour vers l’espace demandé. |
| `DeveloperWorkspace`, `DeveloperSubmissions`, `BuildReviewStatus`, `/developer/profile` | Invitation intégrée commune, vérifications et permissions existantes conservées. |
| `SubmitGamePageClient` / `/publier-un-jeu` | Invitation intégrée commune ; exigences de profil professionnel vérifié inchangées. |
| `multiplayer/MultiplayerAccess`, salles et accès multijoueur | Invitation intégrée commune avec destination explicite validée ; aucune réservation créée par l’invitation. |
| Navbar, accueil (`HomeHeroActions`), liens explicites d’inscription/connexion | Navigation volontaire conservée. Ce ne sont pas des messages d’erreur injectés après une action. |
| `/login`, `/register`, callback, réinitialisation, `AuthProfileFeedback` | Interfaces d’authentification et reprise après erreur conservées, avec leurs contrôles de retour existants. |
| `/admin`, limites d’accès et modération de compte | Redirections et vérifications de rôle conservées ; une invitation n’autorise jamais une action. |
| `AccountDeletion`, Dashboard : erreurs de session lors d’une opération | Messages de reprise métier conservés ; aucune transformation d’une opération non confirmée en succès ou réémission. |

## Causes corrigées

- Les réactions ajoutaient un `AuthRequired` dans le groupe compact du lecteur.
- Le favori remplaçait son bouton par `AuthRequired`, changeant la géométrie du dock.
- Les menus de profil et de partage empilaient des panneaux de connexion dans une petite largeur fixe.
- Plusieurs pages réservées aux comptes construisaient séparément les liens, parfois sans destination de retour.
- Une modale rendue uniquement sous `body` pourrait devenir inerte ou invisible hors de l’élément plein écran. L’invitation est donc rattachée au lecteur concerné.

## Vérification locale

```powershell
node --test tests/auth-invitation.browser.test.mjs
$env:AUTH_BROWSER = 'webkit'
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:LOCALAPPDATA\ms-playwright"
node --test tests/auth-invitation.browser.test.mjs
Remove-Item Env:AUTH_BROWSER
node --test tests/ux-navigation.browser.test.mjs
node --import ./tests/product-register.mjs --test tests/player-social.test.mjs
```

Les tests navigateur utilisent les composants réels, des services simulés et des iframes de test interceptées, sans données de production. Ils couvrent les quatre parcours de lecteur, son mode normal et immersif, le plein écran disponible, les actions de page, la fermeture, le clavier, les répétitions, les rotations et la connexion en cours d’invitation. Ils comparent l’identité, les dimensions, le nombre de chargements et l’état mémoire de l’iframe. Les tests existants conservent la couverture des mutations authentifiées et des refus serveur.

Les captures locales se trouvent dans `.distribution/auth-invitation/`, ignoré par Git. WebKit Playwright sous Windows ne constitue pas un essai matériel Safari : vérifier sur iPhone les barres Safari, l’encoche, le clavier logiciel et le retour du focus après fermeture.

## Qualification du 26 novembre 2026

| Contrôle | Résultat |
| --- | --- |
| Invitations, lecteur et pages, Chrome | 15 tests réussis |
| Invitations, lecteur et pages, WebKit Windows | 15 tests réussis |
| Navigation, inscription, connexion et retour | 11 tests réussis |
| Communauté et modération dans le navigateur | 41 tests réussis |
| Agrandissement du lecteur et politiques de dimensionnement | 26 tests réussis |
| Authentification, relations et modération unitaires | 49 tests réussis |
| Réactions et favoris authentifiés persistés | 1 test réussi |
| Formulaire de publication et soumissions privées | 4 tests réussis |
| TypeScript, ESLint ciblé et `git diff --check` | Réussis |
| Build Cloudflare sous Linux et démarrage isolé OpenNext | Réussis |

Les assertions couvrent aussi le refus des paramètres de retour sensibles, la conservation des styles de défilement, l’absence d’écriture anonyme, le passage d’une session inconnue à un état confirmé et l’absence de rejeu de l’action lors de la connexion. Les services de données sont simulés : ces essais ne connectent aucun compte réel et n’exécutent pas de jeu de production.

Aucune migration, aucun secret ni changement de flag n’est nécessaire. Aucun compte, jeu, SDK, Gateway ou service d’authentification n’est modifié.
