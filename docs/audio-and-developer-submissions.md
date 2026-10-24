# Audio SDK et coordonnées développeur

## Audio

L’audio utilise Bridge v2 et integrationVersion 1. L’extension est négociée
par document : GAME_AUDIO_SUPPORT {documentId,supported} apparaît uniquement
lorsqu’un jeu utilisant le SDK audio s’abonne à audio.onChange(). Le parent
répond avec PLATFORM_AUDIO_STATE {documentId,state:{muted,volume}}. Les mêmes
vérifications origin/source/launch/generation/document et les bornes 0–1
s’appliquent. Aucun message audio n’est envoyé à un ancien jeu.

Le dock n’est activé que pendant cet abonnement. La plateforme conserve la
préférence dans son propre stockage navigateur, la restaure au rechargement et
la réémet à chaque nouveau lancement. Le volume ne dépend pas du fullscreen.
Les iframes legacy ne sont jamais présentées comme contrôlables. Le SDK ne
permet pas au jeu de modifier la préférence parent.

Le contrat audio public est disponible dans le SDK 0.4.0. Le portail utilise les
contrats npm 0.3.0 et son extension audio hôte. Le support est facultatif : un jeu
sans abonnement audio conserve son fonctionnement normal et ne rend pas le bouton
du dock actif. Chaque jeu applique l’état reçu à ses propres sources sonores.

## Fiche privée et soumission

Appliquer manuellement, après les migrations de soumission existantes :

supabase/migrations/20261021000100_developer_contacts_notifications.sql

La table developer_contacts appartient au compte, indépendamment de ses jeux
et brouillons. Les policies autorisent la lecture/modification de sa propre
fiche, la lecture admin et les opérations service_role. Aucune projection de
catalogue ne joint ces coordonnées. GET/PUT /api/developer/profile utilise
l’identité authentifiée, jamais un userId fourni par le formulaire.

Le formulaire demande prénom, nom, e-mail de contact et studio public ; portfolio
HTTPS et autre contact restent facultatifs. L’e-mail Auth peut être différent.
La publication réutilise la fiche enregistrée ; les données éditoriales du jeu
restent distinctes. Les anciens dossiers sans fiche affichent ce manque en admin.

Le trigger de game_submissions refuse une nouvelle soumission de build sans
fiche, puis crée atomiquement une entrée game_submission_notifications. Aucun
trigger ne vise les brouillons, l’autosave ou les parties multipart. Les retries
réutilisent la soumission et sa seule entrée de notification.

## Notification Resend

Le portail tente l’envoi après sa réponse, via Next after(), sans annuler une
soumission enregistrée. OpenNext transmet ctx.waitUntil.bind(ctx) au request
handler ; son contexte @next/request-context transmet ce waitUntil à Next.
AfterContext y enregistre la promesse des callbacks après fermeture de la réponse.
Il ne s’agit pas d’une Promise détachée. La durée Cloudflare reste bornée : une
interruption laisse l’outbox récupérable et ne garantit pas l’envoi immédiat.
La maintenance partagée peut reprendre les entrées
échouées, par lots bornés de cinq. Le dispatcher de builds reste désactivé.
Le worker de maintenance existant dispose d’un flag indépendant :
GAME_SUBMISSION_NOTIFICATIONS_ENABLED=1. Utiliser la configuration de maintenance
séparée pour les reprises périodiques.

Configurer le cron existant toutes les cinq minutes (*/5 * * * *), avec le flag
notifications à 1 et ses secrets serveur. Le modèle reste inactif dans Git :
la reprise automatique n’est effective qu’après configuration/déploiement de
ce worker. Son handler scheduled attend les traitements ; aucun second service
ni Queue supplémentaire n’est nécessaire. Chaque invocation traite au plus cinq
notifications. Les entrées jamais tentées, les échecs échus et les leases expirés
sont sélectionnés par la même RPC. Surveiller le retard des entrées en attente.

Le backoff est fixe : cinq minutes après chaque échec, puis prochain passage du
cron (délai effectif cinq à dix minutes). Un lease abandonné est récupérable après
deux minutes au prochain passage. La limite est huit claims, y compris les claims
interrompus, ou 23 heures depuis le premier claim. Au passage suivant, la RPC
marque attention_required, sans supprimer l’entrée ni la soumission. Aucun renvoi
automatique après cette limite, même après rétablissement de Resend.

Variables du portail et, pour les retries périodiques, du worker de maintenance :

- RESEND_API_KEY : secret existant.
- RESEND_FROM_EMAIL : adresse d’envoi existante.
- GAME_SUBMISSION_NOTIFY_EMAIL : destinataire admin à configurer.
- NEXT_PUBLIC_SITE_URL : origine HTTPS publique ; défaut https://chibaskogames.fr.
- SUPABASE_SERVICE_ROLE_KEY : secret serveur existant.
- NEXT_PUBLIC_SUPABASE_URL : portail ; SUPABASE_URL : worker de maintenance.

Ne mettre aucune valeur privée dans Git. Le cron de maintenance ne requiert ni
R2 ni Queue pour ces notifications et ne réactive pas le dispatcher de builds.
GAME_SUBMISSION_NOTIFY_EMAIL reste exclusivement serveur, sans préfixe
NEXT_PUBLIC et sans projection API. Son absence en développement produit un log
configuration_missing sans claim ni perte de soumission. Le preflight production
du portail exige les trois paramètres Resend ; celui de maintenance les exige
lorsque son flag notifications est activé. Un contrôle échoué bloque l’activation,
sans transformer une panne de messagerie en rejet de soumission.

Le claim utilise FOR UPDATE SKIP LOCKED, un lease de deux minutes et un token
de fencing. L’entrée reste en base après échec. Chaque message utilise la clé
Resend submission-review/<submissionId>. Le corps complet est figé avant le
premier envoi afin qu’une modification de contact/configuration n’altère pas
le payload d’un retry. Les reçus HTTP sont vérifiés avant de marquer sent_at.

Resend conserve les clés d’idempotence 24 heures :
https://resend.com/docs/dashboard/emails/idempotency-keys
Les retries automatiques s’arrêtent après 23 heures à partir de la première
tentative ou huit tentatives. Une entrée attention_required nécessite une
vérification opératoire auprès de Resend avant tout renvoi ; ne pas réinitialiser
son statut aveuglément. Cela évite un nouvel envoi après expiration de la clé.
Les logs contiennent uniquement événement, phase et résultat, sans contact,
contenu du message, clé API, token ou exception brute.

## Vérifications locales

npm run test:developer-contacts
npm run test:developer-submissions
npm run test:developer-submissions-browser
npm run test:developer-submissions-db
npm run test:game-runtime
npm run test:game-runtime-browser

Les tests PostgreSQL créent leur propre cluster jetable. Les envois Resend et
les jeux navigateur utilisent uniquement des fixtures.

## Points d’entrée

Le contrat audio hôte se trouve dans `lib/game-runtime/audio.ts` et le bridge.
`usePlayerAudio` conserve la préférence du dock ; le jeu gère ses sources sonores.
La fiche privée passe par `developerProfile` ; les notifications utilisent
`submission-notifications` et le Worker de maintenance partagé.
