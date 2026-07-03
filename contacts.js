const express = require('express');
const router = express.Router();
const EmergencyContact = require('../models/EmergencyContact');
const { protect } = require('../middleware/auth');

// @route   GET /api/contacts
// @desc    Get all emergency contacts for current user
// @access  Protected
router.get('/', protect, async (req, res) => {
  try {
    const contacts = await EmergencyContact.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: contacts.length, contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/contacts
// @desc    Add an emergency contact
// @access  Protected
router.post('/', protect, async (req, res) => {
  const { name, phone, email, relationship, notifyOnSOS } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'Name and phone are required' });
  }
  try {
    const count = await EmergencyContact.countDocuments({ userId: req.user._id });
    if (count >= 5) {
      return res.status(400).json({ success: false, message: 'Maximum 5 emergency contacts allowed' });
    }
    const contact = await EmergencyContact.create({
      userId: req.user._id,
      name,
      phone,
      email,
      relationship,
      notifyOnSOS: notifyOnSOS !== undefined ? notifyOnSOS : true,
    });
    res.status(201).json({ success: true, message: 'Contact added', contact });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/contacts/:id
// @desc    Update an emergency contact
// @access  Protected
router.put('/:id', protect, async (req, res) => {
  try {
    const contact = await EmergencyContact.findOne({ _id: req.params.id, userId: req.user._id });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    Object.assign(contact, req.body);
    await contact.save();
    res.json({ success: true, message: 'Contact updated', contact });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/contacts/:id
// @desc    Delete an emergency contact
// @access  Protected
router.delete('/:id', protect, async (req, res) => {
  try {
    const contact = await EmergencyContact.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, message: 'Contact removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
