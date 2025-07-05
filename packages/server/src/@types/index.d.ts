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
}