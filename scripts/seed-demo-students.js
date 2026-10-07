// Fictitious students to try the students module (is_demo = true). They
// can all be removed with scripts/remove-demo-students.js.
//   node scripts/seed-demo-students.js          -> dry run
//   node scripts/seed-demo-students.js --apply  -> inserts them
import db from '../config/database.js';
import Students from '../models/students/students.model.js';

const apply = process.argv.includes('--apply');

const school = (name, city, zipcode, rep = null, type = 'Collège') => ({
  uai: null,
  name: `${name} (démo)`,
  type,
  city,
  zipcode,
  sector: 'Public',
  rep,
});
const SCHOOLS = {
  daumesnil: school('Collège Daumesnil', 'Paris', '75012', 'REP'),
  aubervilliers: school('Collège Jean Moulin', 'Aubervilliers', '93300', 'REP+'),
  goutte: school("Collège de la Goutte d'Or", 'Paris', '75018', 'REP+'),
  lyceeParis: school('Lycée Paul Valéry', 'Paris', '75012', null, 'Lycée'),
  lyceeAuber: school('Lycée Le Corbusier', 'Aubervilliers', '93300', null, 'Lycée'),
  ecole: school('École élémentaire Picpus', 'Paris', '75012', 'REP', 'Ecole'),
};
const slot = (day, startTime, endTime) => ({ day, startTime, endTime });
const topic = (subject, priority = 'haute') => ({ subject, priority });

const STUDENTS = [
  ['Lina', 'Benali', '4ème', null, 'daumesnil', [topic('Mathématiques'), topic('Français', 'moyenne')], ['Remise à niveau'], [slot('Mercredi', '14:00', '16:00')], 'Sur site', ['Paris 12ème'], 'En attente de tuteur', 'P1', 'Établissement scolaire'],
  ['Yanis', 'Traoré', '3ème', null, 'aubervilliers', [topic('Mathématiques'), topic('Physique-Chimie', 'moyenne')], ['Préparation du brevet'], [slot('Samedi', '10:00', '12:00')], 'Sur site', ['Aubervilliers'], 'En attente de tuteur', 'TOP', 'Établissement scolaire'],
  ['Sarah', 'Nguyen', 'Seconde', 'Générale', 'lyceeParis', [topic('Mathématiques')], ['Méthodologie'], [slot('Mardi', '18:00', '19:30')], 'A distance', [], 'En attente de tuteur', 'P2', 'Famille'],
  ['Adam', 'Diallo', '6ème', null, 'goutte', [topic('Français'), topic('Anglais', 'basse')], ['Aide aux devoirs'], [slot('Mercredi', '10:00', '12:00')], 'Sur site', ['Paris 18ème'], 'Nouvelle demande', 'P2', 'Assistante sociale'],
  ['Inès', 'Moreau', 'Terminale', 'Générale', 'lyceeParis', [topic('Philosophie'), topic('Histoire-Géographie', 'moyenne')], ['Préparation du bac'], [slot('Samedi', '14:00', '16:00')], 'Sur site ou à distance', ['Paris 12ème'], 'En attente de tuteur', 'P1', 'Famille'],
  ['Mehdi', 'Haddad', '5ème', null, 'daumesnil', [topic('Mathématiques'), topic('Français')], ['Remise à niveau', 'Méthodologie'], [slot('Lundi', '17:00', '18:30'), slot('Jeudi', '17:00', '18:30')], 'Sur site', ['Paris 12ème'], 'En attente de tuteur', 'P1', 'Établissement scolaire'],
  ['Chloé', 'Lambert', 'CM2', null, 'ecole', [topic('Français'), topic('Mathématiques', 'moyenne')], ['Aide aux devoirs'], [slot('Mercredi', '14:00', '15:30')], 'Sur site', ['Paris 12ème'], 'Nouvelle demande', 'P3', 'Établissement scolaire'],
  ['Moussa', 'Camara', 'Première', 'Technologique', 'lyceeAuber', [topic('Mathématiques'), topic('Physique-Chimie')], ['Remise à niveau'], [slot('Mercredi', '15:00', '17:00')], 'A distance', [], 'En attente de tuteur', 'P2', 'Association partenaire'],
  ['Emma', 'Petit', '3ème', null, 'goutte', [topic('Anglais'), topic('Mathématiques', 'moyenne')], ['Préparation du brevet'], [slot('Samedi', '10:00', '12:00')], 'Sur site', ['Paris 18ème'], 'En attente de tuteur', 'P2', 'Famille'],
  ['Rayan', 'Ziani', '4ème', null, 'aubervilliers', [topic('Français'), topic('Histoire-Géographie', 'basse')], ['Méthodologie'], [slot('Mardi', '17:00', '18:30')], 'Sur site', ['Aubervilliers'], 'En pause', 'P3', 'Établissement scolaire'],
  ['Aya', 'Kone', 'Seconde', 'Générale', 'lyceeAuber', [topic('SVT'), topic('Physique-Chimie', 'moyenne')], ['Remise à niveau'], [slot('Dimanche', '10:00', '12:00')], 'A distance', [], 'En attente de tuteur', 'P2', 'Famille'],
  ['Lucas', 'Fontaine', '5ème', null, 'daumesnil', [topic('Anglais'), topic('Espagnol', 'basse')], ['Aide aux devoirs'], [slot('Vendredi', '17:00', '18:00')], 'Sur site ou à distance', ['Paris 12ème'], 'Nouvelle demande', 'P3', 'Famille'],
  ['Nour', 'Belkacem', 'Terminale', 'Générale', 'lyceeParis', [topic('Mathématiques'), topic('Informatique', 'moyenne')], ['Préparation du bac'], [slot('Jeudi', '18:00', '20:00')], 'A distance', [], 'En attente de tuteur', 'P1', 'Établissement scolaire'],
  ['Hugo', 'Robert', '6ème', null, 'ecole', [topic('Mathématiques'), topic('Français', 'moyenne')], ['Remise à niveau'], [slot('Samedi', '09:00', '11:00')], 'Sur site', ['Paris 12ème'], 'En attente de tuteur', 'P2', 'Assistante sociale'],
  ['Fatoumata', 'Sylla', '4ème', null, 'goutte', [topic('Mathématiques'), topic('Anglais', 'moyenne')], ['Aide aux devoirs', 'Méthodologie'], [slot('Mercredi', '14:00', '16:00')], 'Sur site', ['Paris 18ème'], 'Nouvelle demande', 'P1', 'Association partenaire'],
  ['Noah', 'Garcia', 'Première', 'Générale', 'lyceeParis', [topic('Français'), topic('Philosophie', 'basse')], ['Préparation du bac'], [slot('Samedi', '14:00', '16:00')], 'Sur site ou à distance', ['Paris 12ème'], 'En attente de tuteur', 'P2', 'Famille'],
  ['Jade', 'Mercier', '3ème', null, 'daumesnil', [topic('Physique-Chimie'), topic('SVT', 'moyenne')], ['Préparation du brevet'], [slot('Mardi', '17:30', '19:00')], 'Sur site', ['Paris 12ème'], 'En attente de tuteur', 'P2', 'Établissement scolaire'],
  ['Ilyes', 'Mansouri', 'CM1', null, 'ecole', [topic('Français')], ['Aide aux devoirs'], [slot('Lundi', '16:30', '18:00')], 'Sur site', ['Paris 12ème'], 'Abandon', 'P3', 'Famille'],
];

