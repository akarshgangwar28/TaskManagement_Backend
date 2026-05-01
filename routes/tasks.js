const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Task = require('../models/Task');
const User = require('../models/User');

// @route   GET api/tasks
// @desc    Get tasks based on user role
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const userRole = req.user.role;
    const userId = req.user.id;

    let tasks;

    switch (userRole) {
      case 'Employee':
        tasks = await Task.find({
          $or: [{ createdBy: userId }, { assignedTo: userId }]
        }).sort({ createdAt: -1 });
        break;
      case 'Team Lead':
        const teamMembers = await User.find({ teamLead: userId }).select('_id');
        const teamMemberIds = teamMembers.map(m => m._id);
        tasks = await Task.find({
          $or: [
            { createdBy: userId },
            { assignedTo: userId },
            { createdBy: { $in: teamMemberIds } },
            { assignedTo: { $in: teamMemberIds } }
          ]
        }).sort({ createdAt: -1 });
        break;
      case 'Manager':
        tasks = await Task.find({}).sort({ createdAt: -1 });
        break;
      default:
        tasks = await Task.find({ createdBy: userId }).sort({ createdAt: -1 });
    }

    const formattedTasks = tasks.map(t => {
      const obj = t.toObject();
      obj.id = obj._id;
      return obj;
    });

    res.json({ success: true, tasks: formattedTasks });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// Helper for validating assignment
async function canAssignTo(assigneeId, reqUser) {
  if (reqUser.role === 'Manager') return true;
  if (assigneeId === reqUser.id) return true;
  if (reqUser.role === 'Team Lead') {
    const user = await User.findById(assigneeId);
    if (user && user.teamLead && user.teamLead.toString() === reqUser.id) {
      return true;
    }
  }
  return false;
}

// @route   POST api/tasks
// @desc    Create a task
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    let { title, description, status, assignedTo } = req.body;

    // Validate assignedTo
    if (assignedTo && assignedTo !== req.user.id) {
      const valid = await canAssignTo(assignedTo, req.user);
      if (!valid) {
        return res.status(403).json({ success: false, error: 'Cannot assign task to this user.' });
      }
    } else {
      assignedTo = req.user.id;
    }

    const newTask = new Task({
      title,
      description,
      status: status || 'pending',
      createdBy: req.user.id,
      assignedTo: assignedTo
    });

    const task = await newTask.save();
    
    const obj = task.toObject();
    obj.id = obj._id;

    res.json({ success: true, task: obj });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// @route   PUT api/tasks/:id
// @desc    Update a task
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    let task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    // Validate permissions: Employee only modifies own assigned/created tasks
    if (req.user.role === 'Employee' && task.createdBy.toString() !== req.user.id && task.assignedTo.toString() !== req.user.id) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
    }
    
    // Validate Team Lead scope
    if (req.user.role === 'Team Lead' && task.createdBy.toString() !== req.user.id && task.assignedTo.toString() !== req.user.id) {
        // Technically team lead can modify team tasks, check if the task assign/create is in team
        const teamMembers = await User.find({ teamLead: req.user.id }).select('_id');
        const isInTeam = teamMembers.some(m => m._id.toString() === task.assignedTo.toString() || m._id.toString() === task.createdBy.toString());
        if (!isInTeam) {
            return res.status(401).json({ success: false, error: 'Not authorized' });
        }
    }

    const { title, description, status, assignedTo } = req.body;

    const taskFields = {};
    if (title) taskFields.title = title;
    if (description) taskFields.description = description;
    if (status) taskFields.status = status;
    
    // Assignment updates
    if (assignedTo && assignedTo !== task.assignedTo.toString()) {
      const valid = await canAssignTo(assignedTo, req.user);
      if (!valid) {
        return res.status(403).json({ success: false, error: 'Cannot reassign task to this user.' });
      }
      taskFields.assignedTo = assignedTo;
    }

    task = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: taskFields },
      { new: true }
    );

    const obj = task.toObject();
    obj.id = obj._id;

    res.json({ success: true, task: obj });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ success: false, error: 'Task not found' });
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

// @route   DELETE api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    let task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    // Validate permissions
    if (req.user.role === 'Employee' && task.createdBy.toString() !== req.user.id) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
    }
    
    if (req.user.role === 'Team Lead' && task.createdBy.toString() !== req.user.id && task.assignedTo.toString() !== req.user.id) {
        const teamMembers = await User.find({ teamLead: req.user.id }).select('_id');
        const isInTeam = teamMembers.some(m => m._id.toString() === task.assignedTo.toString() || m._id.toString() === task.createdBy.toString());
        if (!isInTeam) {
            return res.status(401).json({ success: false, error: 'Not authorized' });
        }
    }

    await Task.findByIdAndDelete(req.params.id);

    res.json({ success: true, msg: 'Task removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') return res.status(404).json({ success: false, error: 'Task not found' });
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});

module.exports = router;
