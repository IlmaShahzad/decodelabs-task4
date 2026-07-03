const mongoose = require('mongoose');

const sosAlertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
    },
    contactsNotified: [
      {
        name: String,
        email: String,
        phone: String,
        notifiedAt: { type: Date, default: Date.now },
      },
    ],
    message: {
      type: String,
      default: 'EMERGENCY SOS ALERT: I need help immediately!',
    },
    status: {
      type: String,
      enum: ['active', 'resolved'],
      default: 'active',
    },
    respondedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SOSAlert', sosAlertSchema);
