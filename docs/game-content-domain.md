# Fiche de choix du domaine de contenu

Le domaine sert exclusivement les jeux/artifacts sur des origines de lancement
isolées. Il ne sert ni email, ni comptes, ni site marketing, ni administration.
Aucun candidat n'est choisi ou acheté ; coût et disponibilité commerciale sont
hors de cette fiche.

- Domaine enregistrable distinct de chibaskogames.fr, contrôlé durablement.
- Nom neutre, non attaché à Pong, un moteur, une région ou un hébergeur.
- Gestion DNS compatible Cloudflare et routage wildcard vers Artifact Gateway.
- Wildcard TLS valable pour le niveau exact des hosts l-/v-/p- ; pas de sous-niveaux
  supplémentaires supposés couverts par un certificat à un seul wildcard.
- Possibilité de constituer une demande PRIVATE PSL avec preuve de possession,
  fonctionnement du service et politique d'isolation. Aucune garantie d'acceptation.
- Bases production et staging satisfaisant chacune la frontière reconnue, avec
  ressources/credentials/routage séparés. Une sous-base staging n'hérite pas
  automatiquement du statut de suffixe privé de son parent.
- Noms DNS ASCII normalisés, longueur base runtime <=202 caractères ; chaque launch
  utilise l- +48 hex, sans identité/gameId/room ou secret durable lisible.
- Aucun cookie Domain parent, stockage partagé entre launches ou service worker.
- Logs du fournisseur DNS/TLS/CDN et du proxy compatibles avec la redaction des
  hostnames capabilities ; aucune analytics de jeu dans le domaine du portail.

Pour un candidat D, conserver les preuves dans cet ordre : domaine enregistrable
et possession → wildcard DNS → wildcard TLS → routage Cloudflare → demande/acceptation
PRIVATE PSL → tldts mis à jour → rejet réel des cookies Domain=D et isolation dans
Chrome/Firefox/Safari supportés. La syntaxe DNS seule n'est pas un PASS d'isolation.

Avant acceptation : tests locaux interceptés et fixtures contrôlées, validation
DB/storage/build ; aucun runtime public final ni staging distant présenté comme
isolé sous une base non reconnue. Si la demande est refusée, réexaminer l'architecture
avant activation. Pas d'exception « jeu officiel » ni de flag de bypass.

Références : [procédure PSL](https://publicsuffix.org/submit/),
[critères PRIVATE](https://github.com/publicsuffix/list/wiki/Guidelines),
[Cloudflare wildcard DNS](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/).
