import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

export const refreshTokenFunc = (req, res) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) return res.sendStatus(401);

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    const accessToken = generateAccessToken({ username: user.username });
    return res.json({ accessToken });
  });
};
