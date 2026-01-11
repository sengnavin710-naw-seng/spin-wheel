const mongoose = require('mongoose');

const spinLogSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true
    },
    prize: {
        type: String,
        required: true
    },
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    usedByUsername: {
        type: String, // Denormalized for easier display/search
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SpinLog', spinLogSchema);
