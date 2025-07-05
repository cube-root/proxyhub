import { Socket } from 'socket.io'
import { EventEmitter } from 'stream'
import { v4 as uuidv4 } from 'uuid'

interface RequestData {
    method: string
    headers: object
    path: string
    body: object
}

interface ResponseHeader {
    statusCode?: number,
    statusMessage?: string,
    headers: object,
    httpVersion: string
}

interface Listeners {
    onResponseHeader: (requestId: string, data: ResponseHeader) => void;
    onResponseChunk: (requestId: string, chunk: any) => void;
    onResponseEnd: (requestId: string) => void;
    onResponseDestroy: (requestId: string) => void;
}

class RequestChannel extends EventEmitter {
    private requestId: string;
    private socket: Socket;
    private _listeners: Listeners | null = null;
    private destroyed = false;

    constructor(socket: Socket, data: RequestData) {
        super();
        this.requestId = uuidv4();
        this.socket = socket;

        // Emit request immediately
        this.socket.emit('tunnel-request', this.requestId, data);
        this.setupListeners();
    }

    private setupListeners() {
        const onResponseHeader = (requestId: string, data: ResponseHeader) => {
            if (requestId === this.requestId && !this.destroyed) {
                this.emit('response-header', data?.statusCode, data?.headers);
            }
        };

        const onResponseChunk = (requestId: string, chunk: any) => {
            if (requestId === this.requestId && !this.destroyed) {
                // Stream chunks directly without accumulating
                this.emit('data', chunk);
            }
        };

        const onResponseEnd = (requestId: string) => {
            if (requestId === this.requestId && !this.destroyed) {
                this.emit('end');
                this.cleanup();
            }
        };

        const onResponseDestroy = (requestId: string) => {
            if (requestId === this.requestId && !this.destroyed) {
                this.emit('destroy');
                this.cleanup();
            }
        };

        // Use .once() for better memory management
        this.socket.on('response-headers', onResponseHeader);
        this.socket.on('response-chunk', onResponseChunk);
        this.socket.once('response-end', onResponseEnd);
        this.socket.once('response-destroy', onResponseDestroy);

        this._listeners = { onResponseHeader, onResponseChunk, onResponseEnd, onResponseDestroy };
    }

    private cleanup() {
        if (this._listeners && !this.destroyed) {
            this.destroyed = true;
            this.socket.off('response-headers', this._listeners.onResponseHeader);
            this.socket.off('response-chunk', this._listeners.onResponseChunk);
            this.socket.off('response-end', this._listeners.onResponseEnd);
            this.socket.off('response-destroy', this._listeners.onResponseDestroy);
            this._listeners = null;
        }
        this.removeAllListeners();
    }

    destroy() {
        if (!this.destroyed) {
            this.cleanup();
            this.socket.emit('client-destroy', this.requestId);
        }
    }
}

export { RequestChannel }