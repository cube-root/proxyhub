const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
    res.json({
        message: 'Hello from ProxyHub test server!',
        timestamp: new Date().toISOString(),
        port: port,
        headers: req.headers
    });
});

// API endpoint
app.get('/api/test', (req, res) => {
    res.json({
        message: 'API endpoint working!',
        method: req.method,
        query: req.query,
        timestamp: new Date().toISOString()
    });
});

// POST endpoint
app.post('/api/data', (req, res) => {
    res.json({
        message: 'Data received successfully!',
        receivedData: req.body,
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Test server running on http://localhost:${port}`);
    console.log(`📡 Ready to be tunneled by ProxyHub!`);
    console.log(`\nTry these endpoints:`);
    console.log(`  GET  http://localhost:${port}/`);
    console.log(`  GET  http://localhost:${port}/api/test`);
    console.log(`  POST http://localhost:${port}/api/data`);
    console.log(`  GET  http://localhost:${port}/health`);
    console.log(`\nTo tunnel this server, run:`);
    console.log(`  npm run dev`);
}); 