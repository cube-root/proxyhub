/// <reference path="./@types/index.d.ts" />
import express, { response } from "express";
import "dotenv/config";
import http from 'http';
import cors from 'cors';
import SocketHandler from "./lib/socket";
import RequestMiddleware from "./middlewares/request";
import ResponseMiddleware from "./middlewares/response";
import { RequestChannel } from "./lib/tunnel";

const app = express();
const httpServer = http.createServer(app);

const socketList: TunnelSocketObject[] = [];

const socketHandler = new SocketHandler(httpServer, socketList);
socketHandler.start();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// Rate limiting could be added here for production
// app.use(require('express-rate-limit')({ ... }));

app.use("/", RequestMiddleware, (req, res, next) => {
    const socketId: any = req.id;
    
    // Additional security: ensure socketId is a string
    if (typeof socketId !== 'string') {
        res.status(400).json({ 
            error: 'Invalid request format',
            message: 'Socket ID must be a string'
        });
        return;
    }
    
    // Debug logging
    console.log('Request for socket ID:', socketId);
    console.log('Available socket IDs:', socketList.map(s => s.id));
    
    const connectionData = socketList?.find(
        (item) => item?.id?.toLowerCase() === socketId.toLowerCase()
    );
    
    if (!connectionData?.socket || !socketId) {
        console.log('No matching socket found for:', socketId);
        res.status(404).json({ 
            error: 'Tunnel not found',
            message: 'No active tunnel found for this URL. Please check your connection.'
        });
        return;
    }
    
    // Check if socket is still connected
    if (!connectionData.socket.connected) {
        console.log('Socket found but not connected:', socketId);
        res.status(503).json({ 
            error: 'Tunnel disconnected',
            message: 'The tunnel connection has been lost. Please reconnect your client.'
        });
        return;
    }
    
    console.log('Successfully found and routing to socket:', socketId);
    
    const requestChannel = new RequestChannel(connectionData.socket, {
        method: req.method,
        headers: {
            ...req?.headers,
            host: req?.headers?.host, // Preserve the original host
            origin: req?.headers?.origin, // Preserve the original origin
            referer: req?.headers?.referer, // Preserve the referer
            "if-none-match": undefined,
            "if-modified-since": undefined,
            "Cache-Control": "no-store",
        },
        path: req.url,
        body: req.body,
    });
    
    let dataChunks: any = [];
    
    requestChannel.on("response-header", (statusCode, headers) => {
        res.writeHead(statusCode, headers);
    });
    
    requestChannel.on("data", (chunk) => {
        dataChunks.push(chunk);
        res.write(chunk);
    });
    
    requestChannel.once("end", (chunk) => {
        res.locals.data = Buffer.concat(dataChunks);
        next();
    });
    
    requestChannel.on("error", (error) => {
        console.error("Request channel error:", error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Proxy error',
                message: 'An error occurred while proxying the request'
            });
        }
        requestChannel.destroy();
    });
    
    // Add timeout handling
    const timeoutMs = 30000; // 30 seconds
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            res.status(504).json({ 
                error: 'Request timeout',
                message: 'The request timed out'
            });
        }
        requestChannel.destroy();
    }, timeoutMs);
    
    // Clear timeout when request completes
    requestChannel.once("end", () => {
        clearTimeout(timeout);
    });
    
    requestChannel.on("error", () => {
        clearTimeout(timeout);
    });
    
}, ResponseMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeTunnels: socketList.length
    });
});

// Debug endpoint to see active tunnels
app.get('/debug', (req, res) => {
    res.json({
        socketList: socketList.map(s => ({
            id: s.id,
            connected: s.socket.connected,
            socketId: s.socket.id
        }))
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});