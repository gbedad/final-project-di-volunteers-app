// Page "À traiter" of the team
import { todoList } from '../services/todo.js';

export const getTodo = async (req, res) => {
  try {
    res.json(await todoList());
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'La liste « À traiter » n’a pas pu être chargée' });
  }
};
