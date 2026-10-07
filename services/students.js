// Students module: values shared by the API and the client lists

export const STUDENT_STATUSES = [
  'Nouvelle demande',
  'En attente de tuteur',
  'Binôme en cours',
  'En pause',
  'Terminé',
  'Abandon',
];

// Existing database enum: TOP, P1…P4
export const STUDENT_PRIORITIES = ['TOP', 'P1', 'P2', 'P3'];

// Fields the team can edit on a student's page
export const EDITABLE_FIELDS = [
  'first_name',
  'last_name',
  'birth_date',
  'level',
  'track',
  'school',
  'parent1_firstname',
  'parent1_lastname',
  'parent1_email',
  'parent1_phone',
  'parent2_firstname',
  'parent2_lastname',
  'parent2_email',
  'parent2_phone',
  'referral_source',
  'referral_contact',
  'topics',
  'goals',
  'needs',
  'special_needs',
  'when_day_slot',
  'how_location',
  'where_location',
  'status',
  'priority',
  'parental_consent_at',
  'comment',
];

// Columns of the students list
export const LIST_FIELDS = [
  'id',
  'first_name',
  'last_name',
  'birth_date',
  'level',
  'track',
  'school',
  'topics',
  'goals',
  'when_day_slot',
  'how_location',
  'where_location',
  'status',
  'priority',
  'referral_source',
  'is_demo',
  'parental_consent_at',
  'created_at',
];
