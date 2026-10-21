# Portail développeur et audit juridique — 22 octobre 2026

## Périmètre et résultat

Guide public /developpeurs, navigation depuis le footer et les deux états de
/publier-un-jeu, pages /mentions-legales, /confidentialite et /cookies.
Aucune migration, modification SDK, Pong, Gateway ou intégration de traceurs.
Les conditions de publication restent un projet interne, non opposable en l’état.
La mise en ligne de ces textes ne constitue pas une validation juridique complète.

La documentation est utilisable pour préparer un jeu local sans accès aux dépôts.
L’activation d’un serveur online, des origines réseau, l’examen des builds, la
publication, la correction de métadonnées d’une mise à jour et les retraits restent
administrés. Aucun provisioning multijoueur ni CLI officiel de packaging n’est promis.

## État antérieur

Une seule page juridique existait : app/mentions-legales/page.tsx. Aucune page
confidentialité, cookies ou CGU distincte n’a été trouvée. La page ne décrivait que
le contact et affirmait l’absence de cookies commerciaux sans consentement.
Cette affirmation ne correspond pas au chargement actuel des scripts. Les
exclusions générales de responsabilité et la clause globale de juridiction ont
été retirées ; elles ne peuvent remplacer les obligations applicables.
Aucune identité légale ou donnée d’immatriculation vérifiable n’a été trouvée.

## Références techniques inspectées

| Sujet | Preuve versionnée |
| --- | --- |
| SDK | Version publique 0.4.0 installée dans la référence Pong : package.json, exports et declarations client/browser/connection, server/client, react/index. Le portail reste dépendant de 0.3.0 ; aucune dépendance n’est changée. |
| Manifest | lib/game-distribution/chibasko.schema.v1.json et manifest.ts ; exemple construit depuis les constantes du schéma puis validé à l’import. |
| Limites ZIP | lib/game-distribution/uploads/policy.ts : 524288000 octets ; 16 Gio extraits ; paths.ts, zip.ts et validator. |
| Revue | SubmitGamePageClient, NewGameDraftEditor, UpdateGamePublication, adminBuilds et RPC distribution de soumission/publication. |
| Contacts privés | developer_contacts et game_submission_notifications, migration 20261021000100 ; RLS, snapshot privé, message figé avant envoi. |
| Auth | lib/supabaseClient.ts, lib/server/supabaseSession.ts, proxy.ts ; cookies Supabase et migration depuis ancien localStorage. |
| Historique | components/PlaySessionTracker.tsx : play_history pour les comptes connectés, compteurs et marqueurs sessionStorage. |
| Audio | components/game-runtime/usePlayerAudio.ts : chibasko.player.audio.v1 en localStorage. |
| Contact | components/ContactPageClient.tsx envoie prénom, nom, e-mail et message à FormSubmit, destination chibasko06@gmail.com. Ce n’est pas le flux Resend. |
| Audience | components/SiteAnalytics.tsx : raccord CMP Google / Consent Mode, chargement après accord Analytics explicite ; exclusion des lobbies privés. |
| Publicité | app/layout.tsx : script AdSense inconditionnel dans head. |
| Hébergement | Wrangler/OpenNext portail, Worker Artifact Gateway et bindings R2 ; Supabase Auth/Postgres ; Resend pour e-mails transactionnels. |

Les recherches de cookies incluent du code de preview historique ; ce code ne
doit pas être présenté comme le mécanisme actuel d’autorisation des launches.
Le Gateway de launch utilise une capability, sans autorisation par cookie.

## Inventaire des traitements et décisions restantes

| Traitement | Données / visibilité | Finalité / base à confirmer juridiquement | Conservation constatée / action |
| --- | --- | --- | --- |
| Compte/profil | Auth UUID, e-mail, credentials d’auth gérés par Supabase ; pseudo, avatar et champs publics choisis | Service demandé ; sécurité par intérêt légitime | Persistance ; formaliser compte inactif, suppression, sauvegardes et exceptions. |
| Communauté | Favoris, réactions, notes/avis et historique ; avis/profil selon surfaces publiques | Fonctions demandées et modération | Pas de calendrier global trouvé ; préciser retrait d’avis et anonymisation après suppression de compte. |
| Développeur | Prénom/nom/contact privés ; studio public ; portfolio/autre contact optionnels | Mesures précontractuelles/service de publication, sécurité/modération | Pas de purge générale de fiche/dossier. Les snapshots et e-mails ne suivent pas automatiquement une modification de profil. |
| Publication | Brouillons, ZIP, couverture, versions, erreurs, décisions et checklist de revue | Revue et distribution ; défense des droits selon nécessité | Upload expiré ≠ dossier supprimé. Fixer les délais de refus, abandon, archive, retrait et sauvegardes. |
| E-mails | Contact, sujet, corps, snapshot de soumission et boîte admin | Notifications du service / réponse aux demandes | Retry borné à huit claims/23 h ≠ délai de suppression ; définir purge outbox, logs Resend et messagerie. |
| Sécurité/control plane | Launch/session/lobby, identifiants opaques, correspondances privées, hashes tickets/credentials, traces bornées ; réseau/IP chez l’hébergeur | Exécution de partie et intérêt légitime de sécurité | TTL des tickets/sessions et cleanup existants ne constituent pas une politique RGPD complète ; fixer logs et historiques durables. |
| Analytics/publicité | Données réseau/navigation/traceurs éventuels chez Google | Consentement préalable sauf exemption démontrée | CMP Google active ; raccord Consent Mode ajouté. Écart bloquant pour Analytics tant que Google retourne NOT_CONFIGURED ; conservation Google non confirmée. |
| Contact FormSubmit | Prénom, nom, e-mail, message, puis boîte destinataire | Répondre selon la demande | DPA, destinataires, transferts et conservation non vérifiés. |

