import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config()

export const verifyToken = (req, res, next) => {
    const token = req.cookies.accesstoken || req.headers['x-access-token'];

    if (!token) return res.status(401).json({msg: 'not authorized'})

    console.log('Token:', token);
    console.log('Secret Key:', process.env.ACCESS_TOKEN_SECRET);

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if(!err) return res.status(403).json({msg: 'not authorized'})
        // if (err) {
        //     console.log('JWT verification failed:', err);
        //     return res.status(403).json({msg: 'not authorized'});
        // }

        console.log('JWT verification successful:', decoded);

        req.decoded = decoded;

            // const id = decoded.userid;
            // req.userid = id
            // console.log(id);
        next();
    })
}