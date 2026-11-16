# Messagerie administrative

Dans **Administration → Messagerie**, choisir l’expéditeur, saisir une adresse, puis écrire l’objet et le message. L’aperçu affiche le modèle HTML avec les paragraphes et la signature du service. Confirmer depuis cet aperçu pour envoyer. La version texte est incluse et les réponses arrivent dans la boîte LWS sélectionnée.

L’historique contient l’expéditeur, le destinataire, l’objet, la date et le résultat connu. Le corps du message reste hors du journal. Les échecs de Resend sont visibles avec le code HTTP disponible. « Accepté par Resend » signifie que le fournisseur a confirmé la prise en charge.

La limite est partagée par les administrateurs. Elle est de cinq tentatives par minute et cinquante sur 24 heures. Une confirmation répétée avec le même identifiant ne déclenche aucun nouvel envoi. Si le résultat reste en attente ou non confirmé, vérifier dans Resend avant de créer un nouvel envoi. Un délai d’attente peut survenir alors que Resend a déjà accepté le message.

## Mise en production

1. Vérifier que la clé Resend déjà configurée sur le portail permet l’envoi depuis le domaine vérifié `chibaskogames.fr`.
2. Appliquer `supabase/migrations/20261116000100_admin_mail.sql`. Vérifier que seuls les appels serveur avec `service_role` ont accès au journal et aux trois RPC.
3. Déployer le portail via le circuit Cloudflare habituel. Le Worker de maintenance et les expéditeurs automatiques conservent leurs réglages.
4. Depuis un compte administrateur, vérifier l’aperçu et l’historique. Avec autorisation, envoyer un message à une boîte de test depuis chaque expéditeur et contrôler l’expéditeur affiché, l’adresse de réponse et le statut dans Resend. Vérifier aussi qu’un compte sans rôle admin ne peut ouvrir la page ni lire l’historique.
