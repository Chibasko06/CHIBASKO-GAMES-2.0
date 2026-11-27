# Comparer la délivrabilité

Les essais comparent deux messages contemporains sur chaque filtre. Le résultat Mail-Tester d’un message administratif ne renseigne pas son score LWS. Les scores LWS déjà observés sont des éléments à rapprocher des nouveaux essais.

## Circuits vérifiés

| Caractéristique | Messagerie administrative | Soumission ZIP classique ou SDK | Soumission URL externe |
| --- | --- | --- | --- |
| Déclenchement | Confirmation dans `/admin/messagerie`, route `/api/admin/mail` | Soumission enregistrée, file SQL et rappel différé | Même file, alimentée par la révision externe |
| Constructeur | `adminEmailMessage` dans `lib/emailMessages.ts` | `submissionEmailMessage` dans le même module | Même constructeur |
| HTML | `brandedEmail`, identité Contact ou Developers | `brandedEmail`, identité automatique | Identique au ZIP, avec lien de revue différent |
| Texte | Texte saisi, signature, lien du site | Informations de dépôt, version, contact développeur et lien privé | Identifiant de révision à la place de la version |
| Objet | Saisi dans l’administration | « Nouvelle soumission de jeu sur Chibasko Games » | Même objet |
| From | « Chibasko Games — Contact » ou « Chibasko Games — Developers » | `RESEND_FROM_EMAIL`, actuellement « Chibasko Games <noreply@chibaskogames.fr> » | Identique au ZIP |
| Reply-To | Adresse professionnelle sélectionnée | Absent pour les nouvelles notifications internes | Identique au ZIP |
| Destinataire réel | Adresse saisie | `GAME_SUBMISSION_NOTIFY_EMAIL`, actuellement developers@ | Identique au ZIP |
| Requête | POST JSON vers `https://api.resend.com/emails` | Même endpoint et méthode | Identique au ZIP |
| En-têtes HTTP | Authorization, Content-Type et Idempotency-Key `admin-mail/<id>` | Mêmes noms, clé `submission-review/<id>` | Identique au ZIP |
| En-têtes de message personnalisés | Aucun ajouté dans le payload | Aucun ajouté dans le payload | Aucun ajouté dans le payload |
| Timeout et reprise | 8 s, envoi réservé une fois, résultat parfois incertain | 10 s maximum par tentative, lease, backoff, limites de tentatives et corps enregistré | Identique au ZIP |

Le Worker `cloudflare/session-maintenance.ts` et le rappel différé du portail `lib/server/developerSubmissions.ts` utilisent `deliverSubmissionNotifications`. Ils diffèrent par leur budget global et le nombre de messages traités. Ils transmettent le même message enregistré à Resend avec la même clé lors d’une reprise. La configuration versionnée du portail et du Worker contient le même From, le même destinataire interne et le même site.

## Préparer la session PowerShell

Depuis le dépôt du portail, utiliser Node.js et les dépendances déjà installées. Le diagnostic charge uniquement le constructeur pur de messages avec esbuild. Il ne charge aucun service de base de données, fichier `.env`, historique ou file de production.

```powershell
Set-Location 'C:\Users\chiba\ChibaskoGames\CHIBASKO-GAMES-2.0'
$env:RESEND_FROM_EMAIL = 'noreply@chibaskogames.fr'
$env:NEXT_PUBLIC_SITE_URL = 'https://chibaskogames.fr'
$resendDiagnosticKey = Read-Host 'Clé Resend d’envoi du domaine vérifié' -AsSecureString
$env:RESEND_API_KEY = [System.Net.NetworkCredential]::new('', $resendDiagnosticKey).Password
```

Utiliser la configuration d’envoi Resend du portail. Vérifier dans Resend si une clé restreinte au domaine est utilisée. Ne pas coller la clé dans une commande, un ticket, un rapport ou un fichier versionné. Elle n’est lue qu’au moment d’un envoi confirmé et n’est pas inscrite dans les aperçus.

## Aperçu et quatre essais

Par défaut, la commande produit les fichiers `message.html`, `message.txt`, `message.json` et `result.json` dans un sous-dossier de `.distribution/email-diagnostics/`, ignoré par Git. L’aperçu technique affiche From, Reply-To, objet, taille HTML/texte, liens et empreinte du payload.

```powershell
npm run diagnose:email -- --type admin --sender developers --to developers@chibaskogames.fr
npm run diagnose:email -- --type submission --mode classic --to developers@chibaskogames.fr
```

Ouvrir le `message.html` indiqué pour examiner le rendu avant un essai. Le passage à `--send` affiche de nouveau l’aperçu et demande de saisir exactement `ENVOYER adresse-destinataire` dans un terminal interactif. Une réponse différente annule. Chaque exécution effectue au maximum un appel fournisseur, sans retry. Un résultat incertain exige une vérification dans Resend avant de recommencer.

Pour A et B, ouvrir une nouvelle analyse Mail-Tester et recopier l’adresse temporaire fournie pour chaque essai.

