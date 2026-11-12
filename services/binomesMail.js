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

// No session report for a month: reminder to the tutor
export const notifySessionReminder = (tutor, student, lastReport) =>
  send(
    tutor.email2 || tutor.email,
    `Comment se passe le tutorat avec ${student.first_name} ?`,
    `<p>Bonjour ${escapeHtml(tutor.first_name)},</p>
    <p>${
      lastReport
        ? `Votre dernier compte-rendu pour ${escapeHtml(student.first_name)} date du ${new Date(lastReport).toLocaleDateString('fr-FR')}.`
        : `Nous n'avons pas encore de compte-rendu pour ${escapeHtml(student.first_name)}.`
    } Pourriez-vous nous dire en quelques mots comment se passent les séances ?</p>
    <p>Un compte-rendu par mois suffit (date, durée, ce que vous avez travaillé, comment va l'élève) : cela ne prend qu'une minute, depuis l'onglet « Mes élèves » de votre espace.</p>
    <p>${emailButton(`${clientUrl()}/login?onglet=eleves`, 'Écrire mon compte-rendu')}</p>
    <p>Merci pour votre engagement,<br>L'équipe MyCogniverse</p>`,
    'Session reminder'
  );

// The student arrived 15 minutes late or more: the team is told each time
export const notifyLateArrival = (tutor, student, session) =>
  send(
    adminEmails(),
    `Retard de ${student.first_name} ${student.last_name} (séance du ${new Date(
      session.date
    ).toLocaleDateString('fr-FR')})`,
    `<p>${escapeHtml(tutor.first_name)} ${escapeHtml(tutor.last_name)} signale que <b>${escapeHtml(
      student.first_name
    )} ${escapeHtml(student.last_name)}</b> est arrivé(e) avec 15 minutes de retard ou plus à la séance du ${new Date(
      session.date
    ).toLocaleDateString('fr-FR')}.</p>
    <p>${emailButton(`${clientUrl()}/eleves/${student.id}`, "Voir la fiche de l'élève")}</p>`,
    'Late arrival'
  );

const frDay = (d) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const pairLink = (pair, action) => `${clientUrl()}/login?onglet=eleves&binome=${pair.id}&action=${action}`;

// The day before a school return: the next session, and two links (the
// slot changed / no session for now). next: { date, slot } or null
export const notifyResumeNotice = (tutor, student, pair, next) =>
  send(
    tutor.email2 || tutor.email,
    `Reprise du tutorat avec ${student.first_name}`,
    `<p>Bonjour ${escapeHtml(tutor.first_name)},</p>
    <p>C'est la rentrée demain. ${
      next
        ? `Votre prochaine séance avec <b>${escapeHtml(student.first_name)}</b> : <b>${frDay(next.date)}, ${escapeHtml(
            next.slot.startTime
          )}–${escapeHtml(next.slot.endTime)}</b>${placeText(pair) ? ` (${escapeHtml(placeText(pair))})` : ''}.`
        : `Nous n'avons pas de créneau prévu pour vos séances avec <b>${escapeHtml(student.first_name)}</b> ces prochains jours.`
    }</p>
    <p>Si quelque chose a changé, dites-le-nous en un clic :</p>
    <p>${emailButton(pairLink(pair, 'creneau'), 'Le créneau a changé')}</p>
    <p>${emailButton(pairLink(pair, 'pas-de-seance'), 'Pas de séance pour l’instant')}</p>
    <p>Sinon, rien à faire : bonne reprise !<br>L'équipe MyCogniverse</p>`,
    'Back to school'
  );

// The tutor tells a new slot: the team updates the pair
export const notifySlotRequest = (tutor, student, pair, request) =>
  send(
    adminEmails(),
    `Nouveau créneau signalé : ${student.first_name} ${student.last_name} · ${tutor.first_name} ${tutor.last_name}`,
    `<p>${escapeHtml(tutor.first_name)} ${escapeHtml(tutor.last_name)} signale un nouveau créneau pour ses séances avec
    <b>${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}</b> :</p>
    <ul>
      <li>Créneau actuel : ${escapeHtml(slotsText(pair.schedule) || 'aucun')}</li>
      <li>Nouveau créneau : <b>${escapeHtml(slotsText(request.schedule))}</b>${
        request.since ? ` à partir du ${new Date(`${request.since}T12:00:00Z`).toLocaleDateString('fr-FR')}` : ''
      }</li>
    </ul>
    ${request.note ? `<p>Message : ${escapeHtml(request.note)}</p>` : ''}
    <p>À appliquer dans la fiche du binôme (page « À traiter »).</p>
    <p>${emailButton(`${clientUrl()}/a-traiter`, 'À traiter')}</p>`,
    'Slot request'
  );

// A student of the pair goes on a cultural outing at the time of the session
export const notifyOutingConflict = (tutor, student, activity, slot) =>
  send(
    tutor.email2 || tutor.email,
    `Pas de séance le ${frDay(activity.date)} : ${student.first_name} est en sortie culturelle`,
    `<p>Bonjour ${escapeHtml(tutor.first_name)},</p>
    <p><b>${escapeHtml(student.first_name)}</b> participe à une sortie culturelle de l'association le
    <b>${frDay(activity.date)}</b>${activity.start_time ? `, de ${escapeHtml(activity.start_time)}${activity.end_time ? ` à ${escapeHtml(activity.end_time)}` : ''}` : ''}
    (${escapeHtml(activity.title)}) : votre séance de ${escapeHtml(slot.startTime)}–${escapeHtml(slot.endTime)} n'aura pas lieu ce jour-là.</p>
    <p>Si vous souhaitez la rattraper, convenez d'un autre moment avec l'association.</p>
    <p>${emailButton(`${clientUrl()}/login?onglet=eleves`, 'Mes élèves')}</p>
    <p>Merci,<br>L'équipe MyCogniverse</p>`,
    'Outing conflict'
  );

// The student no longer goes: the session takes place
export const notifyOutingCancelled = (tutor, student, activity, date) =>
  send(
    tutor.email2 || tutor.email,
    `Séance maintenue le ${frDay(date)} avec ${student.first_name}`,
    `<p>Bonjour ${escapeHtml(tutor.first_name)},</p>
    <p>Finalement, ${escapeHtml(student.first_name)} ne participe plus à la sortie « ${escapeHtml(activity.title)} » :
    votre séance du <b>${frDay(date)}</b> est maintenue.</p>
    <p>Merci,<br>L'équipe MyCogniverse</p>`,
    'Outing cancelled'
  );
