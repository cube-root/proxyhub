/// <reference path="../@types/index.d.ts" />
import { Server } from "socket.io";
import http from 'http';
import https from 'https';
import os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { debug } from '../utils/debug';

// Cached latest client version from npm
let cachedLatestVersion: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function fetchLatestClientVersion(): void {
    const url = 'https://registry.npmjs.org/proxyhub/latest';
    https.get(url, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                if (parsed.version) {
                    cachedLatestVersion = parsed.version;
                    cacheTimestamp = Date.now();
                    debug('Fetched latest client version from npm:', cachedLatestVersion);
                }
            } catch {
                debug('Failed to parse npm registry response');
            }
        });
    }).on('error', () => {
        debug('Failed to fetch latest client version from npm');
    });
}

function getLatestClientVersion(): string | null {
    if (!cachedLatestVersion || Date.now() - cacheTimestamp > CACHE_TTL) {
        fetchLatestClientVersion();
    }
    return cachedLatestVersion;
}

function isOutdated(clientVersion: string, latestVersion: string): boolean {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
    const c = parse(clientVersion);
    const l = parse(latestVersion);
    for (let i = 0; i < 3; i++) {
        if ((c[i] || 0) < (l[i] || 0)) return true;
        if ((c[i] || 0) > (l[i] || 0)) return false;
    }
    return false;
}

class SocketHandler {
    private io: Server;
    private tunnelMappings: Map<string, TunnelMapping>;
    private connectionTimeouts: Map<string, NodeJS.Timeout>;
    private version: string;

    constructor(httpServer: http.Server) {
        this.tunnelMappings = new Map();
        this.connectionTimeouts = new Map();
        this.io = new Server(httpServer, {
            path: process?.env?.SOCKET_PATH ?? "/socket.io",
            cors: {
                origin: "*",
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            },
        });

        // Load version from package.json
        try {
            const packageJsonPath = path.join(__dirname, '../../package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            this.version = packageJson.version;
        } catch (error) {
            console.warn('Could not read package.json version:', error);
            this.version = '1.0.0';
        }

        // Pre-fetch latest client version from npm
        fetchLatestClientVersion();
    }

    private sanitizeSocketId(socketId: string): string {
        return socketId.replace(/[^a-z0-9]/gi, '').toLowerCase();
    }

    private generateTunnelUrl(socketId: string): string {
        const sanitizedId = this.sanitizeSocketId(socketId);
        const baseDomain = process.env.BASE_DOMAIN || 'proxyhub.cloud';
        const protocol = process.env.PROTOCOL || 'https';

        if (!sanitizedId || sanitizedId.length === 0) {
            throw new Error('Invalid socket ID for tunnel URL generation');
        }

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

    private setConnectionTimeout(socket: any) {
        this.clearConnectionTimeout(socket.id);

        const timeoutMinutes = parseInt(process.env.CONNECTION_TIMEOUT_MINUTES || '30', 10);

        if (timeoutMinutes <= 0) {
            debug(`Timeout disabled for socket ${socket.id}`);
            return;
        }

        const timeoutDuration = timeoutMinutes * 60 * 1000;

        const timeout = setTimeout(() => {
            console.log(`Connection timeout for socket ${socket.id} after ${timeoutMinutes} minutes`);

            if (socket.connected) {
                socket.emit('connection-timeout', {
                    message: `Connection has been active for ${timeoutMinutes} minutes and will be disconnected.`,
                    timeoutMinutes: timeoutMinutes
                });

                setTimeout(() => {
                    if (socket.connected) {
                        debug(`Forcefully disconnecting socket ${socket.id}`);
                        socket.disconnect(true);
                    }
                }, 5000);
            }

            this.connectionTimeouts.delete(socket.id);
        }, timeoutDuration);

        this.connectionTimeouts.set(socket.id, timeout);
        debug(`Set ${timeoutMinutes}-minute timeout for socket ${socket.id}`);
    }

    private clearConnectionTimeout(socketId: string) {
        const timeout = this.connectionTimeouts.get(socketId);
        if (timeout) {
            clearTimeout(timeout);
            this.connectionTimeouts.delete(socketId);
            debug(`Cleared timeout for socket ${socketId}`);
        }
    }

    private registerTunnel(stableTunnelId: string, socket: any, port: number, token?: string) {
        // Allow many concurrent request listeners per tunnel socket
        socket.setMaxListeners(0);

        const mapping: TunnelMapping = {
            stableTunnelId,
            socketId: socket.id,
            socket,
            port,
            createdAt: new Date(),
            lastActivity: new Date(),
            token: token || null
        };

        this.tunnelMappings.set(stableTunnelId, mapping);
        console.log('Tunnel registered:', stableTunnelId, token ? '(token protected)' : '');
        debug('Total tunnel mappings:', this.tunnelMappings.size);
    }

    private removeSocketFromTunnelMappings(socketId: string) {
        const toRemove: string[] = [];
        this.tunnelMappings.forEach((mapping, stableTunnelId) => {
            if (mapping.socketId === socketId) {
                toRemove.push(stableTunnelId);
            }
        });

        toRemove.forEach(stableTunnelId => {
            this.tunnelMappings.delete(stableTunnelId);
            debug('Removed tunnel mapping:', stableTunnelId);
        });
    }

    public getVersion(): string {
        return this.version;
    }

    public getTunnelByStableId(stableTunnelId: string): TunnelMapping | undefined {
        const mapping = this.tunnelMappings.get(stableTunnelId);
        if (mapping) {
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
            console.log("Socket connected:", socket.id);
            this.setConnectionTimeout(socket);

            socket.on('register-tunnel', (data: { stableTunnelId: string, port: number, token?: string, version?: string }) => {
                debug('Registering tunnel:', data.stableTunnelId, 'for socket:', socket.id, 'client version:', data.version || 'unknown');

                this.registerTunnel(data.stableTunnelId, socket, data.port, data.token);

                const tunnelInfo = this.getTunnelInfo(data.stableTunnelId);
                debug('Generated tunnel info:', tunnelInfo);

                const timeoutMinutes = parseInt(process.env.CONNECTION_TIMEOUT_MINUTES || '30', 10);
                const timeoutEnabled = timeoutMinutes > 0;
                const sessionStartTime = Date.now();

                // Check if client needs an update
                let updateAvailable: { latest: string } | undefined;
                const latestVersion = getLatestClientVersion();
                if (data.version && latestVersion && isOutdated(data.version, latestVersion)) {
                    updateAvailable = { latest: latestVersion };
                }

                socket.emit('on-connect-tunnel', {
                    id: data.stableTunnelId,
                    ...tunnelInfo,
                    tokenProtected: !!data.token,
                    updateAvailable,
                    timeout: {
                        minutes: timeoutMinutes,
                        enabled: timeoutEnabled,
                        sessionStartTime: sessionStartTime,
                        durationMs: timeoutEnabled ? timeoutMinutes * 60 * 1000 : 0
                    }
                });
            });

            socket.on("disconnect", () => {
                console.log("Socket disconnected:", socket.id);
                this.removeSocketFromTunnelMappings(socket.id);
                this.clearConnectionTimeout(socket.id);
            });
        });
    }
}

export default SocketHandler;
