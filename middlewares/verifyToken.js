import jwt from 'jsonwebtoken';

export const verifyToken = (req, res, next) => {
    const token = req.cookies.accesstoken || req.headers['x-access-token'];

    if (!token) return res.status(401).json({msg: 'not authorized'})

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if(!err) return res.status(403).json({msg: 'not authorized'})
            // const id = decoded.userid;
            // req.userid = id
        next();
    })
}