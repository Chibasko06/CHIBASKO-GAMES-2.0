# Validateur ZIP Chibasko Games

Vérifiez le ZIP d’un jeu HTML5 avant de l’envoyer. Il faut Node.js 24 et npm.
La commande fonctionne sous Windows, Linux et macOS. Le SDK navigateur et un
compte Chibasko Games sont facultatifs.

```bash
npx @chibaskogames/cli validate mon-jeu.zip
```

Après avoir créé votre brouillon, copiez son identifiant et indiquez sa version :

```bash
npx @chibaskogames/cli validate mon-jeu.zip --game 11111111-1111-4111-8111-111111111111 --version 1.0.0
```

Sans ce contexte, le CLI vérifie le manifeste et les fichiers, mais ne compare
pas l’identifiant et la version à ceux d’un brouillon.

- **Manifeste absent** — téléchargez `chibasko.json` depuis votre brouillon
  sur [Publier un jeu](https://chibaskogames.fr/publier-un-jeu) et placez-le à la racine du ZIP.
- **Manifeste invalide** — corrigez le champ indiqué et reconstruisez le ZIP.
- **Fichier interdit** — retirez les fichiers de configuration d’hébergement
  tels que `_headers`. Vérifiez les besoins de votre jeu dans le lecteur.
- **Entrée HTML absente** — vérifiez le chemin et la casse du nom dans le ZIP.

Le CLI lit les fichiers dans un processus borné. Il ne lance pas le jeu et
n’envoie ni l’archive ni son contenu à Chibasko Games. Prévoir de la place
sur le disque temporaire pour une copie du ZIP et les fichiers de contrôle.
La politique courante accepte jusqu’à 500 Mio d’archive, 50 000 entrées et
16 Gio de contenu décompressé. Les contrôles s’arrêtent au premier problème
bloquant et l’extraction dispose de 15 minutes.

Pour la CI, épinglez la version du paquet et ajoutez `--json` :

```bash
npx --yes @chibaskogames/cli@0.1.0 validate mon-jeu.zip --json
```

Le JSON contient la révision de politique, le statut et les diagnostics.
La commande sort avec le code 1 si le contrôle est bloqué, ou 0 si la
structure passe, y compris lorsqu’un avertissement reste affiché.

La revue Chibasko Games vérifie ensuite l’archive envoyée et le fonctionnement
dans le lecteur. Le CLI est facultatif. Le portail web reste utilisable sans
terminal, et un jeu classique peut être soumis sans SDK.
