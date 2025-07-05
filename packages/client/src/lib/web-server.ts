import * as http from 'http';
import * as url from 'url';
import * as path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import chalk from 'chalk';
import RequestLogManager from './log-manager.js';

class WebServer {
    private server: http.Server;
    private io: SocketIOServer;
    private logManager: RequestLogManager;
    private port: number;

    constructor(logManager: RequestLogManager, port: number = 4001) {
        this.logManager = logManager;
        this.port = port;
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.setupSocketHandlers();
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(chalk.blue(`🌐 Browser connected to logs interface`));
            
            // Send existing logs to new connection
            socket.emit('logs', this.logManager.getLogs());
            
            // Handle request for all logs
            socket.on('get-logs', () => {
                socket.emit('logs', this.logManager.getLogs());
            });
            
            // Handle clear logs request
            socket.on('clear-logs', () => {
                this.logManager.clearLogs();
                this.io.emit('logs', []);
                console.log(chalk.yellow('📝 Request logs cleared'));
            });
            
            socket.on('disconnect', () => {
                console.log(chalk.gray('🌐 Browser disconnected from logs interface'));
            });
        });
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const parsedUrl = url.parse(req.url || '/', true);
        const pathname = parsedUrl.pathname;

        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        switch (pathname) {
            case '/':
                this.serveHTML(res);
                break;
            case '/api/logs':
                this.serveLogs(res);
                break;
            case '/api/logs/clear':
                this.clearLogs(res);
                break;
            default:
                this.serve404(res);
        }
    }

    private serveHTML(res: http.ServerResponse) {
        const html = this.getHTMLContent();
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    }

    private serveLogs(res: http.ServerResponse) {
        const logs = this.logManager.getLogs();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(logs));
    }

    private clearLogs(res: http.ServerResponse) {
        this.logManager.clearLogs();
        this.io.emit('logs', []);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    }

    private serve404(res: http.ServerResponse) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }

    private getHTMLContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ProxyHub - Request Logs</title>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
            color: #e2e8f0; 
            line-height: 1.6; 
            min-height: 100vh;
        }
        
        .header { 
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            padding: 1.5rem 2rem; 
            border-bottom: 2px solid #00d4aa;
            box-shadow: 0 4px 20px rgba(0, 212, 170, 0.1);
            display: flex; 
            justify-content: space-between; 
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(10px);
        }
        
        .header h1 { 
            color: #00d4aa; 
            font-size: 1.8rem; 
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .logo-icon {
            width: 32px;
            height: 32px;
            background: linear-gradient(45deg, #00d4aa, #00b89a);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
        }
        
        .stats { 
            display: flex; 
            gap: 2rem; 
            font-size: 0.9rem;
            align-items: center;
        }
        
        .stat { 
            display: flex; 
            align-items: center; 
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            background: rgba(0, 212, 170, 0.1);
            border-radius: 8px;
            border: 1px solid rgba(0, 212, 170, 0.2);
        }
        
        .stat-label {
            font-size: 0.8rem;
            color: #94a3b8;
        }
        
        .stat-value { 
            font-weight: 700; 
            color: #00d4aa;
            font-size: 1rem;
        }
        
        .connection-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 0.5rem;
            animation: pulse 2s infinite;
        }
        
        .connection-indicator.connected {
            background: #00d4aa;
            box-shadow: 0 0 0 4px rgba(0, 212, 170, 0.3);
        }
        
        .connection-indicator.disconnected {
            background: #ff4757;
            box-shadow: 0 0 0 4px rgba(255, 71, 87, 0.3);
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .controls { 
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            padding: 1rem 2rem; 
            border-bottom: 1px solid #374151;
            display: flex; 
            gap: 1rem;
            align-items: center;
            justify-content: space-between;
        }
        
        .controls-left {
            display: flex;
            gap: 1rem;
        }
        
        .controls-right {
            display: flex;
            gap: 1rem;
            align-items: center;
        }
        
        .filter-input {
            padding: 0.5rem 1rem;
            border: 1px solid #374151;
            border-radius: 8px;
            background: #1a1a1a;
            color: #e2e8f0;
            font-size: 0.9rem;
            width: 200px;
        }
        
        .filter-input:focus {
            outline: none;
            border-color: #00d4aa;
            box-shadow: 0 0 0 3px rgba(0, 212, 170, 0.1);
        }
        
        .btn { 
            padding: 0.6rem 1.2rem; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer;
            font-size: 0.9rem; 
            font-weight: 600;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .btn-primary { 
            background: linear-gradient(135deg, #00d4aa 0%, #00b89a 100%); 
            color: #1a1a1a; 
        }
        
        .btn-primary:hover { 
            background: linear-gradient(135deg, #00b89a 0%, #009688 100%); 
        }
        
        .btn-danger { 
            background: linear-gradient(135deg, #ff4757 0%, #ff3742 100%); 
            color: white; 
        }
        
        .btn-danger:hover { 
            background: linear-gradient(135deg, #ff3742 0%, #e84393 100%); 
        }
        
        .btn-secondary {
            background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%);
            color: white;
        }
        
        .btn-secondary:hover {
            background: linear-gradient(135deg, #5a6268 0%, #495057 100%);
        }
        
        .logs-container { 
            padding: 2rem; 
            max-width: 1400px; 
            margin: 0 auto; 
        }
        
        .log-entry { 
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            margin-bottom: 1.5rem; 
            border-radius: 12px;
            border: 1px solid #374151; 
            transition: all 0.3s ease;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .log-entry:hover { 
            border-color: #00d4aa; 
            box-shadow: 0 8px 25px rgba(0, 212, 170, 0.15);
            transform: translateY(-2px);
        }
        
        .log-header { 
            padding: 1.2rem; 
            border-bottom: 1px solid #374151; 
            display: flex;
            justify-content: space-between; 
            align-items: center; 
            cursor: pointer;
            background: rgba(0, 0, 0, 0.2);
        }
        
        .log-summary { 
            display: flex; 
            align-items: center; 
            gap: 1rem; 
            flex: 1;
        }
        
        .method { 
            font-weight: 700; 
            font-size: 0.8rem; 
            padding: 0.4rem 0.8rem;
            border-radius: 6px; 
            min-width: 70px; 
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .method.GET { background: linear-gradient(135deg, #00d4aa 0%, #00b89a 100%); color: #1a1a1a; }
        .method.POST { background: linear-gradient(135deg, #ffa502 0%, #ff7675 100%); color: #1a1a1a; }
        .method.PUT { background: linear-gradient(135deg, #3742fa 0%, #2f3542 100%); color: white; }
        .method.DELETE { background: linear-gradient(135deg, #ff4757 0%, #ff3742 100%); color: white; }
        .method.PATCH { background: linear-gradient(135deg, #7bed9f 0%, #00cec9 100%); color: #1a1a1a; }
        
        .path { 
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace; 
            font-size: 0.95rem; 
            color: #e2e8f0;
            background: rgba(0, 0, 0, 0.3);
            padding: 0.3rem 0.6rem;
            border-radius: 6px;
            flex: 1;
            margin: 0 1rem;
        }
        
        .status { 
            font-weight: 700; 
            font-size: 0.85rem; 
            padding: 0.4rem 0.8rem;
            border-radius: 6px; 
            min-width: 60px; 
            text-align: center;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .status.success { background: linear-gradient(135deg, #00d4aa 0%, #00b89a 100%); color: #1a1a1a; }
        .status.error { background: linear-gradient(135deg, #ff4757 0%, #ff3742 100%); color: white; }
        .status.warning { background: linear-gradient(135deg, #ffa502 0%, #fdcb6e 100%); color: #1a1a1a; }
        
        .log-meta {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .timestamp { 
            font-size: 0.8rem; 
            color: #94a3b8;
            background: rgba(0, 0, 0, 0.3);
            padding: 0.3rem 0.6rem;
            border-radius: 6px;
        }
        
        .duration { 
            font-size: 0.8rem; 
            color: #00d4aa;
            font-weight: 600;
        }
        
        .expand-icon { 
            transition: all 0.3s ease; 
            color: #00d4aa;
            font-size: 1.2rem;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 212, 170, 0.1);
            border-radius: 50%;
        }
        
        .expand-icon.rotated { 
            transform: rotate(180deg); 
            background: rgba(0, 212, 170, 0.2);
        }
        
        .log-details { 
            display: none; 
            padding: 1.5rem; 
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            animation: slideDown 0.3s ease;
        }
        
        .log-details.expanded { 
            display: block; 
        }
        
        @keyframes slideDown {
            from { opacity: 0; max-height: 0; }
            to { opacity: 1; max-height: 1000px; }
        }
        
        .detail-section { 
            margin-bottom: 2rem; 
        }
        
        .detail-title { 
            font-size: 1rem; 
            font-weight: 700; 
            color: #00d4aa; 
            margin-bottom: 0.8rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .detail-title::before {
            content: '';
            width: 4px;
            height: 20px;
            background: linear-gradient(135deg, #00d4aa 0%, #00b89a 100%);
            border-radius: 2px;
        }
        
        .detail-content { 
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace; 
            font-size: 0.85rem; 
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            padding: 1rem; 
            border-radius: 8px; 
            border: 1px solid #374151;
            white-space: pre-wrap; 
            overflow-x: auto;
            line-height: 1.5;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .empty-state { 
            text-align: center; 
            padding: 4rem; 
            color: #94a3b8; 
        }
        
        .empty-state-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            opacity: 0.5;
        }
        
        .empty-state h2 { 
            font-size: 1.5rem; 
            margin-bottom: 1rem;
            color: #e2e8f0;
        }
        
        .empty-state p {
            font-size: 1rem;
            line-height: 1.6;
        }
        
        .loading { 
            text-align: center; 
            padding: 3rem; 
            color: #94a3b8; 
        }
        
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #374151;
            border-top: 4px solid #00d4aa;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .error-indicator {
            color: #ff4757;
            background: rgba(255, 71, 87, 0.1);
            padding: 0.5rem 1rem;
            border-radius: 6px;
            border: 1px solid rgba(255, 71, 87, 0.2);
        }
        
        /* Responsive Design */
        @media (max-width: 768px) {
            .header {
                flex-direction: column;
                gap: 1rem;
                padding: 1rem;
            }
            
            .stats {
                flex-wrap: wrap;
                gap: 1rem;
            }
            
            .controls {
                flex-direction: column;
                gap: 1rem;
            }
            
            .log-summary {
                flex-wrap: wrap;
                gap: 0.5rem;
            }
            
            .path {
                margin: 0;
                flex: none;
                min-width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            <div class="logo-icon">🚀</div>
            ProxyHub Request Logs
        </h1>
        <div class="stats">
            <div class="stat">
                <span class="stat-label">Total Requests:</span>
                <span class="stat-value" id="total-requests">0</span>
            </div>
            <div class="stat">
                <div class="connection-indicator" id="connection-indicator"></div>
                <span class="stat-label">Status:</span>
                <span class="stat-value" id="connection-status">Connecting...</span>
            </div>
        </div>
    </div>
    
    <div class="controls">
        <div class="controls-left">
            <button class="btn btn-primary" onclick="refreshLogs()">
                🔄 Refresh
            </button>
            <button class="btn btn-danger" onclick="clearLogs()">
                🗑️ Clear All
            </button>
            <button class="btn btn-secondary" onclick="exportLogs()">
                💾 Export
            </button>
        </div>
        <div class="controls-right">
            <input type="text" class="filter-input" id="filter-input" placeholder="Filter logs..." oninput="filterLogs()">
        </div>
    </div>
    
    <div class="logs-container">
        <div id="logs-content" class="loading">
            <div class="loading-spinner"></div>
            <div>Loading logs...</div>
        </div>
    </div>

    <script>
        const socket = io();
        let logs = [];

        socket.on('connect', () => {
            console.log('Connected to server');
            document.getElementById('connection-status').textContent = 'Connected';
            document.getElementById('connection-status').style.color = '#00d4aa';
            
            const indicator = document.getElementById('connection-indicator');
            indicator.className = 'connection-indicator connected';
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            document.getElementById('connection-status').textContent = 'Disconnected';
            document.getElementById('connection-status').style.color = '#ff4757';
            
            const indicator = document.getElementById('connection-indicator');
            indicator.className = 'connection-indicator disconnected';
        });

        socket.on('logs', (newLogs) => {
            console.log('Received logs:', newLogs.length);
            logs = newLogs;
            renderLogs();
        });

        socket.on('new-log', (log) => {
            console.log('New log received:', log);
            logs.unshift(log);
            renderLogs();
        });

        function renderLogs() {
            const container = document.getElementById('logs-content');
            const totalRequests = document.getElementById('total-requests');
            
            totalRequests.textContent = logs.length;

            if (logs.length === 0) {
                container.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <h2>No requests yet</h2>
                        <p>Make a request to your tunneled URL to see logs appear here in real-time</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = logs.map(log => {
                const statusClass = getStatusClass(log.statusCode);
                const timestamp = formatTimestamp(log.timestamp);
                const duration = log.duration ? \`(\${log.duration}ms)\` : '';
                
                return \`
                    <div class="log-entry">
                        <div class="log-header" onclick="toggleDetails('\${log.id}')">
                            <div class="log-summary">
                                <span class="method \${log.method}">\${log.method}</span>
                                <span class="path">\${log.path}</span>
                                <span class="status \${statusClass}">\${log.statusCode || 'N/A'}</span>
                            </div>
                            <div class="log-meta">
                                <span class="duration">\${duration}</span>
                                <span class="timestamp">\${timestamp}</span>
                                <span class="expand-icon" id="icon-\${log.id}">▼</span>
                            </div>
                        </div>
                        <div class="log-details" id="details-\${log.id}">
                            <div class="detail-section">
                                <div class="detail-title">Request Headers</div>
                                <div class="detail-content">\${formatHeaders(log.requestHeaders)}</div>
                            </div>
                            \${log.requestBody ? \`
                                <div class="detail-section">
                                    <div class="detail-title">Request Body</div>
                                    <div class="detail-content">\${formatBody(log.requestBody)}</div>
                                </div>
                            \` : ''}
                            <div class="detail-section">
                                <div class="detail-title">Response Headers</div>
                                <div class="detail-content">\${formatHeaders(log.responseHeaders)}</div>
                            </div>
                            \${log.responseBody ? \`
                                <div class="detail-section">
                                    <div class="detail-title">Response Body</div>
                                    <div class="detail-content">\${formatBody(log.responseBody)}</div>
                                </div>
                            \` : ''}
                            \${log.error ? \`
                                <div class="detail-section">
                                    <div class="detail-title">Error</div>
                                    <div class="detail-content">\${log.error}</div>
                                </div>
                            \` : ''}
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function getStatusClass(status) {
            if (!status) return 'warning';
            if (status >= 200 && status < 300) return 'success';
            if (status >= 400) return 'error';
            return 'warning';
        }

        function formatTimestamp(timestamp) {
            return new Date(timestamp).toLocaleString();
        }

        function formatHeaders(headers) {
            if (!headers || Object.keys(headers).length === 0) {
                return 'No headers';
            }
            return Object.entries(headers)
                .map(([key, value]) => \`\${key}: \${value}\`)
                .join('\\n');
        }

        function formatBody(body) {
            if (!body) return 'No body';
            try {
                return JSON.stringify(JSON.parse(body), null, 2);
            } catch (e) {
                return body;
            }
        }

        function toggleDetails(id) {
            const details = document.getElementById('details-' + id);
            const icon = document.getElementById('icon-' + id);
            
            if (details.classList.contains('expanded')) {
                details.classList.remove('expanded');
                icon.classList.remove('rotated');
            } else {
                details.classList.add('expanded');
                icon.classList.add('rotated');
            }
        }

        function refreshLogs() {
            socket.emit('get-logs');
        }

        function clearLogs() {
            if (confirm('Are you sure you want to clear all logs?')) {
                socket.emit('clear-logs');
            }
        }

        function filterLogs() {
            const filterText = document.getElementById('filter-input').value.toLowerCase();
            const entries = document.querySelectorAll('.log-entry');
            
            entries.forEach(entry => {
                const method = entry.querySelector('.method').textContent.toLowerCase();
                const path = entry.querySelector('.path').textContent.toLowerCase();
                const status = entry.querySelector('.status').textContent.toLowerCase();
                
                const matches = method.includes(filterText) || 
                               path.includes(filterText) || 
                               status.includes(filterText);
                
                entry.style.display = matches ? 'block' : 'none';
            });
        }

        function exportLogs() {
            const dataStr = JSON.stringify(logs, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = \`proxyhub-logs-\${new Date().toISOString().split('T')[0]}.json\`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        // Initialize connection indicator
        const indicator = document.getElementById('connection-indicator');
        indicator.className = 'connection-indicator disconnected';
    </script>
</body>
</html>`;
    }

    public broadcastNewLog(log: RequestLogEntry) {
        console.log(chalk.blue(`📡 Broadcasting log to ${this.io.engine.clientsCount} connected clients`));
        this.io.emit('new-log', log);
    }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, () => {
                console.log(chalk.green(`🌐 Web interface started at http://localhost:${this.port}`));
                resolve();
            }).on('error', (err) => {
                reject(err);
            });
        });
    }

    public stop(): void {
        this.server.close();
        this.io.close();
    }
}

export default WebServer; 