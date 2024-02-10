export function isAdmin(req, res, next) {
  if (
    req.user &&
    (req.user.role === 'admin' || req.user.role === 'interviewer')
  ) {
    console.log('ROLE===>', req.user.role);
    next();
  } else {
    res.status(403).json({ error: 'Unauthorized' });
  }
}
