const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://crishav.com.np'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log('✅ Connected to MongoDB Atlas successfully');
    console.log('📍 Cluster: rishav.u7dv2r4.mongodb.net');
    console.log('🗄️ Database: syllabus_tracker');
})
.catch((error) => {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
});

// Syllabus Schema
const syllabusSchema = new mongoose.Schema({
    courseTitle: String,
    courseCode: String,
    creditHours: Object,
    units: Array,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Syllabus = mongoose.model('Syllabus', syllabusSchema);

// User Progress Schema - Simplified
const progressSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        default: 'default_user'
    },
    completedObjectives: {
        type: Object,
        default: {}
    },
    activeSyllabus: {
        type: String,
        default: null
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const Progress = mongoose.model('Progress', progressSchema, 'user_progress');

// JWT Middleware for authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        req.user = user;
        next();
    });
};

// Routes

// Root endpoint - Server status (publicly accessible)
app.get('/', cors(), (req, res) => {
    res.json({
        status: 'OK',
        message: '🚀 Syllabus Tracker Backend Server is Running!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Syllabus Tracker Backend is running',
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        timestamp: new Date().toISOString()
    });
});

// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
        // Generate JWT token with 24-hour expiration
        const token = jwt.sign(
            { 
                username, 
                userId: 'default_user',
                timestamp: Date.now()
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Authentication successful',
            token,
            expiresIn: '24h',
            user: { username, userId: 'default_user' }
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid username or password'
        });
    }
});

// Verify token endpoint
app.post('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Token is valid',
        user: req.user
    });
});

// Get all syllabi
app.get('/api/syllabi', authenticateToken, async (req, res) => {
    try {
        const syllabi = await Syllabus.find({}).select('-_id -__v -createdAt -updatedAt');
        res.json({
            success: true,
            data: syllabi
        });
    } catch (error) {
        console.error('❌ Error fetching syllabi:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch syllabi',
            error: error.message
        });
    }
});

// Get user progress
app.get('/api/progress/:userId?', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId || 'default_user';
        
        let progress = await Progress.findOne({ userId });
        
        if (!progress) {
            // Create initial progress document
            progress = new Progress({
                userId,
                completedObjectives: {},
                activeSyllabus: null
            });
            await progress.save();
            
            console.log('📄 Created new progress document for user:', userId);
        }
        
        console.log('✅ Progress loaded for user:', userId);
        console.log('📊 Completed objectives:', Object.keys(progress.completedObjectives || {}).length);
        console.log('📚 Active syllabus:', progress.activeSyllabus);

        res.json({
            success: true,
            data: {
                userId: progress.userId,
                completedObjectives: progress.completedObjectives || {},
                activeSyllabus: progress.activeSyllabus,
                lastUpdated: progress.lastUpdated
            }
        });
    } catch (error) {
        console.error('❌ Error loading progress:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load progress',
            error: error.message
        });
    }
});

// Save user progress
app.post('/api/progress/:userId?', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId || 'default_user';
        const { completedObjectives, activeSyllabus } = req.body;
        
        let progress = await Progress.findOne({ userId });
        
        if (!progress) {
            progress = new Progress({ userId });
        }
        
        // Simple assignment - no complex Map handling
        if (completedObjectives !== undefined) {
            progress.completedObjectives = completedObjectives || {};
        }
        
        if (activeSyllabus !== undefined) {
            progress.activeSyllabus = activeSyllabus;
        }
        
        progress.lastUpdated = new Date();
        
        await progress.save();
        
        console.log('✅ Progress saved for user:', userId);
        console.log('📊 Completed objectives:', Object.keys(progress.completedObjectives || {}).length);
        console.log('📚 Active syllabus:', progress.activeSyllabus);
        console.log('⏰ Last updated:', progress.lastUpdated);
        
        res.json({
            success: true,
            message: 'Progress saved successfully',
            data: {
                userId: progress.userId,
                completedObjectives: progress.completedObjectives || {},
                activeSyllabus: progress.activeSyllabus,
                lastUpdated: progress.lastUpdated
            }
        });
    } catch (error) {
        console.error('❌ Error saving progress:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save progress',
            error: error.message
        });
    }
});

// Delete user progress (optional)
app.delete('/api/progress/:userId?', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId || 'default_user';
        
        const result = await Progress.deleteOne({ userId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Progress not found'
            });
        }
        
        console.log('🗑️ Progress deleted for user:', userId);
        
        res.json({
            success: true,
            message: 'Progress deleted successfully'
        });
    } catch (error) {
        console.error('❌ Error deleting progress:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete progress',
            error: error.message
        });
    }
});

// Get database stats
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const progressCount = await Progress.countDocuments();
        const syllabusCount = await Syllabus.countDocuments();
        
        res.json({
            success: true,
            data: {
                totalUsers: progressCount,
                totalSyllabi: syllabusCount
            }
        });
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get database stats',
            error: error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('❌ Server Error:', error);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Syllabus Tracker Backend Server started');
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('📋 Available endpoints:');
    console.log('   GET  / - Server status');
    console.log('   GET  /api/health - Health check');
    console.log('   POST /api/auth/login - Authentication');
    console.log('   POST /api/auth/verify - Verify token');
    console.log('   GET  /api/syllabi - Get all syllabi (protected)');
    console.log('   GET  /api/progress/:userId - Load progress (protected)');
    console.log('   POST /api/progress/:userId - Save progress (protected)');
    console.log('   DELETE /api/progress/:userId - Delete progress (protected)');
    console.log('   GET  /api/stats - Database statistics (protected)');
    console.log('🌐 CORS enabled for:');
    console.log('   - http://localhost:5500');
    console.log('   - http://127.0.0.1:5500');
    console.log('   - https://crishav.com.np');
});

module.exports = app;
