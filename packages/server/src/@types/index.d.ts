import { Socket } from "socket.io";

declare global {
    namespace Express {
        interface Request {
            id: string;
        }
    }

    interface TunnelSocketObject {
        id: String,
        socket: Socket
    }

    interface TunnelMapping {
        stableTunnelId: string;
        socketId: string;
        socket: Socket;
        port: number;
        createdAt: Date;
        lastActivity: Date;
    }
}