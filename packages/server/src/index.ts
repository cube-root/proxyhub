/// <reference path="./@types/index.d.ts" />
import express from "express";
import "dotenv/config";
import http from 'http';
import cors from 'cors';
import crypto from 'crypto';
import SocketHandler from "./lib/socket";
import RequestMiddleware from "./middlewares/request";
import { RequestChannel } from "./lib/tunnel";
import { debug } from "./utils/debug";

// Timing-safe token comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
        // Compare against itself to maintain constant time
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

const app = express();
const httpServer = http.createServer(app);

const socketHandler = new SocketHandler(httpServer);
socketHandler.start();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.use("/", RequestMiddleware, (req, res) => {
    const socketId: any = req.id;

    if (typeof socketId !== 'string') {
        res.status(400).json({
            error: 'Invalid request format',
            message: 'Socket ID must be a string'
        });
        return;
    }

    debug('Request for tunnel ID:', socketId);

    const tunnelMapping = socketHandler.getTunnelByStableId(socketId);

    if (!tunnelMapping) {
        debug('No tunnel mapping found for ID:', socketId);
        res.status(404).json({
            error: 'Tunnel not found',
            message: 'No active tunnel found for this URL. Please check your connection.'
        });
        return;
    }

    if (!tunnelMapping.socket.connected) {
        debug('Tunnel found but socket not connected:', socketId);
        res.status(503).json({
            error: 'Tunnel disconnected',
            message: 'The tunnel connection has been lost. Please reconnect your client.'
        });
        return;
    }

    // Token validation
    if (tunnelMapping.token) {
        const providedToken = req.headers['x-proxy-token'] as string | undefined;
        if (!providedToken) {
            debug('Token required but not provided for tunnel:', socketId);
            res.status(401).json({
                error: 'Unauthorized',
                message: 'This tunnel requires authentication. Provide X-Proxy-Token header.'
            });
            return;
        }
        if (!timingSafeEqual(providedToken, tunnelMapping.token)) {
            debug('Invalid token provided for tunnel:', socketId);
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token provided.'
            });
            return;
        }
    }

    debug('Routing to tunnel:', socketId, '->', tunnelMapping.socketId);

    const requestChannel = new RequestChannel(tunnelMapping.socket, {
        method: req.method,
        headers: {
            ...req?.headers,
            host: req?.headers?.host,
            origin: req?.headers?.origin,
            referer: req?.headers?.referer,
            "if-none-match": undefined,
            "if-modified-since": undefined,
            "Cache-Control": "no-store",
        },
        path: req.url,
        body: req.body,
    });

    const timeoutMs = 30000;
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            res.status(504).json({
                error: 'Request timeout',
                message: 'The request timed out'
            });
        }
        requestChannel.destroy();
    }, timeoutMs);

    requestChannel.on("response-header", (statusCode, headers) => {
        res.writeHead(statusCode, headers);
    });

    requestChannel.on("data", (chunk) => {
        const flushed = res.write(chunk);
        if (!flushed) {
            // Backpressure: pause incoming data until drain
            requestChannel.pause();
            res.once('drain', () => {
                requestChannel.resume();
            });
        }
    });

    requestChannel.once("end", () => {
        clearTimeout(timeout);
        res.end();
    });

    requestChannel.on("error", (error) => {
        clearTimeout(timeout);
        console.error("Request channel error:", error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Proxy error',
                message: 'An error occurred while proxying the request'
            });
        }
        requestChannel.destroy();
    });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
    console.log(`ProxyHub server is running on port ${PORT}`);
});
