// Convention d'engagement réciproque: the volunteer signs it, the
// president countersigns it. One email at each step.
import sendEmail from '../config/sendEmails.js';
import {
  escapeHtml,
  clientUrl,
  adminEmails,
  emailButton,
} from '../config/notify.js';

const formatDate = (date) => new Date(date).toLocaleDateString('fr-FR');
const signature = "<p>À très vite,<br>L'équipe MyCogniverse</p>";
// Opens the volunteer's space on the convention tab after logging in
const conventionLink = () => `${clientUrl()}/login?onglet=convention`;

const send = (to, subject, html, label) =>
  sendEmail(to, subject, html).catch((err) =>
    console.log(`${label} email not sent:`, err.message)
  );

// Status "A finaliser": the volunteer can now sign the convention
export const notifyConventionToSign = (user) =>
  send(
    user.email2 || user.email,
    'Votre candidature est retenue : dernière étape, la convention',
    `<p>Bonjour ${escapeHtml(user.first_name)},</p>
    <p>Bonne nouvelle : à la suite de votre entretien, l'association Séphora Berrebi est heureuse de poursuivre avec vous !</p>
    <p>Dernière étape : signer la <b>convention d'engagement réciproque</b>.</p>
    <p>Tout se fait en ligne, dans l'onglet « Ma convention » de votre espace, en quelques minutes :</p>
    <ol>
      <li>lisez la Charte de bénévolat de l'association ;</li>
      <li>vérifiez votre convention, déjà remplie avec vos informations ;</li>
      <li>signez-la avec le doigt ou la souris.</li>
    </ol>
    <p>La présidente de l'association la signera à son tour : vous la retrouverez alors dans votre espace.</p>
    <p>${emailButton(conventionLink(), 'Signer ma convention')}</p>
    ${signature}`,
    'Convention to sign'
  );

// The volunteer uploaded the signed convention: the team countersigns it
export const notifyConventionSigned = (user) =>
  send(
    adminEmails(),
    `Convention signée par ${user.first_name} ${user.last_name} : à contresigner`,
    `<p>${escapeHtml(user.first_name)} ${escapeHtml(
      user.last_name
    )} a signé sa convention le ${formatDate(new Date())}.</p>
    <p>Elle est à contresigner par la présidente, depuis sa fiche (bloc « Convention »).</p>
    <p>${emailButton(
      `${clientUrl()}/login?candidat=${user.id}`,
      'Voir la fiche'
    )}</p>`,
    'Convention signed'
  );

// The countersigned convention is available to the volunteer
export const notifyConventionCountersigned = (user, honorabilityDue) =>
  send(
    user.email2 || user.email,
    "Votre convention est signée par l'association",
    `<p>Bonjour ${escapeHtml(user.first_name)},</p>
    <p>Votre convention d'engagement réciproque est désormais signée par vous et par la présidente de l'association. Vous pouvez la télécharger dans l'onglet « Ma convention » de votre espace.</p>
    ${
      user.honorability_received
        ? ''
        : `<p>Dernier document à fournir : votre <b>attestation d'honorabilité</b>${
            honorabilityDue
              ? `, au plus tard le ${formatDate(honorabilityDue)}`
              : ''
          }, à déposer dans l'onglet « Mes documents ».</p>`
    }
    <p>Merci pour votre engagement !</p>
    <p>${emailButton(conventionLink(), 'Accéder à mon espace')}</p>
    ${signature}`,
    'Convention countersigned'
  );

// Status "Validé": welcome message to the new tutor
export const notifyApplicationValidated = (user) =>
  send(
    user.email2 || user.email,
    "Bienvenue parmi les tuteurs bénévoles de l'association Séphora Berrebi",
    `<p>Bonjour ${escapeHtml(user.first_name)},</p>
    <p>Votre candidature est <b>validée</b> : bienvenue parmi les tuteurs bénévoles de l'association Séphora Berrebi !</p>
    <p>Nous recherchons maintenant, parmi les demandes de tutorat, l'élève qui correspond le mieux à vos souhaits et à vos disponibilités, et nous revenons vers vous très vite.</p>
    <p>D'ici là, pensez à tenir à jour vos disponibilités dans votre espace.</p>
    ${
      user.honorability_received
        ? ''
        : "<p>N'oubliez pas de déposer votre <b>attestation d'honorabilité</b> dans l'onglet « Mes documents », si ce n'est pas encore fait.</p>"
    }
    <p>${emailButton(`${clientUrl()}/login`, 'Accéder à mon espace')}</p>
    <p>Merci pour votre engagement,<br>L'équipe MyCogniverse</p>`,
    'Application validated'
  );
