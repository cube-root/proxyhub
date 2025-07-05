import { io } from "socket.io-client";
import chalk from "chalk";
import { printInfo, printError, printDebug } from "../utils/index.js";
import * as http from "http";
import ResponseChannel from "./tunnel.js";
import * as crypto from "crypto";

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
    console.log();
    console.log(formatLine('Connections', 'ttl     opn     rt1     rt5     p50     p90', chalk.white));
    console.log(formatLine('', '0       0       0.00    0.00    0.00    0.00', chalk.white));
    console.log();
    console.log(chalk.cyan(line));
    console.log();
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
        timeout: 10000,
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

    // Handle disconnection
    socket.on("disconnect", (reason) => {
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
            timeout: 5000,
        });

        // Prepare request body
        const requestBody = 
            typeof request.body === "object" 
                ? JSON.stringify(request.body) 
                : request.body;

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
        socket.disconnect();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log(chalk.yellow.bold('\n🛑 Shutting down ProxyHub client...'));
        socket.disconnect();
        process.exit(0);
    });

    return socket;
};

export default socketHandler; 