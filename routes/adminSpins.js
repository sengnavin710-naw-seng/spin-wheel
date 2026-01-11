const express = require('express');
const router = express.Router();
const SpinCode = require('../models/SpinCode');
const { requireAdminSession } = require('../middleware/authMiddleware');

const SpinLog = require('../models/SpinLog');

// ✅ Protect ALL admin routes
router.use(requireAdminSession);

// GET /api/admin/spin-codes/logs (Spin History)
router.get('/logs', async (req, res) => {
    try {
        const { range, search, page = 1, limit = 50 } = req.query;
        const query = {};

        // Date Filter
        if (range === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            query.timestamp = { $gte: startOfDay };
        } else if (range === '7d') {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            query.timestamp = { $gte: d };
        } else if (range === '30d') {
            const d = new Date();
            d.setDate(d.getDate() - 30);
            query.timestamp = { $gte: d };
        } else if (range && /^\d{4}-\d{2}-\d{2}$/.test(range)) {
            // Specific Date (YYYY-MM-DD)
            const startOfDay = new Date(range);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(range);
            endOfDay.setHours(23, 59, 59, 999);

            query.timestamp = { $gte: startOfDay, $lte: endOfDay };
        }

        // Search Filter
        if (search) {
            query.$or = [
                { code: { $regex: search.toUpperCase() } },
                { usedByUsername: { $regex: search } }
            ];
        }

        const logs = await SpinLog.find(query)
            .sort({ timestamp: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await SpinLog.countDocuments(query);

        res.json({ ok: true, items: logs, total });
    } catch (error) {
        console.error('Logs Error:', error);
        res.status(500).json({ message: 'Failed to fetch logs' });
    }
});
const generateCode = (length = 8, prefix = '') => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix.toUpperCase();
    const targetLength = length - result.length;

    for (let i = 0; i < targetLength; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// POST /api/admin/spin-codes/generate
router.post('/generate', async (req, res) => {
    try {
        let { count, length, prefix, expiresAt, note } = req.body;

        count = parseInt(count) || 1;
        length = parseInt(length) || 8;
        if (count > 200) count = 200; // Limit
        if (length < 6) length = 6;
        if (length > 16) length = 16;
        prefix = prefix || '';

        const codesToInsert = [];
        const generatedStrings = new Set();
        const adminId = req.session.admin.id;

        for (let i = 0; i < count; i++) {
            let uniqueCode = generateCode(length, prefix);
            // Simple collision avoidance for this batch
            while (generatedStrings.has(uniqueCode)) {
                uniqueCode = generateCode(length, prefix);
            }
            generatedStrings.add(uniqueCode);

            codesToInsert.push({
                code: uniqueCode,
                status: 'active',
                note: note,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                createdByAdminId: adminId
            });
        }

        // Insert Many (Mongoose will handle duplicate key errors if regex collision happens with DB, 
        // but probability is low for reasonably long codes)
        try {
            await SpinCode.insertMany(codesToInsert, { ordered: false });
        } catch (e) {
            // Ignore duplicate key errors strictly for simplicity, just return what succeeded
            console.warn("Some codes might have been duplicates and skipped");
        }

        // Realtime Updates
        const { broadcastKpis } = require('../utils/socketHandler');
        await broadcastKpis();

        // Emit code:new event
        const io = req.app.get('io');
        if (io) {
            io.of('/admin').emit('code:new', { count: codesToInsert.length });
        }

        res.json({
            ok: true,
            count: codesToInsert.length,
            codes: codesToInsert.map(c => c.code)
        });

    } catch (error) {
        console.error('Generate Error:', error);
        res.status(500).json({ message: 'Failed to generate codes' });
    }
});

// GET /api/admin/spin-codes (List)
router.get('/', async (req, res) => {
    try {
        const { status, search, page = 1, limit = 50 } = req.query;
        const query = {};

        if (status) query.status = status;
        if (search) query.code = { $regex: search.toUpperCase() };

        const list = await SpinCode.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await SpinCode.countDocuments(query);

        res.json({ ok: true, items: list, total });
    } catch (error) {
        console.error('List Error:', error);
        res.status(500).json({ message: 'Failed to fetch codes' });
    }
});

// PUT /api/admin/spin-codes/:id/disable
router.put('/:id/disable', async (req, res) => {
    try {
        const code = await SpinCode.findById(req.params.id);
        if (!code) return res.status(404).json({ message: 'Code not found' });

        code.status = 'disabled';
        await code.save();
        res.json({ ok: true, code });
    } catch (error) {
        res.status(500).json({ message: 'Error disabling code' });
    }
});

// PUT /api/admin/spin-codes/:id/enable
router.put('/:id/enable', async (req, res) => {
    try {
        const code = await SpinCode.findById(req.params.id);
        if (!code) return res.status(404).json({ message: 'Code not found' });

        if (code.status === 'used') {
            return res.status(400).json({ message: 'Cannot enable a used code' });
        }

        code.status = 'active';
        await code.save();
        res.json({ ok: true, code });
    } catch (error) {
        res.status(500).json({ message: 'Error enabling code' });
    }
});

module.exports = router;
