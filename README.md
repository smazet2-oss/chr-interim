# CHR Intérim

Plateforme de gestion d'intérim pour l'hôtellerie-restauration, avec trois espaces selon le profil du compte :

- **Agence** : contrôle complet (missions, intérimaires, clients, heures, facturation, paie, accès).
- **Employeur** : demandes de missions, choix des intérimaires, heures, notes de fin de service, dépôt de documents. Le reste est en lecture seule.
- **Intérimaire** : missions proposées, disponibilités, heures, notes de fin de service. Le reste est en lecture seule.

Les droits sont vérifiés par le serveur : un employeur ou un intérimaire ne peut pas contourner l'interface pour modifier ce qui est réservé à l'agence.

## Démarrer sur un ordinateur

Il faut **Node.js 22.13 ou plus récent** ([nodejs.org](https://nodejs.org)).

```bash
npm install
npm run demo      # facultatif : installe des données de démonstration fictives
npm start
```

Ouvrez ensuite http://localhost:3000.

- **Sans `npm run demo`** : au premier démarrage, le serveur crée le compte agence `admin` et affiche son mot de passe provisoire dans le terminal. Il faudra le changer à la première connexion.
- **Avec la démonstration** : mot de passe `Demo2026!` pour `claire.morel` (agence), `comptoir.lyon` (employeur), `yanis.benali`, `lucas.martin`, `thomas.petit` (intérimaires). `camille.roux` a le mot de passe provisoire `Provisoire1`, pour tester la première connexion.
- `npm run demo:reset` efface toutes les données et réinstalle la démonstration.
- `npm test` lance les tests automatiques du circuit complet.

## Fonctionnement

### Comptes et connexion

- L'agence crée l'accès depuis la fiche d'un employeur ou d'un intérimaire (« Créer l'identifiant et le mot de passe »). Les collaborateurs de l'agence s'ajoutent dans « Accès utilisateurs ».
- Le mot de passe provisoire n'est affiché qu'une fois. Il est stocké chiffré (bcrypt) et doit être remplacé à la première connexion : 8 caractères minimum, avec une majuscule et un chiffre.
- L'agence peut réinitialiser un mot de passe ou désactiver un compte.

### Paramètres de l'agence

La rubrique **Paramètres** de l'espace agence regroupe :

- **Identité légale et contact** : raison sociale, forme juridique, capital, SIRET, RCS, APE, TVA intracommunautaire, adresse, contact, garantie financière, caisse de retraite, organisme de prévoyance. Ces informations figurent sur les contrats et les factures. Un bandeau signale celles qui manquent.
- **Facturation** : préfixe des numéros, taux de TVA (enregistré sur chaque facture émise), délai de paiement par défaut, pénalités de retard, IBAN, BIC, mentions complémentaires. Chaque facture est consultable et imprimable (bouton « Voir ») par l'agence et par le client concerné.
- **Paie** : taux de l'indemnité de fin de mission et des congés payés, convention collective, calendrier de versement.
- **Messagerie** : serveur SMTP pour l'e-mail, compte Twilio pour les SMS et WhatsApp, avec un bouton d'envoi de test.

Les mots de passe et clés sont chiffrés (AES-256-GCM) avec une clé propre à l'installation, créée dans `DATA_DIR/secret.key`, ou dérivée de `APP_SECRET` si cette variable est définie. Ils ne sont jamais renvoyés à l'écran. Les variables d'environnement de `.env.example` restent possibles, mais les valeurs saisies dans Paramètres priment.

### Suspendre ou supprimer un profil

Sur la fiche d'un intérimaire ou d'un client, l'agence dispose de deux boutons :

- **Suspendre** (réversible) : les sessions en cours sont fermées et la connexion est refusée. Un intérimaire suspendu ne reçoit plus de missions et n'apparaît plus au planning ni chez les employeurs ; aucune mission ne peut être créée pour un client suspendu. Les données sont conservées ; « Réactiver » rétablit l'accès.
- **Supprimer** (définitif) : efface la fiche, ses comptes et ses documents. La suppression est refusée si le profil a un historique à conserver légalement (contrats, fiches de paie, factures, heures travaillées) : il faut alors le suspendre.

### Circuit d'une mission

1. **Demande** : l'employeur fait une demande, ou l'agence crée la mission. Elle apparaît « À valider par l'agence ».
2. **Diffusion** : l'agence clique sur « Valider et diffuser », choisit les intérimaires et le moyen d'envoi (WhatsApp, SMS, e-mail) et ajuste le taux horaire.
3. **Réponse des intérimaires** : ils voient la mission à leur connexion. Quand le nombre de personnes recherchées a accepté, le bouton « Accepter » se verrouille pour les autres. Ce contrôle est fait par le serveur, même en cas de clics simultanés.
4. **Choix de l'employeur** : il accepte ou refuse chaque intérimaire (l'agence peut aussi décider à sa place).
   - Un refus libère la place et réactive le bouton pour les autres.
   - L'intérimaire qui a accepté voit « En attente de confirmation » tant que la mission n'est pas validée.
5. **Contrats et validation** : quand toutes les places sont confirmées, la mission est « pourvue » et un contrat de mission est établi pour chaque intérimaire retenu, rempli automatiquement (voir plus bas). L'intérimaire et l'employeur le signent en ligne dans leur espace. **La mission est validée quand tous ses contrats sont signés par les deux parties** ; l'intérimaire voit alors « Mission confirmée » et les coordonnées sur place. Les autres voient « Non retenu ».
6. **Après la mission** : l'intérimaire confirme ses heures ou déclare des heures en plus avec une justification. L'employeur valide et accepte ou refuse les heures en plus. Chacun note l'autre en fin de service ; les avis reçus par les intérimaires sont anonymes.
7. **Facturation et paie** : l'agence génère les factures de la période (heures validées × taux horaire brut, majorations horaires comprises, × coefficient du client) et consulte la paie calculée, avec IFM et ICCP de 10 % chacune. Ce calcul est indicatif et doit être contrôlé par votre gestionnaire de paie.

### Contrat de mission et signature

Le contrat reprend le modèle HCR (IDCC 1979) en 9 articles : parties, motif de recours (avec le salarié remplacé), poste et classification HCR (niveau et échelon), tâches, risques et équipements de protection, durée et temps de travail, période d'essai, rémunération (taux horaire brut, majorations, repas HCR, fin de mission, congés payés), hygiène et sécurité, visite d'information et de prévention, retraite et prévoyance.

- **Rempli automatiquement** avec les Paramètres de l'agence (dont le représentant légal), la fiche de l'intérimaire (naissance, n° de sécurité sociale, domicile), la fiche du client et la mission. Tâches, risques et équipements prennent les valeurs habituelles du poste, modifiables à la création de la mission. Les termes sont figés à l'émission.
- **Signature** : l'intérimaire (nom exact) et l'employeur (nom et fonction) recopient « Lu et approuvé » et signent dans leur espace. Date, heure et adresse de connexion sont enregistrées ; l'agence est signataire à l'émission.
- **Confidentialité** : la version de l'employeur n'affiche ni la date et le lieu de naissance, ni le n° de sécurité sociale, ni le domicile de l'intérimaire.
- **Consultation** : le contrat signé reste disponible dans les trois espaces (rubrique « Contrats de mission » pour l'agence et l'employeur, « Contrats » pour l'intérimaire), imprimable ou enregistrable en PDF.

### Relances

- **Contrats non signés** : bouton « Relancer » pour l'agence ; relance automatique toutes les 24 h (toutes les 4 h si la mission commence dans moins de 24 h), 3 fois au plus, par e-mail, SMS et WhatsApp s'il est configuré, avec une notification dans l'espace concerné. Seule la partie qui n'a pas signé est relancée.
- **Factures échues** : bouton « Relancer » dans Facturation ; relance automatique tous les 7 jours, 3 fois au plus.
- Réglages dans Paramètres › Relances ; historique dans « Contrats de mission ».

### Coefficient, contrat commercial et convention HCR

- **Coefficient** : 1,45 par défaut pour chaque entreprise (Paramètres › Facturation), modifiable uniquement à la hausse. Dans Clients, « Nouveau contrat » établit un contrat commercial (coefficient, délai de paiement, conditions particulières) avec un aperçu de la marge. Dès que l'entreprise le signe dans « Mon contrat » (ou que l'agence le marque « signé sur papier »), son coefficient et son délai s'appliquent automatiquement aux simulations et aux factures.
- **Taux horaires HCR** (Paramètres › Convention HCR) : grille par niveau et échelon, niveau de chaque poste, SMIC en plancher. Le taux horaire brut d'une mission prend le minimum du poste, modifiable à la hausse.
- **Majorations selon les horaires** : nuit (22 h – 7 h), dimanche, jours fériés (calculés automatiquement, Pâques comprise) et 1er mai. Valeurs HCR par défaut : seul le 1er mai est majoré (100 %, obligation légale) ; la nuit est compensée en repos dans la convention. Les majorations s'appliquent à la paie, aux factures, au contrat et aux simulations.

### Prospects et page « Besoin de renforts ? »

- **Page publique** `/contact` (lien depuis la page de connexion) : les hôtels, cafés et restaurants remplissent le questionnaire de l'étude de marché (établissement, besoins, solutions actuelles, attentes, budget, suivi) avec leur accord pour être recontactés. L'agence reçoit un e-mail d'alerte.
- **Espace agence › Prospects** : demandes du site et **visites terrain** saisies avec le même questionnaire (date, enquêteur, accord écrit ou oral), statut, date de relance, notes, conversion en fiche client (coefficient par défaut) et suppression à la demande de la personne. Les prospects à relancer apparaissent dans le tableau de bord.

### Candidatures d'intérimaires

- **Page publique** `/candidature`, deuxième onglet de la page de contact (« Je cherche des missions ») et lien depuis la page de connexion : identité, autorisation de travail, postes recherchés, expérience et formations, disponibilités, mobilité et tenue, attentes (taux souhaité, canal préféré), CV facultatif (PDF, Word ou photo, 5 Mo, contenu vérifié) et accord de conservation. L'agence reçoit un e-mail d'alerte.
- **Espace agence › Candidatures** : réponses complètes, CV, statut (nouvelle, à rappeler, entretien, inscrit, sans suite), date de rappel, notes, création de la fiche intérimaire en un clic et suppression (CV compris) à la demande de la personne. Les candidatures nouvelles ou à rappeler apparaissent dans le tableau de bord.

### Calendriers et détail d'une journée

Les trois espaces affichent le planning sous forme de **calendrier mensuel standard** (lundi → dimanche, numéro de semaine en colonne de gauche). La **semaine en cours** est repérée par une flèche ▶ et un liseré doré, le jour même par un cadre bleu nuit. Chaque mission apparaît dans sa case (heure, poste, postes pourvus), en couleur selon son état ; sur mobile, les missions deviennent des barres de couleur.

**Importance haute** : une mission du jour même commençant à 16 h ou plus tard (« ce soir ») porte une icône d'alerte rouge dans le calendrier, les listes de missions, le détail du jour et les notifications. Chez l'agence, celles qui ne sont pas encore pourvues passent en tête de « À traiter ».

Les cases, les missions et les en-têtes de jour sont cliquables (souris, doigt ou clavier : Entrée / Espace). Un clic sur une date ouvre le détail de la journée, structuré par mission, selon le profil :

- **Agence** (Planning, onglets « Calendrier du mois » et « Semaine par intérimaire ») : toutes les missions du jour, avec lieu, interlocuteur, taux et motif, et les intérimaires regroupés par état (validés, en attente de l'employeur, refusés, non retenus, sans réponse, ont décliné). Pour chacun : moyen d'envoi, contrat et heures. S'y ajoutent les intérimaires disponibles et indisponibles ce jour-là. L'agence peut accepter ou refuser un candidat depuis cette fenêtre.
- **Employeur** (Planning) : calendrier du mois ; pour chaque mission, les intérimaires validés (avec leur téléphone une fois la mission verrouillée), en attente de sa décision (boutons Accepter / Refuser) et refusés.
- **Intérimaire** (Mon planning) : un clic sur un jour libre le passe en disponible, indisponible puis non renseigné ; un clic sur un jour de mission affiche le lieu, les horaires, le taux, l'état, le contrat (lecture, signature), les heures, les documents et, une fois la mission confirmée, le contact sur place et les collègues. Il peut accepter ou refuser une mission proposée depuis cette fenêtre.

### Simulation de paie et de coût

Chaque mission affiche une simulation repliable (résumé visible, détail au clic), calculée sur les horaires prévus avec les taux de la rubrique Paramètres :

- **Intérimaire** (fenêtre de nouvelle mission à la connexion, Missions proposées, détail du jour) : salaire de base, indemnité de fin de mission (non due pour un emploi d'usage ou saisonnier), indemnité de congés payés, total brut et net estimé. Le SMS, l'e-mail ou le WhatsApp de diffusion annonce aussi le brut estimé.
- **Employeur** (Mes missions, détail du jour, formulaire de demande en direct) : heures × personnes × taux facturé (taux horaire × coefficient du client), HT, TVA et TTC.
- **Agence** (Missions, détail du jour, création et diffusion en direct, y compris quand le taux est modifié) : coût client, paie des intérimaires, charges patronales estimées, coût agence et marge.

Chaque profil ne reçoit du serveur que ses propres chiffres : l'intérimaire ne voit ni la facturation ni la marge, l'employeur ne voit pas la marge. Les taux « Cotisations salariales moyennes » et « Charges patronales moyennes » (Paramètres › Paie) servent uniquement à ces estimations.

### Dossier de l'intérimaire

- **Expériences** : l'intérimaire (ou l'agence) ajoute ses expériences passées avec le bouton « Ajouter ». Chaque mission verrouillée ajoute sa ligne toute seule ; elle disparaît si la mission est annulée.
- **Téléverser** : l'intérimaire dépose les pièces de son dossier et l'agence les valide ou les refuse (la raison du refus lui est affichée). Le dossier passe « complet » quand toutes les pièces exigées sont validées et non expirées. Pièces demandées :
  - **toujours** : pièce d'identité, carte Vitale ou attestation de droits, RIB, justificatif de domicile de moins de 3 mois ;
  - **selon la situation** : titre de séjour autorisant à travailler (nationalité hors UE, EEE et Suisse), autorisation parentale (moins de 18 ans) ;
  - **facultatives** : diplômes et certificats (HACCP…), attestation de suivi médical, permis de conduire, CV.
- **Contrats** : voir « Contrat de mission et signature ». Tant qu'une information de l'agence ou de l'intérimaire manque, le contrat affiche « [à compléter] ».
- **Paie** : l'agence génère les fiches de paie d'une période (rubrique Paie), dépose le PDF produit par son logiciel de paie et les marque payées. L'intérimaire voit ses fiches payées ou en attente ; une **alerte** signale les heures non validées qui bloquent le paiement, avec ce qu'il manque (sa confirmation, la validation de l'employeur ou l'accord sur les heures en plus).

### Envoi des messages

Les réglages se font dans l'espace agence, rubrique **Paramètres › Messagerie**, qui contient un guide pas à pas. Sans réglage, les messages sont enregistrés comme « simulés » dans le **Journal des envois**, qui indique pour chaque envoi : envoyé, simulé ou échec (avec la raison).

- **E-mail** (SMTP : Brevo, Microsoft 365, Google Workspace, OVH…) : message HTML aux couleurs de l'agence. Le bandeau est intégré au message comme pièce jointe, ce qui l'affiche même sans accès au site. Le message comporte un bouton vers la plateforme, les coordonnées et les mentions légales en pied de page, ainsi qu'une version texte. Les réponses vont à l'e-mail de contact de l'agence. Le bouton « Aperçu de l'e-mail » montre le rendu.
- **SMS** (Twilio) : expéditeur alphanumérique « CHR Interim » (11 caractères maximum) ou numéro Twilio. Un SMS ne peut pas contenir d'image.
- **WhatsApp** (Twilio + numéro validé par Meta) : le bandeau est joint en image si l'adresse du site est en https. Pour écrire en premier à quelqu'un, WhatsApp exige un modèle approuvé : renseignez son identifiant `HX…` (variable `{{1}}` = texte du message).
- **Envoi des identifiants** : à la création ou à la réinitialisation d'un accès, la fenêtre des identifiants propose de les envoyer par e-mail, SMS ou WhatsApp aux coordonnées de la fiche. Le mot de passe provisoire est masqué dans le journal.
- Les erreurs Twilio courantes sont traduites (identifiants refusés, numéro invalide, compte d'essai, pays non autorisé, modèle WhatsApp requis).

L'envoi est testé de bout en bout (`test/envoi.test.js`) contre un faux serveur SMTP et une fausse API Twilio.

## Mettre en ligne

L'application a besoin d'un hébergement Node.js **avec un disque persistant** : la base SQLite et les documents déposés sont dans le dossier `DATA_DIR`.

- **Render** : le fichier `render.yaml` est prêt. Déposez le code sur GitHub, puis dans Render choisissez « New > Blueprint ». Comptez environ 7 $ par mois : offre Starter, plus 1 Go de disque.
- **Tout hébergeur compatible Docker** (Railway, Fly.io, un serveur OVH…) : un `Dockerfile` est fourni. Montez un volume sur `/data`.

Variables importantes en production :

- `NODE_ENV=production` : cookies sécurisés, HTTPS obligatoire.
- `APP_URL` : l'adresse publique, insérée dans les messages.
- `ADMIN_PASSWORD` : mot de passe provisoire du premier compte agence.

Sauvegardez régulièrement le dossier `DATA_DIR`.

## Sécurité en place

- Mots de passe chiffrés avec bcrypt. Le mot de passe provisoire est à changer à la première connexion.
- Sessions par cookie `HttpOnly` et `SameSite=Strict`. Elles sont supprimées à la désactivation du compte ou au changement de mot de passe.
- Protection contre les requêtes venant d'autres sites (en-tête obligatoire sur toute écriture).
- Connexion limitée à 10 tentatives par quart d'heure et par adresse IP.
- Droits vérifiés à chaque requête côté serveur. Un intérimaire ne voit que ses missions et n'accède aux documents d'un employeur qu'après confirmation. Un employeur ne voit que ses propres données.
- Documents limités aux formats PDF, image ou Word, 10 Mo maximum. Ils sont stockés sous un nom aléatoire.

## Avant une utilisation réelle

Ce prototype est fonctionnel, mais plusieurs points sont à traiter avant de l'ouvrir à de vrais clients et intérimaires :

- **RGPD** : registre des traitements, mentions d'information, durée de conservation. Le numéro de sécurité sociale est collecté pour le contrat de mission : il n'est visible que par l'agence et l'intérimaire. Les prospects peuvent être supprimés à leur demande.
- **Contrats** : le modèle de contrat de mission, le contrat commercial et les valeurs HCR par défaut (grille, SMIC, repas) sont à faire valider par un juriste et à mettre à jour à chaque avenant. La signature électronique intégrée est une signature « simple » ; pour une valeur probante renforcée, passer par un prestataire (Yousign, par exemple).
- **Documents personnels** : les pièces d'identité et RIB sont des données sensibles ; prévoir leur durée de conservation et leur suppression à la fin de la relation.
- **Paie et factures** : validation des calculs par un expert-comptable. L'export vers votre logiciel de paie n'est pas prévu.
- **Hébergement** : sauvegardes automatiques et nom de domaine.

## Organisation du code

```
src/server.js     API : connexion, droits, missions, heures, documents, factures, paie
src/db.js         schéma de la base SQLite
src/notify.js     envoi e-mail, SMS et WhatsApp, et journal des envois
src/contrat-mission.js  contrat de mission HCR rempli automatiquement
src/contrats-clients.js contrat commercial et coefficient de chaque entreprise
src/hcr.js, src/hcr-grille.js  convention HCR : taux par poste, majorations, jours fériés
src/relances.js   relances des contrats non signés et des factures échues
src/prospects.js  page publique « Besoin de renforts ? » et suivi des prospects
src/candidats.js  page publique « Je cherche des missions » et suivi des candidatures
src/simulation.js simulation de paie, de coût et de marge
src/seed-demo.js  données de démonstration
public/           interface (HTML, CSS, JavaScript sans framework)
test/             tests automatiques de l'API
```
