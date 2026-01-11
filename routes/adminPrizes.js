const express = require('express');
const router = express.Router();
const Prize = require('../models/Prize');
const { requireAdminSession } = require('../middleware/authMiddleware');

// ✅ Protect ALL routes
router.use(requireAdminSession);

// GET /api/admin/prizes - Get all prizes
router.get('/', async (req, res) => {
    try {
        const prizes = await Prize.find().sort({ order: 1 });
        res.json({ ok: true, prizes });
    } catch (error) {
        console.error('Get Prizes Error:', error);
        res.status(500).json({ message: 'Error fetching prizes' });
    }
});

// GET /api/admin/prizes/active - Get only active prizes (for wheel)
router.get('/active', async (req, res) => {
    try {
        const prizes = await Prize.find({ isActive: true }).sort({ order: 1 });
        res.json({ ok: true, prizes });
    } catch (error) {
        console.error('Get Active Prizes Error:', error);
        res.status(500).json({ message: 'Error fetching prizes' });
    }
});

// POST /api/admin/prizes - Add new prize
router.post('/', async (req, res) => {
    try {
        const { name, color, probability, isActive, order } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Prize name is required' });
        }

        // Get max order if not provided
        let prizeOrder = order;
        if (prizeOrder === undefined) {
            const maxOrder = await Prize.findOne().sort({ order: -1 });
            prizeOrder = maxOrder ? maxOrder.order + 1 : 0;
        }

        const newPrize = await Prize.create({
            name,
            color: color || '#E11D48',
            probability: probability || 10,
            isActive: isActive !== false,
            order: prizeOrder
        });

        // Emit realtime update
        const io = req.app.get('io');
        if (io) io.of('/admin').emit('prize:new', newPrize);

        res.status(201).json({ ok: true, prize: newPrize });
    } catch (error) {
        console.error('Add Prize Error:', error);
        res.status(500).json({ message: 'Error adding prize' });
    }
});

// PUT /api/admin/prizes/:id - Update prize
router.put('/:id', async (req, res) => {
    try {
        const { name, color, probability, isActive, order } = req.body;

        const prize = await Prize.findByIdAndUpdate(
            req.params.id,
            { name, color, probability, isActive, order },
            { new: true }
        );

        if (!prize) {
            return res.status(404).json({ message: 'Prize not found' });
        }

        // Emit realtime update
        const io = req.app.get('io');
        if (io) io.of('/admin').emit('prize:update', prize);

        res.json({ ok: true, prize });
    } catch (error) {
        console.error('Update Prize Error:', error);
        res.status(500).json({ message: 'Error updating prize' });
    }
});

// PUT /api/admin/prizes/probabilities/batch - Update all probabilities at once
router.put('/probabilities/batch', async (req, res) => {
    try {
        const { probabilities } = req.body; // [{ id, probability }, ...]

        if (!probabilities || !Array.isArray(probabilities)) {
            return res.status(400).json({ message: 'Invalid probabilities data' });
        }

        // Validate total = 100%
        const total = probabilities.reduce((sum, p) => sum + (p.probability || 0), 0);
        if (Math.abs(total - 100) > 0.1) {
            return res.status(400).json({
                message: `Total probability must be 100%. Current: ${total.toFixed(1)}%`
            });
        }

        // Update all probabilities
        for (const p of probabilities) {
            await Prize.findByIdAndUpdate(p.id, { probability: p.probability });
        }

        // Emit realtime update
        const io = req.app.get('io');
        if (io) io.of('/admin').emit('prize:probabilities-updated');

        res.json({ ok: true, message: 'Probabilities updated' });
    } catch (error) {
        console.error('Update Probabilities Error:', error);
        res.status(500).json({ message: 'Error updating probabilities' });
    }
});

// DELETE /api/admin/prizes/:id - Delete prize
router.delete('/:id', async (req, res) => {
    try {
        const prize = await Prize.findByIdAndDelete(req.params.id);

        if (!prize) {
            return res.status(404).json({ message: 'Prize not found' });
        }

        // Emit realtime update
        const io = req.app.get('io');
        if (io) io.of('/admin').emit('prize:delete', req.params.id);

        res.json({ ok: true, message: 'Prize deleted' });
    } catch (error) {
        console.error('Delete Prize Error:', error);
        res.status(500).json({ message: 'Error deleting prize' });
    }
});

// POST /api/admin/prizes/seed - Seed default prizes (one-time setup)
router.post('/seed', async (req, res) => {
    try {
        const existingCount = await Prize.countDocuments();
        if (existingCount > 0) {
            return res.status(400).json({ message: 'Prizes already exist' });
        }

        const defaultPrizes = [
            { name: "100 THB", color: "#E11D48", probability: 25, order: 0 },
            { name: "No Luck", color: "#607D8B", probability: 30, order: 1 },
            { name: "500 THB", color: "#D4AF37", probability: 15, order: 2 },
            { name: "Spin Again", color: "#10B981", probability: 15, order: 3 },
            { name: "1000 THB", color: "#E11D48", probability: 10, order: 4 },
            { name: "Jackpot", color: "#D4AF37", probability: 5, order: 5 }
        ];

        await Prize.insertMany(defaultPrizes);

        res.json({ ok: true, message: 'Default prizes seeded', count: defaultPrizes.length });
    } catch (error) {
        console.error('Seed Prizes Error:', error);
        res.status(500).json({ message: 'Error seeding prizes' });
    }
});

module.exports = router;
