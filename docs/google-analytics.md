# Vérifier Google Analytics 4

Le portail utilise la balise Google `G-H10SZPPWWX` et le choix enregistré par le message de confidentialité AdSense existant. Un signal Analytics absent ou non configuré laisse la mesure désactivée.

## Réglages Google à contrôler

1. Dans AdSense, ouvrir **Confidentialité et messages → Réglementations européennes → Paramètres**. Vérifier que le message concerne `chibaskogames.fr` et que le mode Consentement pour Analytics est activé. Google rend cette option disponible lorsque le mode Consentement publicitaire est activé. Vérifier la portée de ce réglage avant de l’enregistrer, car il peut s’appliquer à d’autres sites du compte. [Aide AdSense](https://support.google.com/adsense/answer/16053245?hl=fr)
2. Dans GA4, ouvrir **Administration → Flux de données → flux Web de Chibasko Games** et confirmer `G-H10SZPPWWX`. Désactiver la mesure améliorée sur ce flux avant de déployer le suivi manuel. Elle peut enregistrer des changements d’historique et d’autres interactions indépendamment de `send_page_view: false`. Vérifier aussi que des règles de création d’événements ou des balises liées ne recréent pas `page_view`. [Guide Google sur les pages vues](https://developers.google.com/analytics/devguides/collection/ga4/views)

## Vérification après déploiement

1. Utiliser un profil Chrome neuf sans bloqueur pour le test. Dans l’onglet Réseau, filtrer `gtag/js` et `collect`. Avant tout choix, puis après refus, vérifier l’absence de ces requêtes pour le flux et de cookies `_ga`.
2. Ouvrir les options du message Google et accepter la mesure d’audience. Vérifier le chargement de la balise une fois et l’apparition d’un `page_view` dans Tag Assistant. Le rapport **Temps réel** du flux doit ensuite refléter la visite.
3. Naviguer de l’accueil au catalogue puis à une fiche. Vérifier un `page_view` par changement de chemin, y compris au retour navigateur. Une recherche qui change uniquement la query string ne doit pas créer de page vue. Contrôler que les URL transmises ne contiennent ni paramètres ni fragments et qu’aucun identifiant de compte n’est envoyé.
4. Ouvrir les options de confidentialité du message Google et retirer l’accord Analytics. Vérifier l’absence de nouveaux événements Analytics après navigation et après rechargement. Les cookies déjà créés peuvent rester visibles jusqu’à leur expiration ou suppression.

Les sources sont limitées au domaine référent disponible dans le navigateur. Les paramètres de campagne ne sont pas transmis. Les zones privées et les interactions dans les jeux tiers sont hors mesure. Une session qui refuse ou bloque la balise ne doit produire aucune donnée dans GA4.
