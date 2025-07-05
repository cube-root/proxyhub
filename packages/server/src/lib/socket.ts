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
    private version: string;

    constructor(httpServer: http.Server, tunnelSockets: TunnelSocketObject[]) {
        this.tunnelSockets = tunnelSockets;
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

            const tunnelInfo = this.getTunnelInfo(originalId);
            console.log('Generated tunnel info:', tunnelInfo);

            socket.emit('on-connect-tunnel', {
                id: sanitizedId,
                ...tunnelInfo
            });

            socket.on("disconnect", () => {
                console.log("a user disconnected");
                this.onDisconnect({ id: sanitizedId, socket });
            });
        });
    }
}

export default SocketHandler;