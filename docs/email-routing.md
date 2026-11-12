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

## Coordonnées affichées sur le site

Ouvrir `/contact` en navigation privée et vérifier le texte et le lien « Adresse directe ». Le destinataire du formulaire dépend de `CONTACT_NOTIFY_EMAIL`. Le lien public vient de `lib/siteContacts.ts`, inclus dans le build du portail. Si les deux diffèrent, comparer la réponse du document dans l’onglet Réseau avec le lien du DOM et vérifier le commit associé au déploiement actif du portail dans Cloudflare. En cas de déploiement progressif, vérifier la répartition du trafic entre versions.

Pour chercher une ancienne adresse officielle dans la FAQ, y compris dans les brouillons, exécuter cette lecture dans l’éditeur SQL Supabase. Remplacer le paramètre par l’adresse recherchée.

```sql
begin read only;
select id, is_published
from public.faq_entries
where strpos(lower(question), lower('<ancienne adresse>')) > 0
   or strpos(lower(answer), lower('<ancienne adresse>')) > 0;
rollback;
```

Ouvrir les entrées trouvées dans l’administration et corriger uniquement les coordonnées officielles, selon le sujet de chaque réponse. Vérifier le rendu public dans `/faq` après sauvegarde.
