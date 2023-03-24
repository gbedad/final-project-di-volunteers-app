export function isAdmin(req, res, next) {
    console.log(req);
    if (req.user && req.user.role === 'admin') {

      // If the user is an admin, call next() to move on to the next middleware
      next();
    } else {
      // If the user is not an admin, send an error response
      res.status(401).send('Unauthorized');
    }
  }