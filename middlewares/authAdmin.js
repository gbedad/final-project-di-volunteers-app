import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();
// const jwtSecret =
//   "4715aed3c946f7b0a38e6b534a9583628d84e96d10fbc04700770d572af3dce43625dd"

const jwtSecret = process.env.ACCESS_TOKEN_SECRET;
console.log('oooo', jwtSecret);

export const adminAuth = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;
  const token = authorizationHeader.split(' ')[1];
  console.log('vvvv', token);

  if (token) {
    jwt.verify(token, jwtSecret, (err, decodedToken) => {
      // console.log(decodedToken);
      if (err) {
        return res.status(401).json({ message: 'Not authorized' });
      } else {
        if (
          decodedToken.role !== 'admin' &&
          decodedToken.role !== 'interviewer'
        ) {
          return res.status(401).json({ message: 'Not authorized' });
        } else {
          next();
        }
      }
    });
  } else {
    return res
      .status(401)
      .json({ message: 'Not authorized, token not available' });
  }
};

export const userAuth = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;
  const token = authorizationHeader.split(' ')[1];
  console.log('vvvv', token);
  if (token) {
    jwt.verify(token, jwtSecret, (err, decodedToken) => {
      if (err) {
        return res.status(401).json({ message: 'Not authorized' });
      } else {
        if (decodedToken.role !== 'volunteer') {
          return res.status(401).json({ message: 'Not authorized' });
        } else {
          next();
        }
      }
    });
  } else {
    return res
      .status(401)
      .json({ message: 'Not authorized, token not available' });
  }
};
