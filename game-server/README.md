# Chibasko Playground local

Projet Node autonome, sans workspace. Node 24+, TypeScript strict. État en mémoire,
aucun secret, Supabase, R2 ou stockage persistant. Le serveur écoute exclusivement
sur `127.0.0.1:2567`. Il n'est ni installé ni démarré par le build Cloudflare du site.

Depuis la racine du dépôt :

```powershell
npm ci
npm --prefix game-server ci

# Terminal 1 : site Next.js
npm run dev

# Terminal 2 : serveur local, redémarrage sur modification
npm --prefix game-server run dev
```

Ouvrir `http://localhost:3000/playground` dans deux onglets/navigateurs.
Cliquer Connexion dans chacun, vérifier le même roomId et deux sessionId distincts.
Déplacer chaque joueur avec les boutons et observer les coordonnées dans l'autre onglet.
Déconnecter un joueur et vérifier sa disparition. Fermer/recharger la page quitte la
connexion ; une nouvelle connexion reçoit une nouvelle identité temporaire.
Le serveur vide dispose sa room automatiquement. Redémarrer le serveur efface son état.

La page renvoie 404 hors `next dev`, notamment en production Cloudflare ; aucun lien
de navigation ni sitemap. Le SDK navigateur contacte directement le serveur local,
pas les routes API Next.js. Les boutons ne créent pas de connexion automatique au montage.

État : `players: MapSchema<PlayerState>`, indexée par sessionId attribué par Colyseus.
Chaque joueur possède sessionId, x et y, position initiale (50,50). Join crée le joueur ;
leave supprime joueur et compteur. Maximum 16 joueurs par room ; `joinOrCreate`
réutilise une room disponible (une nouvelle room est créée si toutes sont pleines).
Cela reste le mécanisme de sélection intégré de Colyseus, sans matchmaking produit.

Message `move: {x,y}` uniquement : objet strict, nombres finis entiers, coordonnées
0–100, une seule case orthogonale, intervalle minimum de 100 ms entre mouvements acceptés.
Le serveur déduit le joueur de la connexion, rejette les identifiants fournis par le client,
modifie l'état puis Colyseus synchronise les patches (50 ms). Aucune prédiction cliente.
Rejet : `move_rejected: {code}`. Identité de session uniquement, pas encore UUID Supabase.
Pas de reconnexion de joueur implémentée, d'amis, party ou services distribués.

```powershell
npm --prefix game-server test
npm --prefix game-server run build
npm --prefix game-server start
```

Le test réseau démarre un serveur sur un port local éphémère, utilise deux vrais clients
WebSocket, vérifie synchronisation/rejet/leave puis ferme toutes les connexions.
Le package utilise core + ws-transport + schema, évitant les adaptateurs Redis et outils
admin du package général `colyseus`. Le frontend et le serveur possèdent leurs lockfiles.
Ne pas exposer ce prototype sur un VPS ou en production : aucune authentification joueur.
