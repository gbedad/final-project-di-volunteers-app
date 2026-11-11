// Page "Contrôles" of the team
import { controlList } from '../services/controls.js';

export const getControls = async (req, res) => {
  try {
    res.json(await controlList());
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Les contrôles n’ont pas pu être calculés' });
  }
};
