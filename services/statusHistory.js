import StatusChanges from '../models/statusChanges.model.js';

// Records a status change; never makes the change itself fail
export const recordStatusChange = async (
  userId,
  from,
  to,
  changedBy = null
) => {
  if (!userId || !to || from === to) return;
  try {
    await StatusChanges.create({
      user_id: userId,
      from_status: from || null,
      to_status: to,
      changed_by: changedBy || null,
    });
  } catch (err) {
    console.log('Status history not recorded:', err.message);
  }
};
