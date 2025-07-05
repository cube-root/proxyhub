import { io } from "socket.io-client";
import chalk from "chalk";
import { printInfo, printError, printDebug } from "../utils/index.js";
import * as http from "http";
import ResponseChannel from "./tunnel.js";
import * as crypto from "crypto";
import RequestLogManager from "./log-manager.js";
import WebServer from "./web-server.js";

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

const socketHandler = (option: ClientInitializationOptions) => {
    // Initialize logging system
    const logManager = new RequestLogManager();
    let webServer: WebServer | null = null;
    
    // Initialize web server if enabled
    if (option.webInterface) {
        webServer = new WebServer(logManager, option.webPort || 4001);
        webServer.start().catch((err) => {
            printError(`Failed to start web interface: ${err.message}`);
        });
        
        // Add a test log entry to verify the system is working
        if (option.debug) {
            const testLog: RequestLogEntry = {
                id: 'test-' + Date.now(),
                timestamp: Date.now(),
                method: 'GET',
                path: '/test',
                url: 'http://localhost:3000/test',
                statusCode: 200,
                statusMessage: 'OK',
                duration: 123,
                requestHeaders: { 'User-Agent': 'ProxyHub Test' },
                responseHeaders: { 'Content-Type': 'application/json' },
                requestBody: '',
                responseBody: '{"message": "Test log entry"}',
            };
            
            setTimeout(() => {
                logManager.addLog(testLog);
                if (webServer) {
                    webServer.broadcastNewLog(testLog);
                }
            }, 1000);
        }
    }
    
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
        },
    });

    // Handle successful connection
    socket.on("connect", () => {
        if (socket.connected) {
            console.log(chalk.green.bold("🔗 Connected to ProxyHub server successfully"));
            if (option.debug) {
                printDebug("Socket connected", {
                    id: socket.id,
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

        // Create log entry
        const startTime = Date.now();
        const logEntry: RequestLogEntry = {
            id: requestId,
            timestamp: startTime,
            method: request.method,
            path: request.path,
            url: `http://${request.hostname}:${request.port}${request.path}`,
            requestHeaders: request.headers,
            responseHeaders: {},
            requestBody: typeof request.body === "object" ? JSON.stringify(request.body) : request.body,
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
            
            // Update log entry with error
            logEntry.error = error.message;
            logEntry.duration = Date.now() - startTime;
            logManager.addLog(logEntry);
            
            if (webServer) {
                webServer.broadcastNewLog(logEntry);
            }
            
            proxyRequest.off("response", () => {});
        });

        // Handle successful response
        proxyRequest.once("response", (response: http.IncomingMessage) => {
            proxyRequest.off("error", () => {});
            
            const tunnelResponse = new ResponseChannel(socket, requestId);
            
            // Update log entry with response info
            logEntry.statusCode = response.statusCode;
            logEntry.statusMessage = response.statusMessage;
            logEntry.duration = Date.now() - startTime;
            logEntry.responseHeaders = Object.fromEntries(
                Object.entries(response.headers).map(([key, value]) => [
                    key,
                    Array.isArray(value) ? value.join(', ') : value || ''
                ])
            );
            
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

            // Collect response body and pipe to tunnel
            let responseBody = '';
            let chunks: Buffer[] = [];
            
            response.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
                responseBody += chunk.toString();
                tunnelResponse.write(chunk);
            });

            response.on('end', () => {
                // Update log entry with response body
                logEntry.responseBody = responseBody;
                logManager.addLog(logEntry);
                
                if (option.debug) {
                    printDebug("Log added", {
                        id: logEntry.id,
                        method: logEntry.method,
                        path: logEntry.path,
                        statusCode: logEntry.statusCode,
                        logCount: logManager.getLogCount()
                    });
                }
                
                if (webServer) {
                    webServer.broadcastNewLog(logEntry);
                    if (option.debug) {
                        printDebug("Log broadcasted to web interface", { id: logEntry.id });
                    }
                }
                
                // End the tunnel response
                tunnelResponse.end();
            });

            // Handle response errors
            response.on("error", (error: Error) => {
                printError(`Response error: ${error.message}`);
                if (option.debug) {
                    printDebug("Response error", error);
                }
                
                // Update log entry with error
                logEntry.error = error.message;
                logManager.addLog(logEntry);
                
                if (webServer) {
                    webServer.broadcastNewLog(logEntry);
                }
                
                // Destroy the tunnel response
                tunnelResponse.destroy();
            });
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
        if (webServer) {
            webServer.stop();
        }
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log(chalk.yellow.bold('\n🛑 Shutting down ProxyHub client...'));
        socket.disconnect();
        if (webServer) {
            webServer.stop();
        }
        process.exit(0);
    });

    return socket;
};

export default socketHandler; 