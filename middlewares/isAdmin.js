export function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    console.log('ROLE===>', req.user.role);
    next();
  } else {
    res.status(403).json({ error: 'Unauthorized' });
  }
}
