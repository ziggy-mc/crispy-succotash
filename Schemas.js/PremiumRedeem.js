const { Schema, model } = require("mongoose");

const premiumRedeemSchema = new Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },

  premiumUntil: {
    type: Date,
    required: true
  },

  lastPurchaseAt: {
    type: Date,
    required: true
  }
});

module.exports = model("PremiumRedeem", premiumRedeemSchema);
