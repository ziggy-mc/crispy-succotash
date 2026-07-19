const mongoose = require('mongoose');

const supporterSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
});

module.exports = mongoose.model('Supporter', supporterSchema);
