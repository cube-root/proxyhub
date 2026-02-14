import { io, Socket } from "socket.io-client";
import chalk from "chalk";
import { printError, printDebug } from "../utils/index.js";
import * as http from "http";
import { ResponseChannel } from "./tunnel.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Transform, TransformCallback } from "stream";
import {
    initDb,
    closeDb,
    clearLogs,
    insertRequest,
    updateResponseHeaders as updateDbResponseHeaders,
    completeRequest,
    updateRequestError,
} from "./db.js";
import { setTunnelUrl } from "./inspector.js";
import { getAllEnabledMocks } from "./mock-db.js";
import { findMockMatch } from "./mock-matcher.js";
import { serveMockResponse, serveNoMockResponse } from "./mock-handler.js";

const MAX_BODY_CAPTURE = 512 * 1024; // 512KB

class ByteCounter extends Transform {
    public byteCount = 0;
    public chunks: Buffer[] = [];

    _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {
        this.byteCount += chunk.length;
        if (this.byteCount <= MAX_BODY_CAPTURE) {
            this.chunks.push(chunk);
        }
        this.push(chunk);
        callback();
    }

    getBody(): string {
        return Buffer.concat(this.chunks).toString('utf-8');
    }
}

// Global state for timeout tracking
let timeoutInterval: NodeJS.Timeout | null = null;
let lastWarningTime = 0;

// Cleanup function - single place for all cleanup logic
const cleanup = (socket: Socket) => {
    if (timeoutInterval) {
        clearInterval(timeoutInterval);
        timeoutInterval = null;
    }
    socket.disconnect();
};

const formatTimeRemaining = (remainingMs: number): string => {
    if (remainingMs <= 0) return '0s';

    const totalSeconds = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
};

const formatExpirationTime = (sessionStartTime: number, durationMs: number): string => {
    const expirationTime = new Date(sessionStartTime + durationMs);
    return expirationTime.toLocaleTimeString('en-US', {
        hour12: true,
        hour: 'numeric',
        minute: '2-digit'
    });
};

const displayTunnelInfo = (data: any) => {
    const line = '─'.repeat(70);
    console.log(chalk.cyan(line));
    console.log(chalk.green('  ProxyHub tunnel established successfully!'));
    console.log(chalk.cyan(line));

    const formatLine = (label: string, value: string, color: any = chalk.white) => {
        return `  ${label.padEnd(18)} ${color(value)}`;
    };

    console.log(formatLine('Status', data.status || 'online', chalk.green));
    console.log(formatLine('Version', data.version || '1.0.0', chalk.white));
    console.log(formatLine('Forwarding', `${data.tunnelUrl || 'N/A'} -> localhost:${data.port || 'N/A'}`, chalk.cyan));

    if (data.tokenProtected) {
        console.log(formatLine('Token Protection', 'Enabled (X-Proxy-Token header required)', chalk.green));
    }

    if (data.inspectPort) {
        console.log(formatLine('Inspector', `http://localhost:${data.inspectPort}`, chalk.magenta));
    }

    if (data.mock && data.inspectPort) {
        console.log(formatLine('Mock Manager', `http://localhost:${data.inspectPort}/mocks`, chalk.magenta));
    }

    if (data.timeout?.enabled) {
        const expirationTime = formatExpirationTime(data.timeout.sessionStartTime, data.timeout.durationMs);
        console.log(formatLine('Session Timeout', `${data.timeout.minutes} min (expires ${expirationTime})`, chalk.yellow));
        startTimeoutWarnings(data.timeout);
    } else {
        console.log(formatLine('Session Timeout', 'Unlimited', chalk.green));
    }

    console.log(chalk.cyan(line));
    console.log('');
};

// Simplified timeout warnings - just periodic console warnings when time is low
const startTimeoutWarnings = (timeoutConfig: any) => {
    if (timeoutInterval) {
        clearInterval(timeoutInterval);
    }

    timeoutInterval = setInterval(() => {
        const elapsed = Date.now() - timeoutConfig.sessionStartTime;
        const remaining = timeoutConfig.durationMs - elapsed;

        if (remaining <= 0) {
            if (timeoutInterval) {
                clearInterval(timeoutInterval);
                timeoutInterval = null;
            }
            console.log(chalk.red.bold('\nSession expired - Connection will be terminated'));
            return;
        }

        // Only show warnings when less than 10 minutes remain, and at most once per minute
        const shouldShowWarning =
            remaining <= 10 * 60 * 1000 &&
            (Date.now() - lastWarningTime) > 60000;

        if (shouldShowWarning) {
            const remainingStr = formatTimeRemaining(remaining);
            const expirationTime = formatExpirationTime(timeoutConfig.sessionStartTime, timeoutConfig.durationMs);

            if (remaining <= 2 * 60 * 1000) {
                console.log(chalk.red.bold(`\nSession expires at ${expirationTime} (${remainingStr} left)`));
            } else if (remaining <= 5 * 60 * 1000) {
                console.log(chalk.red(`\nSession expires at ${expirationTime} (${remainingStr} left)`));
            } else {
                console.log(chalk.yellow(`\nSession expires at ${expirationTime} (${remainingStr} left)`));
            }
            lastWarningTime = Date.now();
        }
    }, 60000); // Check every minute
};

