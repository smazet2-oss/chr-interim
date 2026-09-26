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

### Circuit d'une mission

1. **Demande** : l'employeur fait une demande, ou l'agence crée la mission. Elle apparaît « À valider par l'agence ».
2. **Diffusion** : l'agence clique sur « Valider et diffuser », choisit les intérimaires et le moyen d'envoi (WhatsApp, SMS, e-mail) et ajuste le taux horaire.
3. **Réponse des intérimaires** : ils voient la mission à leur connexion. Quand le nombre de personnes recherchées a accepté, le bouton « Accepter » se verrouille pour les autres. Ce contrôle est fait par le serveur, même en cas de clics simultanés.
4. **Choix de l'employeur** : il accepte ou refuse chaque intérimaire (l'agence peut aussi décider à sa place).
   - Un refus libère la place et réactive le bouton pour les autres.
   - L'intérimaire qui a accepté voit « En attente de confirmation » tant que la mission n'est pas validée.
5. **Verrouillage** : quand toutes les places sont confirmées, la mission est verrouillée. Les intérimaires retenus reçoivent la confirmation et accèdent aux documents : contrat de mission et documents déposés par l'employeur. Les autres voient « Non retenu ».
6. **Après la mission** : l'intérimaire confirme ses heures ou déclare des heures en plus avec une justification. L'employeur valide et accepte ou refuse les heures en plus. Chacun note l'autre en fin de service ; les avis reçus par les intérimaires sont anonymes.
7. **Facturation et paie** : l'agence génère les factures de la période (heures validées × taux × coefficient du client) et consulte la paie calculée, avec IFM et ICCP de 10 % chacune. Ce calcul est indicatif et doit être contrôlé par votre gestionnaire de paie.

### Dossier de l'intérimaire

- **Expériences** : l'intérimaire (ou l'agence) ajoute ses expériences passées avec le bouton « Ajouter ». Chaque mission verrouillée ajoute sa ligne toute seule ; elle disparaît si la mission est annulée.
- **Téléverser** : l'intérimaire dépose les pièces de son dossier et l'agence les valide ou les refuse (la raison du refus lui est affichée). Le dossier passe « complet » quand toutes les pièces exigées sont validées et non expirées. Pièces demandées :
  - **toujours** : pièce d'identité, carte Vitale ou attestation de droits, RIB, justificatif de domicile de moins de 3 mois ;
  - **selon la situation** : titre de séjour autorisant à travailler (nationalité hors UE, EEE et Suisse), autorisation parentale (moins de 18 ans) ;
  - **facultatives** : diplômes et certificats (HACCP…), attestation de suivi médical, permis de conduire, CV.
- **Contrats** : un contrat de mission est créé pour chaque intérimaire retenu. Il le lit en ligne (page imprimable) et le signe en saisissant son nom (signature électronique simple : date, heure et adresse IP enregistrées). Les informations de l'agence se règlent par variables d'environnement : `AGENCE_RAISON_SOCIALE`, `AGENCE_ADRESSE`, `AGENCE_SIRET`, `AGENCE_GARANTIE_FINANCIERE`, `CAISSE_RETRAITE`, `ORGANISME_PREVOYANCE`. Tant qu'elles sont vides, le contrat affiche « [à compléter] ».
- **Paie** : l'agence génère les fiches de paie d'une période (rubrique Paie), dépose le PDF produit par son logiciel de paie et les marque payées. L'intérimaire voit ses fiches payées ou en attente ; une **alerte** signale les heures non validées qui bloquent le paiement, avec ce qu'il manque (sa confirmation, la validation de l'employeur ou l'accord sur les heures en plus).

### Envoi des messages

Sans configuration, les messages ne sont **pas envoyés** : ils sont enregistrés comme « simulés » dans « Journal des envois ». Pour les envoyer réellement, renseignez les variables d'environnement (voir `.env.example`) :

- **E-mail** : un serveur SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Votre messagerie professionnelle, Brevo ou Mailjet conviennent.
- **SMS et WhatsApp** : un compte [Twilio](https://www.twilio.com) (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`).
  - WhatsApp exige un numéro validé par Meta et des modèles de messages approuvés pour écrire en premier à quelqu'un.
  - Les numéros de téléphone des fiches doivent être renseignés, par exemple 06 12 34 56 78.

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

- **RGPD** : registre des traitements, mentions d'information, durée de conservation (le numéro de sécurité sociale n'est volontairement pas collecté).
- **Contrats** : le modèle de contrat de mission et le motif de recours sont à faire valider par un juriste. La signature électronique intégrée est une signature « simple » ; pour une valeur probante renforcée, passer par un prestataire (Yousign, par exemple). Le contrat de mise à disposition avec l'employeur n'est pas encore généré.
- **Documents personnels** : les pièces d'identité et RIB sont des données sensibles ; prévoir leur durée de conservation et leur suppression à la fin de la relation.
- **Paie et factures** : validation des calculs par un expert-comptable. L'export vers votre logiciel de paie n'est pas prévu.
- **Hébergement** : sauvegardes automatiques et nom de domaine.

## Organisation du code

```
src/server.js     API : connexion, droits, missions, heures, documents, factures, paie
src/db.js         schéma de la base SQLite
src/notify.js     envoi e-mail, SMS et WhatsApp, et journal des envois
src/seed-demo.js  données de démonstration
public/           interface (HTML, CSS, JavaScript sans framework)
test/             tests automatiques de l'API
```
