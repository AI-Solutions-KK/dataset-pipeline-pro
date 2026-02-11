// server.js - Node.js Backend for Python Pipeline Integration
// This server is needed when NOT using Tauri (browser-based deployment)

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 7860;

// Middleware
app.use(cors());
app.use(express.json());
// Serve built frontend (static files)
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// PYTHON DETECTION
// ============================================================================

/**
 * Detect Python executable path
 */
function getPythonCommand() {
  // Try different Python commands
  const commands = ['python', 'python3', 'py'];
  for (const cmd of commands) {
    try {
      require('child_process').execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (e) {
      // Command not available, try next
    }
  }
  return 'python'; // Default fallback
}

// Configure file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

// Also accept POST for clean-all (some hosting environments prefer POST)
app.post('/api/clean-all', async (req, res) => {
  try {
    const CLEAN_DIRS = [
      'uploads',
      'data',
      'datasets',
      'outputs',
      'cache'
    ];

    for (const dir of CLEAN_DIRS) {
      const full = path.join(__dirname, dir);

      try {
        const files = await fs.readdir(full);
        for (const f of files) {
          await fs.rm(path.join(full, f), {
            recursive: true,
            force: true
          });
        }
        console.log(`[CLEAN] Cleared ${dir}/`);
      } catch {
        // ignore missing dirs
      }
    }

    res.json({
      ok: true,
      message: 'All generated files cleared'
    });

  } catch (err) {
    console.error('[CLEAN ERROR]', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

const upload = multer({ storage });

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Upload file endpoint
 * Stores the uploaded file and returns its path
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = path.join(__dirname, 'uploads', req.file.filename);
    
    res.json({
      success: true,
      filePath: filePath,
      fileName: req.file.originalname
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Run pipeline endpoint
 * Executes the Python pipeline and streams logs back to client
 */
app.post('/api/run-pipeline', async (req, res) => {
  const { filePath } = req.body;
  
  if (!filePath) {
    return res.status(400).json({ error: 'No file path provided' });
  }
  
  // Set headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    // Path to Python script
    const pythonScript = path.join(__dirname, 'python_src', 'pipeline_engine.py');
    const pythonCmd = getPythonCommand();
    
    console.log(`[Server] Spawning Python: ${pythonCmd} ${pythonScript} ${filePath}`);
    res.write(`LOG: [START] Using Python command: ${pythonCmd}\n`);
    
    // Spawn Python process
    const pythonProcess = spawn(pythonCmd, [pythonScript, filePath]);
    
    // Stream stdout (logs) to client
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      res.write(output);
    });
    
    // Stream stderr (errors) to client
    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('Python Error:', error);
      res.write(`LOG: [PYTHON_ERROR] ${error}\n`);
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        res.write('LOG: [OK] Pipeline completed successfully\n');
      } else {
        res.write(`LOG: [ERROR] Pipeline exited with code ${code}\n`);
      }
      res.end();
    });
    
    // Handle errors
    pythonProcess.on('error', (error) => {
      console.error('Process error:', error);
      res.write(`LOG: [ERROR] Process error: ${error.message}\n`);
      res.end();
    });
    
  } catch (error) {
    console.error('Pipeline error:', error);
    res.write(`LOG: ❌ ${error.message}\n`);
    res.end();
  }
});

/**
 * Get generated datasets
 * Returns all dataset files from the datasets directory
 */
app.get('/api/datasets', async (req, res) => {
  try {
    const datasetsDir = path.join(__dirname, 'datasets');
    const files = {};
    
    // Read all files in datasets directory
    const fileNames = await fs.readdir(datasetsDir);
    
    for (const fileName of fileNames) {
      const filePath = path.join(datasetsDir, fileName);
      const content = await fs.readFile(filePath, 'utf-8');
      
      if (fileName.endsWith('.json')) {
        files[fileName] = JSON.parse(content);
      } else {
        files[fileName] = content;
      }
    }
    
    res.json(files);
  } catch (error) {
    console.error('Error loading datasets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get evaluation report
 * Returns the dataset quality report
 */
app.get('/api/report', async (req, res) => {
  try {
    const reportPath = path.join(__dirname, 'outputs', 'dataset_report.json');
    const content = await fs.readFile(reportPath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (error) {
    console.error('Error loading report:', error);
    res.status(404).json({ error: 'Report not found' });
  }
});

/**
 * Download dataset file
 * Allows downloading specific dataset files
 */
app.get('/api/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'datasets', filename);
    
    // Check if file exists
    await fs.access(filePath);
    
    res.download(filePath, filename);
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Dataset Pipeline Server running',
    version: '1.0.0'
  });
});

// ============================================================================
// CLEAN ALL GENERATED FILES
// ============================================================================

app.delete('/api/clean-all', async (req, res) => {
  try {
    const CLEAN_DIRS = [
      'uploads',
      'data',
      'datasets',
      'outputs',
      'cache'
    ];

    for (const dir of CLEAN_DIRS) {
      const full = path.join(__dirname, dir);

      try {
        const files = await fs.readdir(full);
        for (const f of files) {
          await fs.rm(path.join(full, f), {
            recursive: true,
            force: true
          });
        }
        console.log(`[CLEAN] Cleared ${dir}/`);
      } catch {
        // ignore missing dirs
      }
    }

    res.json({
      ok: true,
      message: 'All generated files cleared'
    });

  } catch (err) {
    console.error('[CLEAN ERROR]', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});


// ============================================================================
// START SERVER
// ============================================================================

// Fallback for SPA routing - serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Dataset Pipeline Server');
  console.log('='.repeat(60));
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`📁 Upload endpoint: POST /api/upload`);
  console.log(`⚙️  Pipeline endpoint: POST /api/run-pipeline`);
  console.log(`📊 Datasets endpoint: GET /api/datasets`);
  console.log(`📈 Report endpoint: GET /api/report`);
  console.log('='.repeat(60));
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

module.exports = app;