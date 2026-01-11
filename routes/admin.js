const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Middleware to check if user is authenticated as admin
const requireAdminSession = (req, res, next) => {
    if (req.session && req.session.admin && req.session.admin.role === 'admin') {
        return next();
    }
    return res.status(401).json({ message: 'Unauthorized: Admin access required' });
};

// POST /api/admin/auth/login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Please provide username and password' });
        }

        // Find admin user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check role
        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied: User is not an admin' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create Session
        req.session.admin = {
            id: user._id,
            username: user.username,
            role: user.role
        };

        console.log('[LoginDebug] Setting session for:', user.username);
        req.session.save((err) => {
            if (err) {
                console.error('[LoginDebug] Session Save Error:', err);
                return res.status(500).json({ message: 'Session save failed' });
            }
            console.log('[LoginDebug] Session saved successfully via MongoStore');
            res.json({ ok: true, username: user.username });
        });

    } catch (error) {
        console.error('Admin Login Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /api/admin/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Could not log out' });
        }
        res.clearCookie('admin_sid'); // We'll name the cookie admin_sid in server.js
        res.json({ ok: true });
    });
});

// GET /api/admin/auth/me
router.get('/me', requireAdminSession, (req, res) => {
    res.json({
        ok: true,
        username: req.session.admin.username,
        role: req.session.admin.role
    });
});

module.exports = router;