const TUNNEL_IDS_PATH = path.join(os.homedir(), '.proxyhub', 'tunnel-ids.json');

const generateStableTunnelId = (port: number): string => {
    const key = String(port);

    // Try to load existing IDs
    try {
        const data = JSON.parse(fs.readFileSync(TUNNEL_IDS_PATH, 'utf-8'));
        if (data[key] && typeof data[key] === 'string') {
            return data[key];
        }
    } catch {
        // File doesn't exist or is invalid — generate new
    }

    const id = crypto.randomBytes(16).toString('hex');

    // Persist for stability across restarts
    try {
        const dir = path.dirname(TUNNEL_IDS_PATH);
        fs.mkdirSync(dir, { recursive: true });
        let existing: Record<string, string> = {};
        try {
            existing = JSON.parse(fs.readFileSync(TUNNEL_IDS_PATH, 'utf-8'));
        } catch {
            // Fresh file
        }
        existing[key] = id;
        fs.writeFileSync(TUNNEL_IDS_PATH, JSON.stringify(existing, null, 2));
    } catch {
        // Non-fatal — ID still works for this session
    }

    return id;
};

const socketHandler = (option: ClientInitializationOptions) => {
    if (option.inspect || option.mock) {
        initDb();
        if (option.inspect) {
            clearLogs();
        }
    }

    const stableTunnelId = generateStableTunnelId(option.port || 0);

    let socketUrl = (
        process?.env?.PROXYHUB_SOCKET_URL ?? "https://connect.proxyhub.cloud"
    ).replace("http://", "https://");

    if (socketUrl.includes("localhost")) {
        socketUrl = "http://localhost:4000";
    }

    const socketPath = process?.env?.PROXYHUB_SOCKET_PATH ?? "/socket.io";
    const clientSecret = process.env.PROXYHUB_AUTH_KEY || crypto.randomBytes(32).toString("hex");

    const socket = io(socketUrl, {
        path: socketPath,
        transports: ["websocket"],
        secure: !socketUrl.includes("localhost"),
        rejectUnauthorized: !process.env.PROXYHUB_ALLOW_INSECURE,
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 500,
        timeout: 10000,
        autoConnect: true,
        forceNew: true,
        protocols: ["websocket"],
        upgrade: false,
        rememberUpgrade: false,
        auth: {
            clientSecret,
            stableTunnelId,
        },
    });

    socket.on("connect", () => {
        if (socket.connected) {
            console.log(chalk.green.bold("Connected to ProxyHub server"));
            console.log(chalk.gray(`Visit ${chalk.underline('https://proxyhub.app')} for more details`));
            console.log(chalk.cyan(`Tunnel ID: ${stableTunnelId}`));

            socket.emit('register-tunnel', {
                stableTunnelId,
                port: option.port || 0,
                token: option.token
            });

            if (option.debug) {
                printDebug("Socket connected", {
                    id: socket.id,
                    stableTunnelId,
                    url: socketUrl,
                    path: socketPath
                });
            }
        }
    });

    socket.on("connect_error", (e) => {
        printError("Failed to connect to ProxyHub server");
        if (option.debug) {
            console.log("Error details:", e?.message);
            console.log("Socket state:", {
                connected: socket.connected,
                url: socketUrl,
                path: socketPath,
            });
        }
    });

    socket.on("error", (error) => {
        printError("Socket error occurred");
        if (option.debug) {
            printDebug("Socket error", error);
        }
    });

    socket.on("connection-timeout", (data) => {
        console.log(chalk.yellow.bold("\nConnection Timeout Warning"));
        console.log(chalk.yellow(data.message));
        console.log(chalk.gray("Connection will be closed in 5 seconds..."));

        if (option.debug) {
            printDebug("Connection timeout", data);
        }
    });

    socket.on("disconnect", (reason) => {
        if (timeoutInterval) {
            clearInterval(timeoutInterval);
            timeoutInterval = null;
        }

        console.log(chalk.red.bold("Disconnected from ProxyHub server"), reason);
        if (option.debug) {
            printDebug("Disconnect reason", reason);
        }
    });

    socket.on("on-connect-tunnel", (data) => {
        const inspectPort = option.inspect ? (option.inspectPort || (option.port ? option.port + 1000 : 3001)) : undefined;
        displayTunnelInfo({ ...data, port: option.port, inspectPort, mock: option.mock });
        if (data.tunnelUrl && option.inspect) {
            setTunnelUrl(data.tunnelUrl);
        }
        if (option.debug) {
            printDebug("Tunnel data", data);
        }
    });

    socket.on("tunnel-request", (requestId: string, requestData: TunnelRequestArgument) => {
        const request = {
            ...requestData,
            port: option.port || 0,
            hostname: 'localhost',
        };

        const startTime = Date.now();

        if (option.debug) {
            printDebug("Tunnel request received", {
                requestId,
                method: request.method,
                path: request.path,
                port: request.port
            });
        }

        // Log request to inspector DB
        if (option.inspect) {
            const requestBody =
                typeof request.body === "object"
                    ? JSON.stringify(request.body)
                    : request.body;
            insertRequest({
                id: requestId,
                method: request.method,
                path: request.path,
                headers: JSON.stringify(request.headers),
                body: requestBody || undefined,
                client_ip: requestData.clientIp || undefined,
                created_at: new Date().toISOString(),
            });
        }

        // Mock interception
        if (option.mock) {
            const enabledMocks = getAllEnabledMocks();
            const match = findMockMatch(enabledMocks, request.method, request.path);

            if (match) {
                serveMockResponse(socket, requestId, match, option, requestData, startTime);
                return;
            }

            // No match and no port — return 404
            if (!option.port) {
                serveNoMockResponse(socket, requestId, option, requestData, startTime);
                return;
            }

            // No match but port exists — fall through to normal proxy
        }

        const proxyRequest = http.request({
            hostname: request.hostname,
            port: request.port,
            method: request.method,
            path: request.path,
            headers: request.headers,
            agent: new http.Agent({
                keepAlive: true,
                keepAliveMsecs: 1000,
                maxSockets: 100,
            }),
            timeout: 5000,
        });

        const requestBody =
            typeof request.body === "object"
                ? JSON.stringify(request.body)
                : request.body;

        proxyRequest.on("timeout", () => {
            printError("Request timeout after 5 seconds");
            proxyRequest.destroy();
            if (option.inspect) {
                updateRequestError({
                    id: requestId,
                    error: 'Request timeout after 5 seconds',
                });
            }
            if (option.debug) {
                printDebug("Request timeout", { path: request.path });
            }
        });

        proxyRequest.once("error", (error: Error) => {
            printError(`Request failed: ${error.message}`);
            if (option.inspect) {
                updateRequestError({
                    id: requestId,
                    error: error.message,
                });
            }
            if (option.debug) {
                printDebug("Request error", error);
            }
        });

        proxyRequest.once("response", (response: http.IncomingMessage) => {
            const responseChannel = new ResponseChannel(socket, requestId);

            // Log the request
            const statusColor = response.statusCode === 200
                ? chalk.green
                : (response.statusCode && response.statusCode >= 400)
                    ? chalk.red
                    : chalk.yellow;

            console.log(
                chalk.cyan(requestData.method.padEnd(6)),
                chalk.white(requestData.path.padEnd(50)),
                statusColor(response.statusCode?.toString() || '')
            );

            const responseHeaders = Object.fromEntries(
                Object.entries(response.headers).map(([key, value]) => [
                    key,
                    Array.isArray(value) ? value.join(', ') : value || ''
                ])
            );

            responseChannel.sendHeaders({
                statusCode: response.statusCode,
                statusMessage: response.statusMessage,
                headers: responseHeaders,
                httpVersion: response.httpVersion,
            });

            // Log response headers to inspector DB
            if (option.inspect) {
                updateDbResponseHeaders({
                    id: requestId,
                    status_code: response.statusCode,
                    status_message: response.statusMessage,
                    response_headers: JSON.stringify(responseHeaders),
                    http_version: response.httpVersion,
                });
            }

            if (option.inspect) {
                // Use ByteCounter to capture response body for inspector
                const byteCounter = new ByteCounter();
                response.pipe(byteCounter).pipe(responseChannel);

                byteCounter.on('end', () => {
                    completeRequest({
                        id: requestId,
                        response_body_size: byteCounter.byteCount,
                        response_body: byteCounter.getBody(),
                        duration_ms: Date.now() - startTime,
                        completed_at: new Date().toISOString(),
                    });
                });
            } else {
                // Use pipe for automatic backpressure handling
                response.pipe(responseChannel);
            }

            response.on("error", (error: Error) => {
                printError(`Response error: ${error.message}`);
                responseChannel.destroy(error);
                if (option.inspect) {
                    updateRequestError({
                        id: requestId,
                        error: error.message,
                    });
                }
                if (option.debug) {
                    printDebug("Response error", error);
                }
            });
        });

        if (requestBody) {
            proxyRequest.write(requestBody);
        }

        proxyRequest.end();
    });

    // Graceful shutdown handlers
    const handleShutdown = () => {
        console.log(chalk.yellow.bold('\nShutting down ProxyHub client...'));
        if (option.inspect || option.mock) {
            closeDb();
        }
        cleanup(socket);
        process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    return socket;
};

export default socketHandler;
