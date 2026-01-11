const mongoose = require('mongoose');

const prizeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    color: {
        type: String,
        required: true,
        default: '#E11D48'
    },
    probability: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 10
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// ✅ Index for faster queries
prizeSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('Prize', prizeSchema);
