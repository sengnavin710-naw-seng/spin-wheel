const express = require('express');
const router = express.Router();
const SpinCode = require('../models/SpinCode');
const User = require('../models/User');
const { requireAdminSession } = require('../middleware/authMiddleware');

router.use(requireAdminSession);

// GET /api/admin/stats
router.get('/', async (req, res) => {
    try {
        const totalCodes = await SpinCode.countDocuments({});
        const activeCodes = await SpinCode.countDocuments({ status: 'active' });
        const usedCodes = await SpinCode.countDocuments({ status: 'used' });

        // ✅ FIXED: Count ALL users where role is NOT 'admin'
        const totalUsers = await User.countDocuments({
            $or: [
                { role: { $ne: 'admin' } },
                { role: { $exists: false } },
                { role: null }
            ]
        });

        // Recent usage (Last 10 used codes)
        const recentActivity = await SpinCode.find({ status: 'used' })
            .sort({ usedAt: -1 })
            .limit(10)
            .select('code usedByUsername prize usedAt');

        res.json({
            ok: true,
            stats: {
                totalCodes,
                activeCodes,
                usedCodes,
                totalUsers
            },
            recentActivity
        });
    } catch (error) {
        console.error('Stats Error:', error);
        res.status(500).json({ message: 'Error fetching stats' });
    }
});

module.exports = router;
