const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const SOSAlert = require('../models/SOSAlert');
const EmergencyContact = require('../models/EmergencyContact');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send SOS emails to emergency contacts
const sendSOSEmails = async (user, contacts, location, alertId) => {
  const locationText = location.address || `Lat: ${location.lat}, Lng: ${location.lng}`;
  const mapsLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;

  const emailPromises = contacts
    .filter((c) => c.email && c.notifyOnSOS)
    .map((contact) => {
      const mailOptions = {
        from: `SafeRoute Alert <${process.env.EMAIL_USER}>`,
        to: contact.email,
        subject: `🚨 EMERGENCY SOS ALERT from ${user.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🚨 SOS EMERGENCY ALERT</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #eee; border-radius: 0 0 10px 10px;">
              <p style="font-size: 18px; color: #333;"><strong>${user.name}</strong> has triggered an emergency SOS alert!</p>
              <div style="background: #fff3f3; border-left: 4px solid #e91e8c; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #333;"><strong>📍 Last Known Location:</strong><br>${locationText}</p>
              </div>
              <a href="${mapsLink}" style="display: inline-block; background: #e91e8c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px 0;">
                📍 View on Google Maps
              </a>
              <p style="color: #666; font-size: 14px;">Phone: ${user.phone || 'Not provided'}</p>
              <p style="color: #999; font-size: 12px; margin-top: 20px;">This is an automated alert from SafeRoute safety app. Alert ID: ${alertId}</p>
            </div>
          </div>
        `,
      };
      return transporter.sendMail(mailOptions).catch((err) => console.error(`Email failed for ${contact.email}:`, err));
    });

  await Promise.allSettled(emailPromises);
};

// @route   POST /api/sos/trigger
// @desc    Trigger SOS alert
// @access  Protected
router.post('/trigger', protect, async (req, res) => {
  const { lat, lng, address, message } = req.body;

  try {
    const user = await User.findById(req.user._id);
    const contacts = await EmergencyContact.find({ userId: req.user._id, notifyOnSOS: true });

    const location = { lat, lng, address: address || '' };
    const alertMessage = message || `EMERGENCY! ${user.name} needs help immediately!`;

    const alert = await SOSAlert.create({
      userId: req.user._id,
      location,
      message: alertMessage,
      contactsNotified: contacts.map((c) => ({
        name: c.name,
        email: c.email,
        phone: c.phone,
      })),
    });

    // Send emails in background
    sendSOSEmails(user, contacts, location, alert._id).catch(console.error);

    res.status(201).json({
      success: true,
      message: `SOS alert triggered. ${contacts.length} contact(s) notified.`,
      alertId: alert._id,
      contactsNotified: contacts.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to trigger SOS alert' });
  }
});

// @route   GET /api/sos/history
// @desc    Get user's SOS history
// @access  Protected
router.get('/history', protect, async (req, res) => {
  try {
    const alerts = await SOSAlert.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, count: alerts.length, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/sos/:id/resolve
// @desc    Resolve an active SOS alert
// @access  Protected
router.put('/:id/resolve', protect, async (req, res) => {
  try {
    const alert = await SOSAlert.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status: 'resolved', respondedAt: new Date() },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    res.json({ success: true, message: 'SOS alert resolved', alert });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
