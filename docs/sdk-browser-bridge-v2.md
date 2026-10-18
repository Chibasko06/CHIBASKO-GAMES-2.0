# Chibasko Game Bridge v2

Le v1 décrit dans `sdk-browser-bridge-v1.md` reste supporté sans modification.
SDK 0.3.0 utilise v2 ; integrationVersion reste 1. Le premier GAME_HELLO valide
sélectionne le protocole pour toute la durée du document, sans downgrade ultérieur.

L'envelope, bootstrap fragment, contraintes origin/source, documentId, generation,
INIT, READY, STOP, LEAVE, ERROR et heartbeat sont inchangés. Seul START change :

```ts
type StartPayload = { documentId: string; context:
  | {execution: 'local'}
  | {execution: 'online'; online: {
      onlineSessionId: string
      participantId: string
      server: {endpoint: string; ticket: string; expiresAt: string}
    }}
}
```

Tous les champs sont requis, aucun champ supplémentaire. Le ticket est transmis
uniquement après READY ; il n'est jamais dans INIT, le manifest, le fragment ou
l'URL gameplay. Le SDK valide la liaison à la session et au participant INIT,
reconstruit un contexte récursivement figé et le donne à `onStart(context)`.
Le premier START online refuse un ticket déjà expiré. Un START identique est
idempotent ; STOP suivi de START reprend le même contexte, même après expiration
du ticket initial, puisque l'admission est déjà sous le contrôle du serveur gameplay.
Un contexte modifié dans le même document provoque `invalid_platform_message`.

Le roster v2 accepte jusqu'à 4096 participants (les limites manifest restent plus
basses actuellement). Le host refuse un roster supérieur à 64 en négociation v1,
plutôt que d'en tronquer silencieusement les identités.

Le bridge ne transporte aucune frame, input, score, reconnexion ou résultat.
Voir `online-sessions.md` pour le contrôle d'admission serveur-à-serveur.
