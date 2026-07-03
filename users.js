const express = require('express');
const router = express.Router();
const User = require('../models/User');
const EmergencyContact = require('../models/EmergencyContact');
const { protect, adminOnly } = require('../middleware/auth');

// @route   GET /api/users/profile
// @desc    Get user profile
// @access  Protected
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const contacts = await EmergencyContact.find({ userId: req.user._id });
    res.json({ success: true, user, emergencyContacts: contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Protected
router.put('/profile', protect, async (req, res) => {
  const { name, phone, profilePhoto } = req.body;
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, profilePhoto },
      { new: true, runValidators: true }
    );
    res.json({ success: true, message: 'Profile updated', user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/location
// @desc    Update user's last known location
// @access  Protected
router.put('/location', protect, async (req, res) => {
  const { lat, lng, address } = req.body;
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { lastLocation: { lat, lng, address, updatedAt: new Date() } },
      { new: true }
    );
    res.json({ success: true, message: 'Location updated', location: user.lastLocation });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users (Admin only)
// @desc    Get all users
// @access  Admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/:id/status (Admin only)
// @desc    Activate/Deactivate a user
// @access  Admin
router.put('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: req.body.isActive },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}`, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
