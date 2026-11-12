# Adresses e-mail de Chibasko Games

Les réponses humaines partent des boîtes LWS `contact@chibaskogames.fr` et `developers@chibaskogames.fr`. Resend expédie les messages de la plateforme depuis `noreply@chibaskogames.fr`.

| Déclencheur | Destinataire | Adresse de réponse |
| --- | --- | --- |
| Formulaire de contact | `CONTACT_NOTIFY_EMAIL` | Adresse saisie dans le formulaire et validée côté serveur |
| Notification interne de dépôt ZIP classique, ZIP SDK ou URL | `GAME_SUBMISSION_NOTIFY_EMAIL` | Adresse de contact du profil développeur |
| Alerte interne de modération | `CONTACT_NOTIFY_EMAIL` | — |
| Accusé ou décision de modération invitant à reprendre contact | Personne concernée | `MODERATION_APPEAL_EMAIL`, ou l’adresse publique de contact par défaut |
| Code de réinitialisation envoyé par le portail | Titulaire du compte | — |
| Confirmation d’inscription Supabase Auth | Titulaire du compte | Réglage SMTP et modèles Supabase Auth |

Déployer le portail et le Worker de maintenance avec le nouvel expéditeur avant d’appliquer `20261112000600_external_submission_notifications.sql`. Les deux versions de l’expéditeur continuent à traiter les dépôts ZIP. La migration ajoute à la file commune les révisions URL créées après son application. Les révisions déjà enregistrées restent consultables en administration, sans envoi rétroactif.

## Vérification après déploiement

Dans les déploiements actifs du portail et du Worker de maintenance, contrôler `CONTACT_NOTIFY_EMAIL=contact@chibaskogames.fr`, `GAME_SUBMISSION_NOTIFY_EMAIL=developers@chibaskogames.fr`, `RESEND_FROM_EMAIL=noreply@chibaskogames.fr` et `MODERATION_APPEAL_EMAIL=contact@chibaskogames.fr`. Wrangler conserve les variables distantes non déclarées avec `keep_vars`.

Vérifier l’expéditeur SMTP et les modèles d’e-mail dans Supabase Auth. Contrôler ensuite, avec des comptes de test, l’expéditeur, le destinataire et l’adresse de réponse sur un message de chaque circuit concerné. Les reprises de modération gardent les destinataires enregistrés lors de la préparation du message afin de conserver le contenu associé à sa clé d’idempotence.
