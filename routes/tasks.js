const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Task = require('../models/Task');

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
      case 'Manager':
        // Managers and Team Leads currently see all tasks.
        tasks = await Task.find({}).sort({ createdAt: -1 });
        break;
      default:
        tasks = await Task.find({ createdBy: userId }).sort({ createdAt: -1 });
    }

    // To match front-end interface, we might map _id to id, but mongoose documents have an `id` getter. Let's send raw documents mostly and frontend can process them.
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

// @route   POST api/tasks
// @desc    Create a task
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, status, assignedTo } = req.body;

    const newTask = new Task({
      title,
      description,
      status: status || 'pending',
      createdBy: req.user.id,
      assignedTo: assignedTo || req.user.id
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

    if (req.user.role === 'Employee' && task.createdBy.toString() !== req.user.id && task.assignedTo.toString() !== req.user.id) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    const { title, description, status, assignedTo } = req.body;

    const taskFields = {};
    if (title) taskFields.title = title;
    if (description) taskFields.description = description;
    if (status) taskFields.status = status;
    if (assignedTo && (req.user.role === 'Manager' || req.user.role === 'Team Lead')) {
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

    if (req.user.role === 'Employee' && task.createdBy.toString() !== req.user.id) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
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
