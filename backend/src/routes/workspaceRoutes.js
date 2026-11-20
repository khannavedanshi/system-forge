const express = require('express');
const router = express.Router();
const {
  getAllWorkspaces,
  getWorkspaceById,
  createWorkspace,
  updateWorkspace,
  duplicateWorkspace,
  deleteWorkspace
} = require('../controllers/workspaceController');

router.route('/')
  .get(getAllWorkspaces)
  .post(createWorkspace);

router.route('/:id')
  .get(getWorkspaceById)
  .put(updateWorkspace)
  .delete(deleteWorkspace);

router.route('/:id/duplicate')
  .post(duplicateWorkspace);

module.exports = router;