const rows = STUDENTS.map(
  (
    [first, last, level, track, schoolKey, topics, goals, slots, how, where, status, priority, source],
    i
  ) => ({
    first_name: first,
    last_name: last,
    birth_date: new Date(2026 - 6 - ['CM1', 'CM2', '6ème', '5ème', '4ème', '3ème', 'Seconde', 'Première', 'Terminale'].indexOf(level) - 4, i % 12, 10),
    level,
    track,
    school: SCHOOLS[schoolKey],
    topics,
    goals,
    needs: `Élève de démonstration : besoins en ${topics.map((t) => t.subject.toLowerCase()).join(' et ')}.`,
    when_day_slot: slots,
    how_location: how,
    where_location: where,
    status,
    priority,
    referral_source: source,
    referral_contact: source === 'Famille' ? null : 'Contact de démonstration',
    parent1_firstname: 'Parent',
    parent1_lastname: last,
    parent1_email: `parent.${last.toLowerCase()}@example.invalid`,
    parent1_phone: `+33 6 00 00 00 ${String(10 + i)}`,
    parental_consent_at: status === 'Nouvelle demande' ? null : new Date(),
    is_demo: true,
  })
);

const existing = await Students.count({ where: { is_demo: true } });
console.log(`${existing} demo student(s) already in the database.`);
console.log(`${rows.length} demo student(s) to add:`);
for (const r of rows) {
  console.log(
    `  ${r.first_name} ${r.last_name} | ${r.level} | ${r.topics.map((t) => t.subject).join(', ')} | ${r.when_day_slot.map((s) => `${s.day} ${s.startTime}-${s.endTime}`).join(', ')} | ${r.how_location} ${r.where_location.join(', ')} | ${r.status}`
  );
}
if (apply) {
  if (existing) {
    console.log('Demo students already exist: run remove-demo-students first.');
  } else {
    await Students.bulkCreate(rows);
    console.log('Applied.');
  }
} else {
  console.log('Dry run only. Add --apply to insert them.');
}
await db.close();
