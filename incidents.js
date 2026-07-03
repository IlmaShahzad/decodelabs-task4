const express = require('express');
const router = express.Router();
const Incident = require('../models/Incident');
const { protect, adminOnly } = require('../middleware/auth');

// @route   POST /api/incidents/report
// @desc    Report a new incident
// @access  Protected
router.post('/report', protect, async (req, res) => {
  const { incidentType, description, location, severity, isAnonymous, photos } = req.body;

  if (!incidentType || !description || !location) {
    return res.status(400).json({ success: false, message: 'Incident type, description, and location are required' });
  }

  try {
    const incident = await Incident.create({
      reportedBy: isAnonymous ? null : req.user._id,
      incidentType,
      description,
      location,
      severity: severity || 'medium',
      isAnonymous: isAnonymous || false,
      photos: photos || [],
    });

    res.status(201).json({ success: true, message: 'Incident reported successfully', incident });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/incidents/all
// @desc    Get all incidents (with optional filters)
// @access  Public
router.get('/all', async (req, res) => {
  try {
    const { status, severity, type, limit = 50, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (type) filter.incidentType = type;

    const incidents = await Incident.find(filter)
      .populate('reportedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Incident.countDocuments(filter);

    res.json({ success: true, total, page: parseInt(page), incidents });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/incidents/nearby
// @desc    Get nearby incidents based on lat/lng/radius
// @access  Public
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 5 } = req.query; // radius in km
  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
  }

  try {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const radiusNum = parseFloat(radius);

    // Simple bounding box approximation
    const latDelta = radiusNum / 111;
    const lngDelta = radiusNum / (111 * Math.cos((latNum * Math.PI) / 180));

    const incidents = await Incident.find({
      'location.lat': { $gte: latNum - latDelta, $lte: latNum + latDelta },
      'location.lng': { $gte: lngNum - lngDelta, $lte: lngNum + lngDelta },
      status: { $ne: 'rejected' },
    })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, count: incidents.length, incidents });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/incidents/my
// @desc    Get current user's reports
// @access  Protected
router.get('/my', protect, async (req, res) => {
  try {
    const incidents = await Incident.find({ reportedBy: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: incidents.length, incidents });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/incidents/:id/verify
// @desc    Verify or reject an incident (Admin)
// @access  Admin
router.put('/:id/verify', protect, adminOnly, async (req, res) => {
  const { status } = req.body; // 'verified' or 'rejected'
  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be verified or rejected' });
  }

  try {
    const incident = await Incident.findByIdAndUpdate(
      req.params.id,
      { status, verifiedBy: req.user._id },
      { new: true }
    );
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    res.json({ success: true, message: `Incident ${status}`, incident });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/incidents/:id/vote
// @desc    Vote on an incident (upvote/downvote)
// @access  Protected
router.put('/:id/vote', protect, async (req, res) => {
  const { vote } = req.body; // 'up' or 'down'
  if (!['up', 'down'].includes(vote)) {
    return res.status(400).json({ success: false, message: 'Vote must be up or down' });
  }

  try {
    const incident = await Incident.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });

    if (incident.communityVotes.voters.includes(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You have already voted' });
    }

    if (vote === 'up') incident.communityVotes.upvotes += 1;
    else incident.communityVotes.downvotes += 1;
    incident.communityVotes.voters.push(req.user._id);

    await incident.save();
    res.json({ success: true, message: 'Vote recorded', votes: incident.communityVotes });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
