import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createStorage } from './storage.js';

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const storage = createStorage();

app.use(cors());
app.use(express.json());

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const signToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, sessionVersion: user.sessionVersion || 0 }, JWT_SECRET);

const authMiddleware = asyncRoute(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  let decoded;
  try {
    const token = authHeader.split(' ')[1];
    decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  const user = await storage.findUserById(decoded.id);
  if (!user || (decoded.sessionVersion || 0) !== (user.sessionVersion || 0)) {
    return res.status(401).json({ message: 'Session revoked. Please log in again.' });
  }
  req.user = decoded;
  next();
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Bookmark Manager API is running.',
    endpoints: ['/api/health', '/api/auth/register', '/api/auth/login', '/api/bookmarks'],
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Bookmark manager API is running' });
});

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: cryptoId(),
    name,
    email: email.toLowerCase(),
    password: hashedPassword,
    sessionVersion: 0,
    createdAt: new Date().toISOString(),
  };

  try {
    await storage.createUser(newUser);
  } catch (error) {
    if (error.code === 'USER_EXISTS') {
      return res.status(409).json({ message: 'User already exists' });
    }
    throw error;
  }

  const token = signToken(newUser);
  return res.status(201).json({
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    },
  });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await storage.findUserByEmail(email);

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
}));

app.post('/api/auth/logout', authMiddleware, asyncRoute(async (req, res) => {
  const user = await storage.incrementSessionVersion(req.user.id);
  if (!user) return res.status(401).json({ message: 'Session revoked. Please log in again.' });

  return res.json({ message: 'Logged out from all devices' });
}));

app.get('/api/bookmarks', authMiddleware, asyncRoute(async (req, res) => {
  res.json(await storage.listBookmarks(req.user.id));
}));

app.post('/api/bookmarks', authMiddleware, asyncRoute(async (req, res) => {
  const { title, url, favorite, tags, folderId, folderLabel, type, source, notes, reminderDate, clientId } = req.body || {};

  if (!title || !url) {
    return res.status(400).json({ message: 'Title and URL are required' });
  }

  const newBookmark = {
    id: cryptoId(),
    userId: req.user.id,
    clientId,
    title,
    url,
    favorite: !!favorite,
    tags: Array.isArray(tags) ? tags : [],
    folderId: folderId || 'work',
    folderLabel: folderLabel || 'Work',
    type: type || 'bookmark',
    source: source || url,
    notes: typeof notes === 'string' ? notes : '',
    reminderDate: reminderDate || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const result = await storage.createBookmark(newBookmark);
  res.status(result.created ? 201 : 200).json(result.bookmark);
}));

app.put('/api/bookmarks/:id', authMiddleware, asyncRoute(async (req, res) => {
  const allowedFields = ['title', 'url', 'favorite', 'tags', 'folderId', 'folderLabel', 'type', 'source', 'notes', 'reminderDate'];
  const updates = Object.fromEntries(
    allowedFields.filter((field) => Object.hasOwn(req.body || {}, field)).map((field) => [field, req.body[field]]),
  );
  const result = await storage.updateBookmark(
    req.params.id,
    req.user.id,
    updates,
    req.body?.expectedUpdatedAt,
  );

  if (result.kind === 'not_found') {
    return res.status(404).json({ message: 'Bookmark not found' });
  }
  if (result.kind === 'conflict') {
    return res.status(409).json({
      message: 'Bookmark changed on another device.',
      serverBookmark: result.bookmark,
    });
  }

  res.json(result.bookmark);
}));

app.delete('/api/bookmarks/:id', authMiddleware, asyncRoute(async (req, res) => {
  const deleted = await storage.deleteBookmark(req.params.id, req.user.id);
  if (!deleted) return res.status(404).json({ message: 'Bookmark not found' });
  res.json({ message: 'Bookmark deleted' });
}));

const cryptoId = () => {
  if (globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ message: 'The server could not complete the request.' });
});

await storage.init();
app.listen(PORT, () => {
  console.log(`Bookmark Manager API running on port ${PORT} using ${process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON file'} storage.`);
});