```powershell
# A — administratif vers Mail-Tester
$mailTesterA = Read-Host 'Adresse Mail-Tester pour le test A'
npm run diagnose:email -- --type admin --sender developers --to "$mailTesterA" --send

# B — soumission vers une autre adresse Mail-Tester
$mailTesterB = Read-Host 'Nouvelle adresse Mail-Tester pour le test B'
npm run diagnose:email -- --type submission --mode classic --to "$mailTesterB" --send

# C — administratif vers LWS
npm run diagnose:email -- --type admin --sender developers --to developers@chibaskogames.fr --send

# D — soumission vers LWS
npm run diagnose:email -- --type submission --mode classic --to developers@chibaskogames.fr --send
```

Les quatre essais utilisent Camille Martin, Atelier Démo, Jeu de diagnostic et le même texte de dépôt fictif comme contenu rédactionnel. Le modèle administratif lui ajoute sa signature habituelle. Le modèle automatique conserve sa mise en page et son bouton de revue, sans Reply-To. L’adresse fictive `createur@example.com` reste dans les détails du dépôt. Les identifiants de build et de révision sont fictifs et ne désignent pas des dossiers réels.

Pour examiner les variantes de dépôt, remplacer `--mode classic` par `--mode sdk` ou `--mode external`. Le choix Contact est disponible avec `--type admin --sender contact`. Chaque essai supplémentaire doit être relevé séparément.

Après les essais, retirer la clé de la session.

```powershell
Remove-Item Env:RESEND_API_KEY
Remove-Variable resendDiagnosticKey
```

## Relever les résultats

`result.json` indique l’heure UTC de la tentative, l’identifiant Resend confirmé, le statut HTTP disponible et le résultat local. « accepted » signifie que Resend a accepté le message. Le dossier de réception, l’authentification et les scores proviennent des outils de réception et doivent être relevés manuellement.

| Essai | Message | Service / adresse utilisée | Date UTC | ID Resend | Score et échelle | SPF / DKIM / DMARC | Règles relevées | Dossier | Observations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Administratif Developers | Mail-Tester, à renseigner | À renseigner | À renseigner | Note Mail-Tester /10 | À relever | À relever | À relever | À renseigner |
| B | Soumission classique | Mail-Tester, à renseigner | À renseigner | À renseigner | Note Mail-Tester /10 | À relever | À relever | À relever | À renseigner |
| C | Administratif Developers | developers@chibaskogames.fr | À renseigner | À renseigner | Score LWS | À relever | À relever | À relever | À renseigner |
| D | Soumission classique | developers@chibaskogames.fr | À renseigner | À renseigner | Score LWS | À relever | À relever | À relever | À renseigner |

Comparer A avec B dans Mail-Tester, puis C avec D dans LWS. Une note Mail-Tester et un score LWS suivent des échelles différentes. Conserver les rapports détaillés et, lorsque disponibles, les en-têtes reçus, l’IP émettrice, le Return-Path, Authentication-Results et les règles antispam avec leurs points. Les en-têtes fournisseur sont ajoutés par Resend et le récepteur.

## Interpréter les écarts

- Vérifier d’abord SPF, DKIM et l’alignement DMARC de chacun des quatre messages. Le PASS d’un ancien essai ne confirme pas celui d’un nouveau message.
- Si C et D sont tous deux pénalisés, examiner les règles LWS, l’IP de sortie et sa réputation avant d’attribuer le problème au modèle automatique.
- Si D est plus pénalisé que C, rapprocher les règles du From, du Reply-To, du texte, du rapport HTML/texte et du bouton vers le dossier privé. Le diagnostic affiche les liens et les tailles pour cette comparaison.
- Si A et B sont proches mais C et D divergent, examiner les indices propres au filtre LWS. Sans détail de règles ou en-têtes, la cause reste indéterminée.

Aucune correction de DNS, de modèle ou de réputation ne peut être déduite du seul score global.

Le [contrôle de production du 21 novembre 2026](email-production-alignment.md) confirme un Worker de maintenance ancien, mais aussi deux notifications du 20 novembre dont les champs enregistrés correspondent exactement aux constructeurs actuels. La différence de scores reste inexpliquée sans les rapports de réception détaillés. Cette distinction évite d’attribuer à tort tous les écarts au déploiement ancien.

## Limites et fidélité

Les constructeurs sont ceux utilisés par les envois de production. Le CLI substitue uniquement les données fictives et le destinataire volontaire. Il génère une clé isolée `admin-mail/diagnostic-<uuid>` ou `submission-review/diagnostic-<uuid>`. Le diagnostic n’enregistre rien dans Supabase et ne reproduit pas le scheduler, les quotas SQL ou les reprises de production.

La connexion sort de la machine locale, le lieu et l’heure d’appel diffèrent de Cloudflare, et Resend peut choisir une IP différente. Le MIME, Message-ID, Date, Return-Path, les signatures et les autres en-têtes de transport sont générés par le fournisseur. La fidélité du payload ne garantit pas l’identité de ces en-têtes. Les données fictives, notamment les coordonnées et les liens de dossier inexistants, peuvent aussi influencer un filtre.

Références fournisseur [API d’envoi](https://resend.com/docs/api-reference/emails/send-email) et [idempotence](https://resend.com/docs/dashboard/emails/idempotency-keys).
