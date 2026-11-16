# Circuits d’e-mails

Inventaire du portail, des migrations et des Workers versionnés. « Activé » désigne le réglage versionné de production. Les versions effectivement actives, les journaux des fournisseurs et les modèles hébergés dans Supabase ne sont pas établis par le dépôt.

Dans le tableau, **automatique** désigne l’adresse `RESEND_FROM_EMAIL`, configurée à `noreply@chibaskogames.fr`. Les lignes Resend utilisaient déjà le modèle HTML partagé, avec un texte brut en parallèle. Les anciens corps enregistrés sont conservés.

| Déclencheur et origine | Fournisseur et expéditeur | Destinataire et Reply-To | État, conditions et protections | Modèle et correction |
| --- | --- | --- | --- | --- |
| Envoi confirmé dans `/admin/messagerie` via `/api/admin/mail` | Resend, Contact ou Developers au choix | Une adresse saisie, réponse à l’expéditeur | Réservé aux admins, clé Resend, réservation SQL, 5/min et 50/24 h, identifiant unique | HTML partagé, logo à corriger |
| Envoi du formulaire `/contact` via `/api/contact` | Resend, automatique | `CONTACT_NOTIFY_EMAIL`, contact@, réponse à l’auteur | Flag activé, contrôle d’origine, champ anti-spam, quotas SQL, fingerprint, lease et clé stable | HTML partagé pour les nouvelles demandes, texte brut historique conservé lors d’une reprise |
| Dépôt ou mise à jour ZIP classique ou SDK, nouvelle révision URL | Resend, automatique | `GAME_SUBMISSION_NOTIFY_EMAIL`, developers@, réponse au contact développeur | Triggers de soumission et de révision, file unique par soumission, envoi après réponse ou par maintenance. Flag activé, lease, reprise bornée et contenu enregistré | HTML partagé avec lien vers la revue |
| Signalement de joueur/profil ou de jeu via `/api/reports` | Resend, automatique | Alerte à `CONTACT_NOTIFY_EMAIL`, sans Reply-To | Modération et maintenance activées dans Wrangler, vérifications et quotas selon le parcours, file SQL par dossier et version | HTML partagé avec lien administratif |
| Accusé d’un signalement légal avec e-mail | Resend, automatique | Contact du déclarant, réponse à `MODERATION_APPEAL_EMAIL` ou contact@ | File `moderation_mail`, lease et reprises bornées, clé et corps conservés | HTML partagé |
| Clôture ou classement d’un signalement légal avec e-mail | Resend, automatique | Contact du déclarant, même Reply-To que l’accusé | RPC administrative, file `moderation_mail`, notification par version, mêmes reprises | HTML partagé |
| Enregistrement d’un avertissement, d’une suspension, d’un bannissement, d’une levée, d’une dépublication ou d’une restauration par modération | Resend, automatique | Compte visé ou propriétaire du jeu. Contact développeur pour un jeu lorsqu’il existe, sinon e-mail du compte. Reply-To de modération | Trigger `moderation_measure_notify`, file `moderation_measure_mail`, Worker et flag actifs, clé, lease et corps figés | HTML partagé avec lien vers la décision |
| Dépôt d’un recours | Resend, automatique | `CONTACT_NOTIFY_EMAIL`, sans Reply-To | Trigger `moderation_appeal_notify`, file de modération, clé, lease et corps figés | HTML partagé avec lien administratif |
| Décision sur un recours en attente ou retrait d’avertissement avec l’option de notification | Resend, automatique | Auteur du recours ou personne visée, Reply-To de modération | Trigger de recours ou RPC de retrait, file de modération, reprise bornée | HTML partagé avec lien vers la décision |
| Demande de code de réinitialisation via `/api/auth/password-reset/request` | Resend, automatique | Titulaire du compte, sans Reply-To | Configuration Resend et secret de réinitialisation, quotas et code expirant, clé par demande, invalidation en cas d’erreur | HTML partagé avec code mis en évidence |
| Inscription par e-mail via `supabase.auth.signUp` | Supabase Auth, SMTP et expéditeur du tableau de bord | Adresse d’inscription, Reply-To à relever | Confirmation selon réglages Auth. Les seuils et paramètres réels sont à relever | Modèle distant à inspecter séparément |
| Notifications de sécurité Auth et autres modèles disponibles (changement d’e-mail ou mot de passe, invitation, OTP, récupération, etc.) | Supabase Auth si configuré, SMTP et expéditeur à relever | Selon le modèle et l’action Auth | Aucun envoi direct trouvé pour ces modèles. La mise à jour du mot de passe passe par Auth Admin et peut déclencher une notification fournisseur selon ses réglages | Modèles distants, aucune modification à l’aveugle |

## Scénarios sans expédition dédiée dans le dépôt

- Revue technique, approbation, refus, mise en ligne, retrait depuis le workflow de publication ou échec de build. Le dépôt déclenche l’alerte initiale. Les changements de statut et demandes de correction restent visibles dans le dossier. Une dépublication prononcée comme mesure de modération relève du circuit de modération ci-dessus.
- Suppression de compte ou de jeu. Les traitements et leurs états sont enregistrés, sans circuit Resend dédié trouvé.
- Connexion Google, connexion classique, avis/commentaires et notifications sociales. Aucun appel e-mail dédié. Les signalements disponibles ciblent un joueur ou un jeu. Les notifications sociales sont internes au portail.
- Le formulaire public historique de soumission retourne HTTP 410. Le contrôle automatique des ZIP tiers reste désactivé. Le Worker de maintenance reprend uniquement les circuits ci-dessus qui lui sont confiés et ne dispose pas d’un expéditeur autonome supplémentaire.
- LWS assure la réception et les réponses humaines. Aucun client SMTP/IMAP LWS, ni appel SQL réseau envoyant des e-mails, n’a été trouvé dans le dépôt.

## Contrôle manuel Supabase

Dans **Authentication → Email Templates**, vérifier la confirmation d’inscription et relever les modèles de sécurité activés. Dans les réglages SMTP, les Auth Hooks et les journaux Auth, vérifier l’expéditeur, le fournisseur, l’éventuel hook **Send Email** et les événements réellement émis. Si un modèle est adapté au logo e-mail, conserver ses variables Supabase, ses liens de vérification et son comportement. Les changements de réglage restent à effectuer séparément.

## Logo et déploiement

Le PNG officiel de 512 × 512 pixels est déjà opaque. La ressource e-mail versionnée conserve ses pixels RGB et ajoute une bordure opaque autour. L’en-tête garde le nom du site en texte et le logo garde son texte de remplacement. Les indications de palette claire sont complémentaires. Un client qui applique une inversion à l’image elle-même peut encore modifier ses couleurs.

Appliquer `20261116000300_contact_email_logo.sql`, puis déployer le portail et le Worker de maintenance. Vérifier ensuite que `https://chibaskogames.fr/chibaskogames-email-logo-v2.png` répond en HTTPS sans session. Les réservations de contact antérieures gardent leur format et les notifications dont le corps est déjà enregistré restent intactes.
