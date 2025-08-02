import { io } from "socket.io-client";
import chalk from "chalk";
import { printInfo, printError, printDebug } from "../utils/index.js";
import * as http from "http";
import ResponseChannel from "./tunnel.js";
import * as crypto from "crypto";

// Global variable to store timeout interval
let timeoutInterval: NodeJS.Timeout | null = null;

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
        minute: '2-digit',
        second: '2-digit'
    });
};

const displayTunnelInfo = (data: any) => {
    const line = '─'.repeat(80);
    console.log(chalk.cyan(line));
    console.log();
    console.log(chalk.green('🫶 ProxyHub tunnel established successfully!'));
    console.log();
    console.log(chalk.cyan(line));
    console.log();
    
    // Format the display similar to ngrok
    const leftPadding = 20;
    const rightPadding = 60;
    
    const formatLine = (label: string, value: string, color: any = chalk.white) => {
        return `${label.padEnd(leftPadding)} ${color(value.padEnd(rightPadding))}`;
    };
    
    console.log(formatLine('Session Status', data.status || 'online', chalk.green));
    console.log(formatLine('Version', data.version || '1.0.0', chalk.white));
    console.log(formatLine('Forwarding', `${data.tunnelUrl || 'N/A'} -> http://localhost:${data.port || 'N/A'}`, chalk.cyan));
    
    // Display timeout information if available
    if (data.timeout) {
        const timeout = data.timeout;
        if (timeout.enabled) {
            const timeoutDisplay = `${timeout.minutes} minutes (enabled)`;
            console.log(formatLine('Session Timeout', timeoutDisplay, chalk.yellow));
            
            // Show actual expiration time
            const expirationTime = formatExpirationTime(timeout.sessionStartTime, timeout.durationMs);
            const expirationDisplay = `🕒 ${expirationTime}`;
            console.log(formatLine('Session Expires', expirationDisplay, chalk.cyan));
            
            // Start top-of-terminal countdown
            startTopCountdown(timeout);
        } else {
            console.log(formatLine('Session Timeout', 'Unlimited session', chalk.green));
        }
    }
    
    console.log();
    console.log(chalk.cyan(line));
    console.log();
};

let lastWarningTime = 0;

const startTopCountdown = (timeoutConfig: any) => {
    // Clear any existing interval
    if (timeoutInterval) {
        clearInterval(timeoutInterval);
    }
    
    // Store original cursor position (if possible)
    const saveCursor = () => process.stdout.write('\u001b[s');
    const restoreCursor = () => process.stdout.write('\u001b[u');
    const moveToTop = () => process.stdout.write('\u001b[1;1H');
    const clearLine = () => process.stdout.write('\u001b[2K');
    
    // Try to use top-of-terminal display, fallback to warnings
    let useTopDisplay = true;
    
    timeoutInterval = setInterval(() => {
        const elapsed = Date.now() - timeoutConfig.sessionStartTime;
        const remaining = timeoutConfig.durationMs - elapsed;
        
        if (remaining <= 0) {
            // Time expired, clear interval
            if (timeoutInterval) {
                clearInterval(timeoutInterval);
                timeoutInterval = null;
            }
            
            if (useTopDisplay) {
                // Clear top line
                moveToTop();
                clearLine();
                restoreCursor();
            }
            
            // Show final expiration message
            console.log(chalk.red.bold('\n🔴 Session expired - Connection will be terminated'));
            return;
        }
        
        const remainingMs = remaining;
        const shouldShowWarning = 
            remainingMs <= 10 * 60 * 1000 && // Less than 10 minutes
            (Date.now() - lastWarningTime) > 60000; // At least 1 minute since last warning
        
        if (useTopDisplay) {
            try {
                // Try top-of-terminal display
                saveCursor();
                moveToTop();
                clearLine();
                
                const expirationTime = formatExpirationTime(timeoutConfig.sessionStartTime, timeoutConfig.durationMs);
                const remainingDisplay = formatTimeRemaining(remaining);
                let color = chalk.cyan;
                let icon = '🕒';
                
                if (remaining < 2 * 60 * 1000) { // Less than 2 minutes
                    color = chalk.red;
                    icon = '🔴';
                } else if (remaining < 5 * 60 * 1000) { // Less than 5 minutes
                    color = chalk.red;
                    icon = '⚠️';
                } else if (remaining < 10 * 60 * 1000) { // Less than 10 minutes
                    color = chalk.yellow;
                    icon = '⚠️';
                }
                
                process.stdout.write(color(`${icon} Session expires at: ${expirationTime} (${remainingDisplay} left)`));
                restoreCursor();
            } catch (error) {
                // Fallback to warning system if top display fails
                useTopDisplay = false;
            }
        }
        
        // Warning system (either as fallback or when time is critical)
        if (!useTopDisplay && shouldShowWarning) {
            showTimeoutWarning(remaining, timeoutConfig);
            lastWarningTime = Date.now();
        }
        
    }, useTopDisplay ? 30000 : 60000); // 30s for top display, 60s for warnings
};

