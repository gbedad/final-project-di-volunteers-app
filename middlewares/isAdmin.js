export function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    console.log(req.user.role)
    next();
  } else {
    res.sendStatus(403);
  }
}