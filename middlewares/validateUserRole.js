export function validateUserRole(allowedRoles) {
    return function(req, res, next) {
      const userRole = req; // assuming the user role is stored in req.user.role
    //   console.log(userRole);
      
      if (allowedRoles.includes(userRole)) {
        // user has the required role, so continue with the next middleware function
        next();
      } else {
        // user does not have the required role, so return a 403 Forbidden error
        res.status(403).send('Access Denied');
      }
    }
  }
  