# Analytics et CMP Google

Le portail conserve sa CMP Google AdSense. Le raccord ne modifie ni son message,
ni ses réglages ni la balise AdSense. Il ne crée pas de préférence utilisateur
persistante, de bandeau ou de seconde CMP.

## Ordre

1. Le head définit dataLayer/gtag et les quatre defaults denied avant les scripts.
2. SiteAnalytics enregistre un raccord unique pour la durée du document.
3. googlefc.callbackQueue / CONSENT_MODE_DATA_READY donne accès aux valeurs officielles.
4. Les valeurs sont converties puis envoyées par gtag('consent','update',…).
5. Analytics n’est configuré/chargé qu’après analytics_storage granted, hors lobby privé.
6. CONSENT_API_READY puis __tcfapi addEventListener suivent les décisions et leurs
   changements ; ces événements servent seulement à relire les valeurs Consent Mode.
   Aucune interprétation artisanale des finalités ou vendors TCF ne crée d’accord.

Seul GRANTED (1) est converti en granted. DENIED (2), UNKNOWN (0), NOT_APPLICABLE
(3), NOT_CONFIGURED (4), champs absents et erreurs restent denied. C’est une
politique conservatrice de mesure uniquement sur accord explicite, toutes régions.
Le chargement est différé : aucun tag GA ni ping GA avant cet accord. Un tag déjà
chargé n’est pas déchargeable ; la révocation applique d’abord ga-disable puis
transmet les nouveaux signaux. Les cookies antérieurs ne sont pas supprimés par
ce raccord. Les protections des URL et des lobbies privés restent actives.

## Prérequis de configuration Google

L’audit production du 22 octobre 2026 a constaté que les quatre valeurs de
getGoogleConsentModeValues() valaient NOT_CONFIGURED. Avec ce correctif, cet état
bloque Analytics, y compris si le message publicitaire a été accepté. Il ne faut
pas convertir NOT_CONFIGURED en permission ni assimiler le TCF publicitaire à
un consentement Analytics.

Le support Consent Mode et ses finalités Analytics doivent être configurés dans
l’interface Google Privacy & messaging pour que des valeurs GRANTED/DENIED soient
fournies. Cette préparation ne modifie pas ces réglages à distance. Tant que ce
prérequis n’est pas satisfait, la mesure reste désactivée ; aucune solution de
contournement n’est prévue.

## Recette

Vérifier dans un profil vierge : defaults denied avant config, aucun _ga ni requête
GA avant accord ; update puis un seul config/tag après accord ; refus initial sans
tag ; retrait puis aucune nouvelle collecte ; rechargement à partir du choix CMP ;
statuts non configurés et API indisponible fermés ; React StrictMode sans doublon ;
navigation vers lobby privé bloquée avant les listeners Analytics.

Les fixtures navigateur reproduisent les API officielles googlefc/TCF. La variante
GA_REAL_TAG_TEST=1 charge le vrai gtag public ; ses requêtes de collecte sont
interceptées localement pour ne pas ajouter de mesures en production.

Références Google :

- https://developers.google.com/funding-choices/fc-api-docs
- https://developers.google.com/tag-platform/security/guides/consent
