const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const jwt = require('jsonwebtoken');


// สมัครสมาชิก
// ✅ Login route (Passwordless / Guest Mode)
router.post('/login', async (req, res) => {
  try {
    let { username } = req.body;

    if (!username) {
      return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้งาน' });
    }

    // Normalize username (trim + case insensitive for storage/lookup)
    const normalizedUsername = username.trim();

    // 1. Find user (Case Insensitive)
    let user = await User.findOne({
      username: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') }
    });

    // 2. If not found, Auto-Register (Guest)
    if (!user) {
      console.log(`[Auth] Creating new guest user: ${normalizedUsername}`);
      user = new User({
        username: normalizedUsername,
        role: 'user', // Default role
        // No password needed
      });
      await user.save();

      // Realtime: Notify Admin of new user
      const io = req.app.get('io');
      if (io) io.of('/admin').emit('user:new', user);
    }

    // 3. User Exists: Check if Blocked
    if (user.isBlocked) {
      return res.status(403).json({ message: 'บัญชีของคุณถูกระงับการใช้งาน' });
    }

    // 4. Create Token (Standard JWT)
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'mysecretkey', {
      expiresIn: '24h',
    });

    // 5. Save Session (for Socket.IO presence)
    req.session.user = { id: user._id, username: user.username };

    // Realtime: Notify Admin of Login
    const io = req.app.get('io');
    if (io) {
      io.of('/admin').emit('user:login', { username: user.username, id: user._id });
    }
    const { broadcastKpis } = require('../utils/socketHandler');
    await broadcastKpis();

    // Success response
    res.json({ message: 'เข้าสู่ระบบสำเร็จ', token, username: user.username });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่ server' });
  }
});

// Logout Route
router.post('/logout', async (req, res) => {
  if (req.session) {
    const user = req.session.user;
    req.session.destroy(async (err) => {
      if (err) return res.status(500).json({ message: 'Logout failed' });

      // Emit logout if user existed
      if (user) {
        const io = req.app.get('io');
        if (io) io.of('/admin').emit('user:logout', user);

        const { broadcastKpis } = require('../utils/socketHandler');
        await broadcastKpis();
      }
      res.json({ message: 'Logged out' });
    });
  } else {
    res.json({ message: 'Logged out' });
  }
});

module.exports = router;
