import { archiveUser, unarchiveUser } from '../services/archive.js';

const me = (req) => Number(req.user.userid ?? req.user.userId);

// Body: { reason, deleteSensitive }
export const archive = async (req, res) => {
  try {
    const result = await archiveUser(Number(req.params.id), {
      reason: req.body.reason,
      deleteSensitive: !!req.body.deleteSensitive,
      by: me(req),
    });
    if (result.error) return res.status(result.code).json(result);
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'archivage a échoué" });
  }
};

export const unarchive = async (req, res) => {
  try {
    const result = await unarchiveUser(Number(req.params.id), { by: me(req) });
    if (result.error) return res.status(result.code).json(result);
    res.json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Le désarchivage a échoué' });
  }
};

// Body: { ids, reason, deleteSensitive }; volunteers with pairs in progress
// are skipped and listed
export const archiveMany = async (req, res) => {
  const ids = [...new Set((req.body.ids || []).map(Number))].filter(Boolean);
  const archived = [];
  const blocked = [];
  try {
    for (const id of ids) {
      const result = await archiveUser(id, {
        reason: req.body.reason,
        deleteSensitive: !!req.body.deleteSensitive,
        by: me(req),
      });
      if (result.ok) archived.push(id);
      else blocked.push({ id, error: result.error, openPairs: result.openPairs || [] });
    }
    res.json({ archived, blocked });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "L'archivage a échoué", archived, blocked });
  }
};
