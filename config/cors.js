import dotenv from 'dotenv';

dotenv.config();

// Comma-separated list in CORS_ORIGINS overrides the defaults
const defaultOrigins = [
  'https://www.mycogniverse.org',
  'https://mycogniverse.org',
  'http://localhost:3000',
];

const origins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : defaultOrigins;

const corsOptions = {
  origin: origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token'],
};

export default corsOptions;
