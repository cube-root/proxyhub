import { Socket } from 'socket.io-client';
import { Writable } from 'stream';

class ResponseChannel extends Writable {
    private socket: Socket;
    private id: string;

    constructor(socket: Socket, id: string) {
        super();
        this.socket = socket;
        this.id = id;
    }

    _write(chunk: any, encoding: string, next: Function) {
        // Send the chunk to the server
        this.socket.emit('response-chunk', this.id, chunk);
        
        // Wait for the socket to be ready before continuing
        this.socket.io.engine.once('drain', () => {
            next();
        });
    }

    _final(next: Function) {
        // Signal that the response is complete
        this.socket.emit('response-end', this.id);
        
        // Wait for the socket to be ready before continuing
        this.socket.io.engine.once('drain', () => {
            next();
        });
    }

    _destroy(error: Error, next: Function) {
        // Signal that the response stream was destroyed
        this.socket.emit('response-destroy', this.id);
        
        // Wait for the socket to be ready before continuing
        this.socket.io.engine.once('drain', () => {
            next();
        });
    }

    /**
     * Send response header information to the server
     * @param data - Response header information
     */
    setResponseHeaderInfo(data: ResponseHeaderInfo) {
        this.socket.emit('response-headers', this.id, data);
    }
}

export default ResponseChannel; 