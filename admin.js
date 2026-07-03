const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Incident = require('../models/Incident');
const SOSAlert = require('../models/SOSAlert');
const { protect, adminOnly } = require('../middleware/auth');

// @route   GET /api/admin/stats
// @desc    Get admin dashboard statistics
// @access  Admin
router.get('/stats', protect, adminOnly, async (req, res) => {
  try {
    const [totalUsers, totalIncidents, activeAlerts, verifiedIncidents, pendingIncidents] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Incident.countDocuments(),
      SOSAlert.countDocuments({ status: 'active' }),
      Incident.countDocuments({ status: 'verified' }),
      Incident.countDocuments({ status: 'pending' }),
    ]);

    // Incidents by type
    const incidentsByType = await Incident.aggregate([
      { $group: { _id: '$incidentType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Incidents by severity
    const incidentsBySeverity = await Incident.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]);

    // Last 7 days incident trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dailyTrend = await Incident.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalIncidents,
        activeAlerts,
        verifiedIncidents,
        pendingIncidents,
        incidentsByType,
        incidentsBySeverity,
        dailyTrend,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/admin/heatmap
// @desc    Get heatmap data (incident locations with weights)
// @access  Admin / Public (for map)
router.get('/heatmap', async (req, res) => {
  try {
    const incidents = await Incident.find({ status: { $ne: 'rejected' } }).select(
      'location severity incidentType'
    );

    const heatmapData = incidents.map((incident) => ({
      lat: incident.location.lat,
      lng: incident.location.lng,
      weight: incident.severity === 'high' ? 3 : incident.severity === 'medium' ? 2 : 1,
    }));

    res.json({ success: true, count: heatmapData.length, heatmapData });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/admin/incidents
// @desc    Get all incidents with full details (Admin)
// @access  Admin
router.get('/incidents', protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};

    const incidents = await Incident.find(filter)
      .populate('reportedBy', 'name email')
      .populate('verifiedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Incident.countDocuments(filter);

    res.json({ success: true, total, page: parseInt(page), incidents });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/admin/sos-alerts
// @desc    Get all SOS alerts (Admin)
// @access  Admin
router.get('/sos-alerts', protect, adminOnly, async (req, res) => {
  try {
    const alerts = await SOSAlert.find()
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
