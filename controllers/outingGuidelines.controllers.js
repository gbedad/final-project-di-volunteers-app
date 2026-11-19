import { getGuidelines, saveGuidelines } from '../services/outingGuidelines.js';

export const read = async (req, res) => {
  try {
    res.json(await getGuidelines());
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Les consignes ne sont pas disponibles' });
  }
};
export const write = async (req, res) => {
  try {
    const out = await saveGuidelines(req.body?.body, Number(req.user?.userid ?? req.user?.userId) || null);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out.guidelines);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Les consignes n'ont pas pu être enregistrées" });
  }
};
