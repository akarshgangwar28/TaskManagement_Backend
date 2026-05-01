const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// @route   GET api/users
// @desc    Get users list based on role
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    let query = {};

    if (userRole === 'Employee') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    } else if (userRole === 'Team Lead') {
      query = { 
        $or: [
          { _id: req.user.id },
          { teamLead: req.user.id }
        ]
      };
    } else if (userRole === 'Manager') {
      query = {};
    }

    const users = await User.find(query).select('-password');
    
    const formattedUsers = users.map(u => {
      const obj = u.toObject();
      obj.id = obj._id;
      return obj;
    });

    res.json({ success: true, users: formattedUsers });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// @route   PUT api/users/:id/assignLead
// @desc    Assign team lead to user
// @access  Private (Manager only)
router.put('/:id/assignLead', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Manager') {
      return res.status(403).json({ success: false, error: 'Only Managers can assign Team Leads' });
    }

    const { teamLeadId } = req.body; 
    
    if (teamLeadId) {
      const leadUser = await User.findById(teamLeadId);
      if (!leadUser) {
        return res.status(404).json({ success: false, error: 'Team lead user not found' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { teamLead: teamLeadId || null } },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const obj = user.toObject();
    obj.id = obj._id;

    res.json({ success: true, user: obj });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

module.exports = router;
