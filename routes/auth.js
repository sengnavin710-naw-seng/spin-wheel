const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const jwt = require('jsonwebtoken');


// สมัครสมาชิก
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'กรุณากรอก username และ password' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'มีผู้ใช้นี้ในระบบแล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ!' });

  } catch (error) {
    console.error('Error in /register:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่ server' });
  }
});

// 🔐 Login route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // เช็คว่ามีการกรอกข้อมูลมาครบไหม
  if (!username || !password) {
    return res.status(400).json({ message: 'กรุณากรอก username และ password' });
  }

  try {
    // หา user จาก database
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'ไม่พบผู้ใช้นี้ในระบบ' });
    }

    // เปรียบเทียบ password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    // สร้าง token
    const token = jwt.sign({ userId: user._id }, 'mysecretkey', {
      expiresIn: '1h',
    });

    // Save user to session (Crucial for socket presence binding)
    req.session.user = { id: user._id, username: user.username };

    // Realtime Updates
    const io = req.app.get('io');
    if (io) {
      io.of('/admin').emit('user:login', { username: user.username, id: user._id });
    }
    const { broadcastKpis } = require('../utils/socketHandler');
    await broadcastKpis();

    // ส่ง token กลับไป
    res.json({ message: 'เข้าสู่ระบบสำเร็จ', token });
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
