const { model, Schema } = require('mongoose');

let reminder = new Schema({
    User: String,
    RemTime: Number,
    Urgent: Boolean,
    Reminder: String,
})

module.exports = model('reminder198723498234', reminder);