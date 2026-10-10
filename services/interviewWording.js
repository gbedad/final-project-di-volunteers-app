// Wording of the interview assessments: about what the mission needs, not
// verdicts on the person (RGPD: the volunteer may read them on request)
export const FOLLOWUP_VALUES = ['Oui', 'Avec accompagnement', 'Pas pour le moment'];
export const FRENCH_VALUES = ['Vérifiée', 'À vérifier', 'Attestée par les écrits'];
export const RECOMMENDATION_VALUES = ['À retenir', 'Ne pas retenir', 'À revoir'];
export const EXPERIENCE_VALUES = ['Confirmée', 'Quelques expériences', 'Débutant(e)'];

// Former values -> current ones ("aptitudes" is not converted: a judgment is
// not a length of experience; it stays as a former assessment)
export const FOLLOWUP_MAP = {
  'Pourquoi pas': 'Avec accompagnement',
  'A éviter': 'Pas pour le moment',
  'À éviter': 'Pas pour le moment',
  Non: 'Pas pour le moment',
};
export const FRENCH_MAP = {
  Requis: 'À vérifier',
  'Pas nécessaire': 'Attestée par les écrits',
  'Non nécessaire': 'Attestée par les écrits',
};
export const RECOMMENDATION_MAP = {
  'A recruter': 'À retenir',
  'A ne pas recruter': 'Ne pas retenir',
  NSP: 'À revoir',
};

export const modernizeInterview = (iv) => {
  if (!iv || typeof iv !== 'object') return iv;
  const out = { ...iv };
  if (FOLLOWUP_MAP[out.followup]) out.followup = FOLLOWUP_MAP[out.followup];
  if (FRENCH_MAP[out.test]) out.test = FRENCH_MAP[out.test];
  if (RECOMMENDATION_MAP[out.recommendation]) {
    out.recommendation = RECOMMENDATION_MAP[out.recommendation];
  }
  return out;
};
