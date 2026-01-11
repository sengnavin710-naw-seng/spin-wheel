const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { requireAdminSession } = require('../middleware/authMiddleware');
const { broadcastKpis } = require('../utils/socketHandler');

router.use(requireAdminSession);

// GET /api/admin/users
router.get('/', async (req, res) => {
    try {
        // Exclude admins from the list if desired, or show all. Let's show all role='user'
        const users = await User.find({ role: { $ne: 'admin' } })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({ ok: true, users });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// GET /api/admin/users/:id
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ ok: true, user });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user' });
    }
});

// PUT /api/admin/users/:id (Edit User)
router.put('/:id', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        if (username) user.username = username;
        if (password && password.trim() !== "") {
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();

        await broadcastKpis(); // Check if username change affects active list display? Not currently, but good practice.
        const io = req.app.get('io');
        if (io) io.of('/admin').emit('user:update', { id: user._id, username: user.username });

        res.json({ ok: true, message: 'User updated successfully' });
    } catch (error) {
        console.error("Update User Error", error);
        res.status(500).json({ message: 'Error updating user' });
    }
});
// PUT /api/admin/users/:id/block (Toggle Block)
router.put('/:id/block', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.role === 'admin') {
            return res.status(400).json({ message: 'Cannot block admin' });
        }

        user.isBlocked = !user.isBlocked;
        await user.save();

        // Realtime: Force logout if blocked? 
        // For now just emit event
        const io = req.app.get('io');
        if (io) {
            io.of('/admin').emit('user:update', { id: user._id, isBlocked: user.isBlocked });
            // Should arguably also emit to user's socket to disconnect them
            if (user.isBlocked) {
                // Logic to disconnect specific user socket could go here if needed
            }
        }

        res.json({ ok: true, message: `User ${user.isBlocked ? 'Blocked' : 'Unblocked'}`, isBlocked: user.isBlocked });
    } catch (error) {
        console.error("Block User Error", error);
        res.status(500).json({ message: 'Error blocking user' });
    }
});

module.exports = router;
