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
    private version: string;

    constructor(httpServer: http.Server, tunnelSockets: TunnelSocketObject[]) {
        this.tunnelSockets = tunnelSockets;
        this.tunnelMappings = new Map();
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
    }
    
    private onDisconnect(tunnelSocket: TunnelSocketObject) {
        this.tunnelSockets = this.tunnelSockets.filter(socket => socket.id !== tunnelSocket.id);
        console.log('Removed socket from list:', tunnelSocket.id);
        console.log('Total active sockets:', this.tunnelSockets.length);
        
        // Remove from tunnel mappings
        this.removeSocketFromTunnelMappings(tunnelSocket.socket.id);
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
                
                // Register the tunnel mapping
                this.registerTunnel(data.stableTunnelId, socket, data.port);
                
                // Generate tunnel info using the stable tunnel ID
                const tunnelInfo = this.getTunnelInfo(data.stableTunnelId);
                console.log('Generated tunnel info:', tunnelInfo);

                socket.emit('on-connect-tunnel', {
                    id: data.stableTunnelId,
                    ...tunnelInfo
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