const showTimeoutWarning = (remainingMs: number, timeoutConfig: any) => {
    const remaining = formatTimeRemaining(remainingMs);
    const expirationTime = formatExpirationTime(timeoutConfig.sessionStartTime, timeoutConfig.durationMs);
    
    if (remainingMs <= 60 * 1000) { // 1 minute
        console.log(chalk.red.bold(`\n🔴 Session expires at ${expirationTime} (${remaining} left) - Connection will be terminated soon!`));
    } else if (remainingMs <= 2 * 60 * 1000) { // 2 minutes
        console.log(chalk.red.bold(`\n🔴 Session expires at ${expirationTime} (${remaining} left)`));
    } else if (remainingMs <= 5 * 60 * 1000) { // 5 minutes
        console.log(chalk.red(`\n⚠️  Session expires at ${expirationTime} (${remaining} left)`));
    } else if (remainingMs <= 10 * 60 * 1000) { // 10 minutes
        console.log(chalk.yellow(`\n⚠️  Session expires at ${expirationTime} (${remaining} left)`));
    }
};

/**
 * Generate a stable tunnel ID that persists across reconnections
 * This ID is based on the user's machine and port to ensure consistency
 */
const generateStableTunnelId = (port: number): string => {
    // Create a consistent ID based on machine info and port
    const machineInfo = process.env.USER || process.env.USERNAME || 'unknown';
    const portStr = port.toString();
    const processId = process.pid.toString();
    
    // Create a deterministic hash that's unique for this process and port
    const hash = crypto.createHash('md5')
        .update(`${machineInfo}-${portStr}-${processId}`)
        .digest('hex')
        .substring(0, 12); // Take first 12 characters
    
    return hash;
};

