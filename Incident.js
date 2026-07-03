const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    incidentType: {
      type: String,
      enum: ['harassment', 'theft', 'assault', 'suspicious_activity', 'poor_lighting', 'unsafe_area', 'other'],
      required: [true, 'Incident type is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String },
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    communityVotes: {
      upvotes: { type: Number, default: 0 },
      downvotes: { type: Number, default: 0 },
      voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    photos: [{ type: String }],
    isAnonymous: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for geo-based queries
incidentSchema.index({ 'location.lat': 1, 'location.lng': 1 });

module.exports = mongoose.model('Incident', incidentSchema);
