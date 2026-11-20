const mongoose = require('mongoose');

const SheetSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: 'Sheet 1' },
    camera: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      zoom: { type: Number, default: 1 }
    },
    shapes: { type: mongoose.Schema.Types.Mixed, default: [] },
    notesHTML: { type: String, default: '' },
    notesMarkdown: { type: String, default: '' }
  },
  { _id: false }
);

const WorkspaceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Workspace title is required'],
      trim: true,
      default: 'Untitled Architecture'
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    sheets: {
      type: [SheetSchema],
      default: [
        {
          id: 'sheet_1',
          name: 'Sheet 1',
          camera: { x: 0, y: 0, zoom: 1 },
          shapes: [],
          notesHTML: '',
          notesMarkdown: ''
        }
      ]
    },
    activeSheetIdx: {
      type: Number,
      default: 0
    },
    viewMode: {
      type: String,
      enum: ['SPLIT', 'CANVAS', 'NOTES'],
      default: 'SPLIT'
    },
    splitRatio: {
      type: Number,
      default: 0.38
    },
    thumbnail: {
      type: String,
      default: null
    },
    tags: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Workspace', WorkspaceSchema);