const socketHandler = (option: ClientInitializationOptions) => {
    // Generate a stable tunnel ID for this session
    const stableTunnelId = generateStableTunnelId(option.port);
    
    // Determine the socket URL from environment or use default
    let socketUrl = (
        process?.env?.SOCKET_URL ?? "https://connect.proxyhub.cloud"
    ).replace("http://", "https://");
    
    // If the socket URL is localhost, use HTTP instead of HTTPS
    if (socketUrl.includes("localhost")) {
        socketUrl = "http://localhost:4000";
    }
    
    const socketPath = process?.env?.SOCKET_PATH ?? "/socket.io";
    const clientSecret = crypto.randomBytes(32).toString("hex");
    
    // Create socket connection with proper configuration
    const socket = io(socketUrl, {
        path: socketPath,
        transports: ["websocket"],
        secure: !socketUrl.includes("localhost"),
        rejectUnauthorized: false,
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 500,
        timeout: 10000, // 10 second connection timeout
        autoConnect: true,
        forceNew: true,
        protocols: ["websocket"],
        upgrade: false,
        rememberUpgrade: false,
        auth: {
            clientSecret,
            stableTunnelId, // Send stable tunnel ID to server
        },
    });

    // Handle successful connection
    socket.on("connect", () => {
        if (socket.connected) {
            console.log(chalk.green.bold("🔗 Connected to ProxyHub server successfully"));
            console.log(chalk.cyan(`🔗 Stable Tunnel ID: ${stableTunnelId}`));
            
            // Send stable tunnel ID to server
            socket.emit('register-tunnel', {
                stableTunnelId,
                port: option.port
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

    // Handle connection errors
    socket.on("connect_error", (e) => {
        printError("Failed to connect to ProxyHub server");
        if (option.debug) {
            console.log("Error details:", e && e.message);
            console.log("Error stack:", e && e.stack);
            console.log("Socket state:", {
                connected: socket.connected,
                disconnected: socket.disconnected,
                url: socketUrl,
                path: socketPath,
                transport: socket.io?.engine?.transport?.name,
            });
        }
    });

    // Handle general socket errors
    socket.on("error", (error) => {
        printError("Socket error occurred");
        if (option.debug) {
            printDebug("Socket error", error);
        }
    });

    // Handle timeout events
    socket.on("timeout-triggered", (message) => {
        printError(`Connection timeout: ${message.message}`);
    });

    // Handle connection timeout warning
    socket.on("connection-timeout", (data) => {
        console.log(chalk.yellow.bold("⏰ Connection Timeout Warning"));
        console.log(chalk.yellow(`${data.message}`));
        console.log(chalk.gray(`Your connection has been active for ${data.timeoutMinutes} minutes.`));
        console.log(chalk.gray("The connection will be closed in 5 seconds..."));
        
        if (option.debug) {
            printDebug("Connection timeout", data);
        }
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
        // Clear timeout interval and top display on disconnect
        if (timeoutInterval) {
            clearInterval(timeoutInterval);
            timeoutInterval = null;
        }
        
        // Clear top line if it was being used
        try {
            const moveToTop = () => process.stdout.write('\u001b[1;1H');
            const clearLine = () => process.stdout.write('\u001b[2K');
            const restoreCursor = () => process.stdout.write('\u001b[u');
            
            moveToTop();
            clearLine();
            restoreCursor();
        } catch (error) {
            // Ignore cleanup errors
        }
        
        console.log(chalk.red.bold("🔌 Disconnected from ProxyHub server"), reason);
        if (option.debug) {
            printDebug("Disconnect reason", reason);
        }
    });

    // Handle URL list from server (tunnel info)
    socket.on("url-list", (data) => {
        printInfo(data);
    });

    // Handle tunnel connection info
    socket.on("on-connect-tunnel", (data) => {
        displayTunnelInfo({ ...data, port: option.port });
        if (option.debug) {
            printDebug("Tunnel data", data);
        }
    });

    // Handle tunnel requests from server
    socket.on("tunnel-request", (requestId: string, requestData: TunnelRequestArgument) => {
        const request = {
            ...requestData,
            port: option.port,
            hostname: 'localhost',
        };

        if (option.debug) {
            printDebug("Tunnel request received", {
                requestId,
                method: request.method,
                path: request.path,
                port: request.port
            });
        }

        // Create HTTP request to local server
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
            timeout: 5000, // 5 second timeout for local requests
        });

        // Prepare request body
        const requestBody = 
            typeof request.body === "object" 
                ? JSON.stringify(request.body) 
                : request.body;

        // Handle request timeout
        proxyRequest.on("timeout", () => {
            printError(`Request timeout after 5 seconds`);
            proxyRequest.destroy();
            if (option.debug) {
                printDebug("Request timeout", { timeout: 5, path: request.path });
            }
        });

        // Handle request errors
        proxyRequest.once("error", (error: Error) => {
            printError(`Request failed: ${error.message}`);
            if (option.debug) {
                printDebug("Request error", error);
            }
            proxyRequest.off("response", () => {});
        });

        // Handle successful response
        proxyRequest.once("response", (response: http.IncomingMessage) => {
            proxyRequest.off("error", () => {});
            
            const tunnelResponse = new ResponseChannel(socket, requestId);
            
            // Log the request
            console.log(
                chalk.cyan(requestData.method.padEnd(6)),
                chalk.white(requestData.path.padEnd(50)),
                response.statusCode === 200 
                    ? chalk.green(response.statusCode?.toString()) 
                    : response.statusCode && response.statusCode >= 400
                        ? chalk.red(response.statusCode?.toString())
                        : chalk.yellow(response.statusCode?.toString())
            );

            // Send response headers
            tunnelResponse.setResponseHeaderInfo({
                statusCode: response.statusCode,
                statusMessage: response.statusMessage,
                headers: Object.fromEntries(
                    Object.entries(response.headers).map(([key, value]) => [
                        key,
                        Array.isArray(value) ? value.join(', ') : value || ''
                    ])
                ),
                httpVersion: response.httpVersion,
            });

            // Handle response errors
            response.on("error", (error: Error) => {
                printError(`Response error: ${error.message}`);
                if (option.debug) {
                    printDebug("Response error", error);
                }
            });

            // Pipe response data through tunnel
            response.pipe(tunnelResponse);
        });

        // Write request body if present
        if (requestBody) {
            proxyRequest.write(requestBody);
        }

        // End the request
        proxyRequest.end();
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log(chalk.yellow.bold('\n🛑 Shutting down ProxyHub client...'));
        
        // Clear timeout interval and top display
        if (timeoutInterval) {
            clearInterval(timeoutInterval);
            timeoutInterval = null;
        }
        
        // Clear top line if it was being used
        try {
            const moveToTop = () => process.stdout.write('\u001b[1;1H');
            const clearLine = () => process.stdout.write('\u001b[2K');
            moveToTop();
            clearLine();
        } catch (error) {
            // Ignore cleanup errors
        }
        
        socket.disconnect();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log(chalk.yellow.bold('\n🛑 Shutting down ProxyHub client...'));
        
        // Clear timeout interval and top display
        if (timeoutInterval) {
            clearInterval(timeoutInterval);
            timeoutInterval = null;
        }
        
        // Clear top line if it was being used
        try {
            const moveToTop = () => process.stdout.write('\u001b[1;1H');
            const clearLine = () => process.stdout.write('\u001b[2K');
            moveToTop();
            clearLine();
        } catch (error) {
            // Ignore cleanup errors
        }
        
        socket.disconnect();
        process.exit(0);
    });

    return socket;
};

export default socketHandler; 