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
    <ol>
      <li>Téléchargez la convention dans l'onglet « Ma convention » de votre espace ;</li>
      <li>complétez-la et signez-la ;</li>
      <li>déposez-la au même endroit.</li>
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
    )} a déposé sa convention signée le ${formatDate(new Date())}.</p>
    <p>Elle est à faire signer par la présidente, puis à redéposer depuis sa fiche (bloc « Convention »).</p>
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
