require('dotenv').config();

const express = require('express');
const http = require('http'); // Import HTTP
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo').default || require('connect-mongo');
const path = require('path');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const { initSocket } = require('./utils/socketHandler'); // Import Socket Handler

// Import Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminSpinRoutes = require('./routes/adminSpins');
const adminStatsRoutes = require('./routes/adminStats');
const gameRoutes = require('./routes/game');

// Connect Database
connectDB().then(async () => {
  console.log("Checking Admin Seed...");
  const adminUser = process.env.ADMIN_SEED_USERNAME;
  const adminPass = process.env.ADMIN_SEED_PASSWORD;

  if (adminUser && adminPass) {
    const found = await User.findOne({ username: adminUser });
    if (!found) {
      const hashedPassword = await bcrypt.hash(adminPass, 10);
      await User.create({
        username: adminUser,
        password: hashedPassword,
        role: 'admin'
      });
      console.log(`✅ Admin user '${adminUser}' seeded.`);
    } else {
      console.log(`ℹ️ Admin user '${adminUser}' already exists.`);
    }
  }
});

const app = express();
const server = http.createServer(app); // Create HTTP Server

// 1. CORS Middleware (Must be first)
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:3000', 'http://localhost:3000'],
  credentials: true
}));

// 2. Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Cookie Parser
app.use(cookieParser());

// 4. Session Middleware (Define separately to share with Socket.IO)
const sessionMiddleware = session({
  name: 'admin_sid',
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    httpOnly: true,
    secure: false, // Force false for HTTP/Localhost
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
});

app.use(sessionMiddleware);

// 5. Initialize Socket.IO
const io = initSocket(server, sessionMiddleware);
app.set('io', io); // Make io available in routes via req.app.get('io')

// 6. Static Files (Updated for Deployment)
app.use(express.static(path.join(__dirname, 'public')));

// 7. Health Check Endpoint (for Render and monitoring)
app.get('/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message
    });
  }
});

// 8. Routes
app.get('/', (req, res) => {
  // Redirect to spin page or auth page
  res.redirect('/auth.html');
});

app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminRoutes);
app.use('/api/admin/users', require('./routes/users'));
app.use('/api/admin/spin-codes', adminSpinRoutes);
app.use('/api/admin/stats', adminStatsRoutes);
app.use('/api/admin/prizes', require('./routes/adminPrizes')); // ✅ NEW: Prize Management
app.use('/api/game', gameRoutes);

// ✅ Public API: Get active prizes for spin wheel (no auth required)
app.get('/api/prizes', async (req, res) => {
  try {
    const Prize = require('./models/Prize');
    const prizes = await Prize.find({ isActive: true }).sort({ order: 1 });
    res.json({ ok: true, prizes });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching prizes' });
  }
});

// Start Server (Use server.listen instead of app.listen)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
