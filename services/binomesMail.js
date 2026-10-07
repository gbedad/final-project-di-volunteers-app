// Emails of the tutor / student pairs
import sendEmail from '../config/sendEmails.js';
import {
  escapeHtml,
  clientUrl,
  adminEmails,
  emailButton,
} from '../config/notify.js';

const send = (to, subject, html, label) =>
  sendEmail(to, subject, html).catch((err) =>
    console.log(`${label} email not sent:`, err.message)
  );
const slotsText = (schedule = []) =>
  schedule.map((s) => `${s.day} ${s.startTime}–${s.endTime}`).join(', ');
const placeText = (binome) =>
  [binome.how_location, binome.site].filter(Boolean).join(' · ');

// New proposal: the tutor answers from their space
export const notifyPairProposed = (tutor, student, binome) =>
  send(
    tutor.email2 || tutor.email,
    `Proposition de tutorat : ${student.first_name}, ${student.level || ''}`.trim(),
    `<p>Bonjour ${escapeHtml(tutor.first_name)},</p>
    <p>L'association vous propose d'accompagner un élève :</p>
    <ul>
      <li><b>${escapeHtml(student.first_name)}</b>${student.level ? `, ${escapeHtml(student.level)}` : ''}</li>
      <li>Matière(s) : ${escapeHtml(binome.subjects.join(', '))}</li>
      ${binome.schedule?.length ? `<li>Créneau : ${escapeHtml(slotsText(binome.schedule))}</li>` : ''}
      ${placeText(binome) ? `<li>Lieu : ${escapeHtml(placeText(binome))}</li>` : ''}
      ${binome.start_date ? `<li>Début souhaité : ${new Date(binome.start_date).toLocaleDateString('fr-FR')}</li>` : ''}
    </ul>
    ${binome.note ? `<p>${escapeHtml(binome.note)}</p>` : ''}
    <p>Merci de nous dire si vous acceptez, depuis l'onglet « Mes élèves » de votre espace :</p>
    <p>${emailButton(`${clientUrl()}/login?onglet=eleves`, 'Voir la proposition')}</p>
    <p>À très vite,<br>L'équipe MyCogniverse</p>`,
    'Pair proposed'
  );

// The tutor accepted or declined
export const notifyPairAnswered = (tutor, student, binome) =>
  send(
    adminEmails(),
    `${tutor.first_name} ${tutor.last_name} ${
      binome.status === 'actif' ? 'accepte' : 'refuse'
    } le tutorat de ${student.first_name} ${student.last_name}`,
    `<p>${escapeHtml(tutor.first_name)} ${escapeHtml(tutor.last_name)} ${
      binome.status === 'actif'
        ? "<b>accepte</b> d'accompagner"
        : "<b>refuse</b> d'accompagner"
    } ${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)} (${escapeHtml(
      binome.subjects.join(', ')
    )}).</p>
    ${
      binome.decline_reason
        ? `<p>Motif : ${escapeHtml(binome.decline_reason)}</p>`
        : ''
    }
    ${
      binome.status === 'actif'
        ? "<p>Le binôme est actif : pensez à mettre en relation le tuteur et la famille.</p>"
        : '<p>Un autre tuteur peut être proposé depuis la fiche de l’élève.</p>'
    }
    <p>${emailButton(`${clientUrl()}/login?eleve=${student.id}`, "Voir la fiche de l'élève")}</p>`,
    'Pair answered'
  );
