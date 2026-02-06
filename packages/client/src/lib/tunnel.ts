import { Socket } from 'socket.io-client';
import { Writable } from 'stream';

interface ResponseHeaderInfo {
    statusCode?: number;
    statusMessage?: string;
    headers: Record<string, string>;
    httpVersion?: string;
}

class ResponseChannel extends Writable {
    private socket: Socket;
    private requestId: string;
    private headersSent: boolean = false;

    constructor(socket: Socket, requestId: string) {
        super();
        this.socket = socket;
        this.requestId = requestId;
    }

    sendHeaders(data: ResponseHeaderInfo): void {
        if (!this.headersSent) {
            this.socket.emit('response-headers', this.requestId, data);
            this.headersSent = true;
        }
    }

    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const flushed = this.socket.emit('response-chunk', this.requestId, chunk);

        // Check if the socket's internal buffer is full
        if (this.socket.io?.engine?.transport?.writable === false) {
            // Wait for drain event before accepting more data
            this.socket.io.engine.once('drain', () => {
                callback();
            });
        } else {
            // Buffer has space, continue immediately
            callback();
        }
    }

    _final(callback: (error?: Error | null) => void): void {
        this.socket.emit('response-end', this.requestId);
        callback();
    }

    _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        this.socket.emit('response-destroy', this.requestId);
        callback(error);
    }
}

export { ResponseChannel };