Ne pas inventer des délais dans les pages publiques. Leur absence est signalée
explicitement ; elle doit être résolue avant de présenter l’information comme
complète. Les bases proposées pour le service doivent être validées avec le
statut de l’éditeur et la qualification juridique du service.

## Informations à fournir — publication juridique incomplète

- **À FOURNIR : statut exact de l’éditeur** (personne physique non professionnelle,
  entrepreneur individuel, société, association, autre).
- **À FOURNIR : identité légale ou dénomination**, et identité du responsable de
  traitement ; « Chibasko Games » est une marque de service, pas une identité prouvée.
- **À FOURNIR : adresse et téléphone requis selon ce statut**, ou examen du régime
  particulier applicable aux éditeurs non professionnels ; aucune adresse fictive.
- **À FOURNIR : directeur/responsable de publication applicable.**
- **À FOURNIR SELON STATUT : SIREN/SIRET, registre d’immatriculation, forme juridique,
  capital, TVA et autres mentions réellement applicables.**
- **À CONFIRMER : e-mail de contact juridique/données.** L’adresse existante est
  conservée ; aucun nouveau destinataire n’est créé.
- **À DÉFINIR : conservation**, purge/anonymisation par catégorie, sauvegardes,
  procédure d’exercice des droits, gestion des mineurs et signalements.
- **À VÉRIFIER : entités contractantes, régions, DPA, sous-traitants, garanties de
  transfert et accès support** Cloudflare, Supabase, Resend, FormSubmit et Google.

Ces marqueurs restent dans ce rapport, pas comme fausses mentions dans les pages.
L’hébergement Cloudflare est décrit selon la configuration réelle ; ses coordonnées
publiques ont été vérifiées sur ses documents officiels, pas inventées pour le projet.

## Consentement et traceurs — action requise

La CMP Google AdSense est active en production. L’audit a confirmé que GA était
chargé séparément avant tout accord et que Google retournait NOT_CONFIGURED.
Le raccord décrit dans docs/analytics-consent.md définit les defaults denied,
attend les valeurs officielles et ne charge GA qu’après accord Analytics explicite.
Le paramétrage Google doit fournir ces valeurs ; NOT_CONFIGURED reste bloquant
pour Analytics. Aucun second gestionnaire de consentement n’est ajouté.
Avant publication des changements comme dispositif complet : conditionner les
scripts non nécessaires à un choix valide (refus aussi accessible que l’accord,
retrait possible), ou suspendre ces scripts ; auditer aussi les iframes legacy.
Aucun de ces scripts n’est modifié par cet audit.
Les noms/durées réels des cookies Google, Cloudflare et jeux tiers restent à
mesurer en navigateur par environnement ; ne pas les déduire des seuls scripts.

## Conditions développeur — travail préparatoire

docs/conditions-publication.projet.md propose les clauses, sans transfert de PI.
La case actuelle ne confirme que les droits ; elle n’enregistre pas une acceptation
versionnée d’un contrat d’hébergement/distribution. Ne pas lui attribuer cette portée
rétroactivement. Après validation juridique, décider du texte public, de son
acceptation explicite et de la preuve versionnée ; une évolution de stockage peut
alors être nécessaire. Aucune migration anticipée n’est ajoutée ici.
Aucune CGU globale n’est inventée : son besoin et son contenu restent à examiner.

## Sources officielles consultées le 22 octobre 2026

- Obligations selon statut : https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter
- Information et droits : https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3
- Consentement traceurs : https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi
- Exemption audience : https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience
- Cloudflare : https://www.cloudflare.com/policies/terms/ et https://www.cloudflare.com/__esa/
- Supabase : https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Resend : https://resend.com/legal/dpa et https://resend.com/legal/subprocessors

Ces sources ne prouvent ni les contrats souscrits ni leur paramétrage effectif.

## Validation locale

- `npm run test:developer-guide` : exemple JSON contre le validator réel, liens
  internes, rendu public, exécution des snippets lifecycle/audio/resize en fixture.
- Vérification TypeScript en mémoire des snippets avec les declarations du package
  npm SDK 0.4.0 installé : aucune erreur ; le package n’expose pas de CLI bin.
- `npm run test:developer-guide-browser` après build : Chrome 1366×768 et 390×844,
  quatre pages, sommaire, FAQ, focus clavier des blocs de code, absence de
  débordement horizontal de la page et captures dans le dossier temporaire.
- `npm run test:developer-submissions` : parcours existant et accès privés conservés.
- Build Next Webpack, TypeScript, ESLint ciblé et `git diff --check`.

Le navigateur fixture ne charge aucun traceur réel et n’accède pas aux comptes
production. Ces tests ne constituent ni une recette juridique ni un inventaire
live des cookies des fournisseurs tiers.
