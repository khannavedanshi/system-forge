const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Workspace = require('./models/Workspace');
const workspaceRoutes = require('./routes/workspaceRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middlewares
app.use(cors({
  origin: process.env.CLIENT_ORIGIN === '*' ? '*' : (process.env.CLIENT_ORIGIN || '*'),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Generous body limit for complex diagrams, drawings, and embedded images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Serve static frontend assets
const frontendPath = path.join(__dirname, '../../frontend');
const rootPath = path.join(__dirname, '../..');
app.use('/frontend', express.static(frontendPath));
app.use(express.static(frontendPath));

// Health Check & Diagnostic Endpoint
app.get('/api/health', (req, res) => {
  const dbStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const dbState = mongoose.connection.readyState;

  res.status(200).json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbStates[dbState] || 'unknown',
      connected: dbState === 1,
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null
    }
  });
});

// @desc    Refresh Endpoint (called on DOMContentLoaded by frontend)
// @route   GET /refresh or GET /api/refresh
app.get(['/refresh', '/api/refresh'], async (req, res, next) => {
  try {
    let workspace = await Workspace.findOne().sort({ updatedAt: -1 });
    if (!workspace) {
      workspace = await Workspace.create({
        title: 'My Architecture Workspace',
        sheets: [
          {
            id: 'sheet_1',
            name: 'Sheet 1',
            camera: { x: 0, y: 0, zoom: 1 },
            shapes: [],
            notesHTML: '',
            notesMarkdown: ''
          }
        ],
        activeSheetIdx: 0
      });
    }
    res.status(200).json({
      success: true,
      workspace
    });
  } catch (err) {
    next(err);
  }
});

// @desc    Save Endpoint (called whenever edits occur or auto-saved)
// @route   POST /save or POST /api/save
app.post(['/save', '/api/save'], async (req, res, next) => {
  try {
    const { title = 'My Architecture Workspace', sheets, activeSheetIdx, viewMode, splitRatio } = req.body;
    const workspace = await Workspace.findOneAndUpdate(
      { title },
      { $set: { sheets, activeSheetIdx, viewMode, splitRatio, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.status(200).json({
      success: true,
      message: 'Saved to MongoDB Atlas successfully',
      workspace
    });
  } catch (err) {
    next(err);
  }
});

// API Routes
app.use('/api/workspaces', workspaceRoutes);

// Fallback to frontend index.html for non-API web routes
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api') || req.originalUrl === '/refresh' || req.originalUrl === '/save') {
    return next();
  }
  res.sendFile(path.join(rootPath, 'index.html'));
});

// Catch-all 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.originalUrl}' not found.`
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

// Start Server
const server = app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` Architecture Workspace Backend Server`);
  console.log(` Status: Running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(` App URL: http://localhost:${PORT}`);
  console.log(` Health:  http://localhost:${PORT}/api/health`);
  console.log(` Refresh: http://localhost:${PORT}/refresh`);
  console.log(`======================================================\n`);
});

// Graceful Handling of Unhandled Promise Rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server and DB connections...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('Server and DB connection closed.');
      process.exit(0);
    });
  });
});

module.exports = app;
