const express = require('express');
const router = express.Router();
const SpinCode = require('../models/SpinCode');
const SpinLog = require('../models/SpinLog');
const User = require('../models/User');
const Prize = require('../models/Prize');
const { broadcastKpis } = require('../utils/socketHandler');

// ✅ Weighted Random Selection based on probability
function selectWeightedPrize(prizes) {
    const totalWeight = prizes.reduce((sum, p) => sum + p.probability, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < prizes.length; i++) {
        random -= prizes[i].probability;
        if (random <= 0) {
            return { prize: prizes[i], index: i };
        }
    }
    // Fallback to last prize
    return { prize: prizes[prizes.length - 1], index: prizes.length - 1 };
}

// POST /api/game/spin
router.post('/spin', async (req, res) => {
    try {
        const { code, username } = req.body;

        if (!code) return res.status(400).json({ message: 'Code is required' });
        if (!username) return res.status(400).json({ message: 'User is required' });

        const normalizedCode = code.toUpperCase().trim();

        // Find the user first (Case Insensitive)
        const normalizedUsername = username.trim();
        const user = await User.findOne({
            username: { $regex: new RegExp(`^${normalizedUsername}$`, 'i') }
        });

        if (!user) {
            console.log(`[Spin] User not found: '${username}'`);
            return res.status(404).json({ message: 'User not found' });
        }

        // ✅ Load active prizes from database
        let prizes = await Prize.find({ isActive: true }).sort({ order: 1 });

        // Fallback to default prizes if none exist
        if (prizes.length === 0) {
            prizes = [
                { name: "100 THB", color: "#E11D48", probability: 25 },
                { name: "No Luck", color: "#607D8B", probability: 30 },
                { name: "500 THB", color: "#D4AF37", probability: 15 },
                { name: "Spin Again", color: "#10B981", probability: 15 },
                { name: "1000 THB", color: "#E11D48", probability: 10 },
                { name: "Jackpot", color: "#D4AF37", probability: 5 }
            ];
        }

        // ✅ Use weighted random selection
        const { prize: wonPrize, index: winningIndex } = selectWeightedPrize(prizes);
        const prizeName = wonPrize.name || wonPrize.text;

        // ✅ ATOMIC UPDATE: Find active code and mark as used in ONE operation
        const spinCode = await SpinCode.findOneAndUpdate(
            {
                code: normalizedCode,
                status: 'active',
                $or: [
                    { expiresAt: null },
                    { expiresAt: { $gt: new Date() } }
                ]
            },
            {
                $set: {
                    status: 'used',
                    usedBy: user._id,
                    usedByUsername: user.username,
                    usedAt: new Date(),
                    prize: prizeName
                }
            },
            {
                new: false
            }
        );

        // Check if code was found and updated
        if (!spinCode) {
            const existingCode = await SpinCode.findOne({ code: normalizedCode });
            if (!existingCode) {
                return res.status(404).json({ message: 'Invalid Code' });
            }
            if (existingCode.status === 'used') {
                return res.status(400).json({ message: 'Code already used' });
            }
            if (existingCode.status === 'disabled') {
                return res.status(400).json({ message: 'Code is disabled' });
            }
            if (existingCode.expiresAt && new Date() > existingCode.expiresAt) {
                return res.status(400).json({ message: 'Code has expired' });
            }
            return res.status(400).json({ message: `Code is ${existingCode.status}` });
        }

        // Create Spin Log
        const newLog = await SpinLog.create({
            code: normalizedCode,
            prize: prizeName,
            usedBy: user._id,
            usedByUsername: user.username
        });

        // Realtime Updates
        const io = req.app.get('io');
        if (io) {
            io.of('/admin').emit('spin:new', newLog);
        }
        await broadcastKpis();

        res.json({
            ok: true,
            winningIndex: winningIndex,
            prize: {
                id: wonPrize._id || winningIndex + 1,
                text: prizeName,
                color: wonPrize.color
            },
            message: `Congratulations! You won ${prizeName}`
        });

    } catch (error) {
        console.error('Spin Error:', error);
        res.status(500).json({ message: 'System Error' });
    }
});

// ✅ GET /api/game/history/:username - Get user's spin history from database
router.get('/history/:username', async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return res.status(400).json({ message: 'Username is required' });
        }

        const history = await SpinLog.find({ usedByUsername: username })
            .sort({ timestamp: -1 })
            .limit(100) // Last 100 spins
            .select('code prize timestamp')
            .lean();

        res.json({
            ok: true,
            history,
            count: history.length
        });

    } catch (error) {
        console.error('Get History Error:', error);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

module.exports = router;
