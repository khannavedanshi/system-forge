const Workspace = require('../models/Workspace');

// @desc    Get all workspaces (metadata & summaries)
// @route   GET /api/workspaces
exports.getAllWorkspaces = async (req, res, next) => {
  try {
    const { search, tag } = req.query;
    const query = {};

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    if (tag) {
      query.tags = tag;
    }

    // Return list with lightweight metadata
    const workspaces = await Workspace.find(query)
      .select('title description tags activeSheetIdx viewMode thumbnail createdAt updatedAt')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: workspaces.length,
      data: workspaces
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single workspace by ID (full data including sheets and shapes)
// @route   GET /api/workspaces/:id
exports.getWorkspaceById = async (req, res, next) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: `Workspace with ID '${req.params.id}' not found`
      });
    }

    res.status(200).json({
      success: true,
      data: workspace
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new workspace
// @route   POST /api/workspaces
exports.createWorkspace = async (req, res, next) => {
  try {
    const workspace = await Workspace.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Workspace created successfully',
      data: workspace
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update / Auto-save workspace
// @route   PUT /api/workspaces/:id
exports.updateWorkspace = async (req, res, next) => {
  try {
    const workspace = await Workspace.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: `Workspace with ID '${req.params.id}' not found`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Workspace saved successfully',
      data: workspace
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Duplicate an existing workspace
// @route   POST /api/workspaces/:id/duplicate
exports.duplicateWorkspace = async (req, res, next) => {
  try {
    const source = await Workspace.findById(req.params.id);

    if (!source) {
      return res.status(404).json({
        success: false,
        message: `Source workspace with ID '${req.params.id}' not found`
      });
    }

    const duplicateData = source.toObject();
    delete duplicateData._id;
    delete duplicateData.createdAt;
    delete duplicateData.updatedAt;
    duplicateData.title = `${source.title} (Copy)`;

    const newWorkspace = await Workspace.create(duplicateData);

    res.status(201).json({
      success: true,
      message: 'Workspace duplicated successfully',
      data: newWorkspace
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a workspace
// @route   DELETE /api/workspaces/:id
exports.deleteWorkspace = async (req, res, next) => {
  try {
    const workspace = await Workspace.findByIdAndDelete(req.params.id);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: `Workspace with ID '${req.params.id}' not found`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Workspace deleted successfully',
      data: {}
    });
  } catch (error) {
    next(error);
  }
};
