import { Socket } from 'socket.io-client';

interface ResponseHeaderInfo {
    statusCode?: number;
    statusMessage?: string;
    headers: Record<string, string>;
    httpVersion?: string;
}

interface ResponseEmitter {
    sendHeaders: (data: ResponseHeaderInfo) => void;
    sendChunk: (chunk: any) => void;
    sendEnd: () => void;
    sendDestroy: () => void;
}

function createResponseEmitter(socket: Socket, requestId: string): ResponseEmitter {
    return {
        sendHeaders: (data: ResponseHeaderInfo) => {
            socket.emit('response-headers', requestId, data);
        },
        sendChunk: (chunk: any) => {
            socket.emit('response-chunk', requestId, chunk);
        },
        sendEnd: () => {
            socket.emit('response-end', requestId);
        },
        sendDestroy: () => {
            socket.emit('response-destroy', requestId);
        }
    };
}

export { createResponseEmitter, ResponseEmitter };
