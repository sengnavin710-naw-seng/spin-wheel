const mongoose = require('mongoose');

const spinCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
        uppercase: true
    },
    status: {
        type: String,
        enum: ['active', 'used', 'disabled', 'expired'],
        default: 'active',
        index: true
    },
    note: String,
    expiresAt: Date,

    // Usage Info
    usedAt: Date,
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    usedByUsername: String,
    prize: String, // ✅ Track what prize was won

    // Creation Info
    createdByAdminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('SpinCode', spinCodeSchema);
