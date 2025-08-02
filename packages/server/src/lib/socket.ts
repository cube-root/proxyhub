/// <reference path="../@types/index.d.ts" />
import { Server } from "socket.io";
import http from 'http';
import os from 'os';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

class SocketHandler {
    private io: Server;
    private tunnelSockets: TunnelSocketObject[];
    private tunnelMappings: Map<string, TunnelMapping>; // stable tunnel ID -> socket mapping
    private connectionTimeouts: Map<string, NodeJS.Timeout>; // socket ID -> timeout
    private version: string;

    constructor(httpServer: http.Server, tunnelSockets: TunnelSocketObject[]) {
        this.tunnelSockets = tunnelSockets;
        this.tunnelMappings = new Map();
        this.connectionTimeouts = new Map();
        this.io = new Server(httpServer,
            {
                path: process?.env?.SOCKET_PATH ?? "/socket.io",
                cors: {
                    origin: "*",
                    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
                },
            }
        );
        
        // Load version from package.json
        try {
            const packageJsonPath = path.join(__dirname, '../../package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            this.version = packageJson.version;
        } catch (error) {
            console.warn('Could not read package.json version:', error);
            this.version = '1.0.0';
        }
    }

    private sanitizeSocketId(socketId: string): string {
        // Remove any non-alphanumeric characters and convert to lowercase
        // This ensures the socket ID is safe to use as a subdomain
        return socketId.replace(/[^a-z0-9]/gi, '').toLowerCase();
    }

    private generateTunnelUrl(socketId: string): string {
        const sanitizedId = this.sanitizeSocketId(socketId);
        const baseDomain = process.env.BASE_DOMAIN || 'proxyhub.cloud';
        const protocol = process.env.PROTOCOL || 'https';
        
        // Validate that we have a valid sanitized ID
        if (!sanitizedId || sanitizedId.length === 0) {
            throw new Error('Invalid socket ID for tunnel URL generation');
        }
        
        // Create subdomain format: socketId.proxyhub.cloud
        return `${protocol}://${sanitizedId}.${baseDomain}`;
    }

    private getTunnelInfo(socketId: string) {
        const hostname = os.hostname();
        
        try {
            const tunnelUrl = this.generateTunnelUrl(socketId);
            const sanitizedId = this.sanitizeSocketId(socketId);
            
            return {
                hostname,
                tunnelUrl,
                socketId: sanitizedId,
                status: 'online',
                version: this.version
            };
        } catch (error) {
            console.error('Error generating tunnel info:', error);
            return {
                hostname,
                tunnelUrl: 'Error generating URL',
                socketId: 'invalid',
                status: 'error',
                version: this.version
            };
        }
    }

    private onConnect(tunnelSocket: TunnelSocketObject) {
        this.tunnelSockets.push(tunnelSocket);
        console.log('Added socket to list:', tunnelSocket.id);
        console.log('Total active sockets:', this.tunnelSockets.length);
        
        // Set 30-minute timeout for connection
        this.setConnectionTimeout(tunnelSocket.socket);
    }
    
    private onDisconnect(tunnelSocket: TunnelSocketObject) {
        this.tunnelSockets = this.tunnelSockets.filter(socket => socket.id !== tunnelSocket.id);
        console.log('Removed socket from list:', tunnelSocket.id);
        console.log('Total active sockets:', this.tunnelSockets.length);
        
        // Remove from tunnel mappings
        this.removeSocketFromTunnelMappings(tunnelSocket.socket.id);
        
        // Clear connection timeout
        this.clearConnectionTimeout(tunnelSocket.socket.id);
    }
    
    private setConnectionTimeout(socket: any) {
        // Clear any existing timeout for this socket
        this.clearConnectionTimeout(socket.id);
        
        // Get timeout duration from environment variable (in minutes), default to 30 minutes
        const timeoutMinutes = parseInt(process.env.CONNECTION_TIMEOUT_MINUTES || '30', 10);
        
        // If timeout is 0 or negative, disable timeout
        if (timeoutMinutes <= 0) {
            console.log(`Timeout disabled for socket ${socket.id} (CONNECTION_TIMEOUT_MINUTES=${timeoutMinutes})`);
            return;
        }
        
        const timeoutDuration = timeoutMinutes * 60 * 1000; // Convert minutes to milliseconds
        
        const timeout = setTimeout(() => {
            console.log(`Connection timeout reached for socket ${socket.id} after ${timeoutMinutes} minutes, disconnecting...`);
            
            // Check if socket is still connected before emitting
            if (socket.connected) {
                socket.emit('connection-timeout', {
                    message: `Connection has been active for ${timeoutMinutes} minutes and will be disconnected.`,
                    timeoutMinutes: timeoutMinutes
                });
                
                // Give client 5 seconds to handle the timeout message, then disconnect
                setTimeout(() => {
                    if (socket.connected) {
                        console.log(`Forcefully disconnecting socket ${socket.id} after timeout`);
                        socket.disconnect(true);
                    }
                }, 5000);
            } else {
                console.log(`Socket ${socket.id} already disconnected, skipping timeout disconnect`);
            }
            
            // Clean up the timeout reference
            this.connectionTimeouts.delete(socket.id);
        }, timeoutDuration);
        
        this.connectionTimeouts.set(socket.id, timeout);
        console.log(`Set ${timeoutMinutes}-minute timeout for socket ${socket.id} (timeout in ${timeoutDuration}ms)`);
    }
    
    private clearConnectionTimeout(socketId: string) {
        const timeout = this.connectionTimeouts.get(socketId);
        if (timeout) {
            clearTimeout(timeout);
            this.connectionTimeouts.delete(socketId);
            console.log(`Cleared timeout for socket ${socketId}`);
        }
    }
    
    private registerTunnel(stableTunnelId: string, socket: any, port: number) {
        const mapping: TunnelMapping = {
            stableTunnelId,
            socketId: socket.id,
            socket,
            port,
            createdAt: new Date(),
            lastActivity: new Date()
        };
        
        this.tunnelMappings.set(stableTunnelId, mapping);
        console.log('Registered tunnel mapping:', stableTunnelId, '->', socket.id);
        console.log('Total tunnel mappings:', this.tunnelMappings.size);
    }
    
    private removeSocketFromTunnelMappings(socketId: string) {
        // Find and remove all mappings for this socket
        const toRemove: string[] = [];
        this.tunnelMappings.forEach((mapping, stableTunnelId) => {
            if (mapping.socketId === socketId) {
                toRemove.push(stableTunnelId);
            }
        });
        
        toRemove.forEach(stableTunnelId => {
            this.tunnelMappings.delete(stableTunnelId);
            console.log('Removed tunnel mapping:', stableTunnelId);
        });
    }
    
    public getTunnelByStableId(stableTunnelId: string): TunnelMapping | undefined {
        const mapping = this.tunnelMappings.get(stableTunnelId);
        if (mapping) {
            // Update last activity
            mapping.lastActivity = new Date();
        }
        return mapping;
    }
    
    public getAllTunnelMappings(): TunnelMapping[] {
        return Array.from(this.tunnelMappings.values());
    }
    
    public getConnectionTimeouts(): Map<string, NodeJS.Timeout> {
        return this.connectionTimeouts;
    }
    
    start() {
        this.io.on("connection", (socket) => {
            console.log("socket connected", socket.id);
            
            // Use sanitized socket ID consistently throughout
            const originalId = socket.id?.toLowerCase();
            const sanitizedId = this.sanitizeSocketId(originalId);
            
            console.log('Original socket ID:', originalId);
            console.log('Sanitized socket ID:', sanitizedId);
            
            this.onConnect({ id: sanitizedId, socket });

            // Handle tunnel registration from client
            socket.on('register-tunnel', (data: { stableTunnelId: string, port: number }) => {
                console.log('Registering tunnel:', data.stableTunnelId, 'for socket:', socket.id);
                
                // Register the tunnel matunnelUrlpping
                this.registerTunnel(data.stableTunnelId, socket, data.port);
                
                // Generate tunnel info using the stable tunnel ID
                const tunnelInfo = this.getTunnelInfo(data.stableTunnelId);
                console.log('Generated tunnel info:', tunnelInfo);

                // Get timeout configuration for client display
                const timeoutMinutes = parseInt(process.env.CONNECTION_TIMEOUT_MINUTES || '30', 10);
                const timeoutEnabled = timeoutMinutes > 0;
                const sessionStartTime = Date.now();

                socket.emit('on-connect-tunnel', {
                    id: data.stableTunnelId,
                    ...tunnelInfo,
                    timeout: {
                        minutes: timeoutMinutes,
                        enabled: timeoutEnabled,
                        sessionStartTime: sessionStartTime,
                        durationMs: timeoutEnabled ? timeoutMinutes * 60 * 1000 : 0
                    }
                });
            });

            socket.on("disconnect", () => {
                console.log("a user disconnected");
                this.onDisconnect({ id: sanitizedId, socket });
            });
        });
    }
}

export default SocketHandler;