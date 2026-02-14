import { Socket } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
import { EventEmitter } from 'stream'

interface RequestData {
    method: string
    headers: object
    path: string
    body: object
}

interface TunnelRequestHandlers {
    onHeaders: (statusCode: number, headers: object) => void
    onData: (chunk: any) => void
    onEnd: () => void
    onError?: (err: Error) => void
}

interface TunnelRequest {
    requestId: string
    destroy: () => void
}

function createTunnelRequest(
    socket: Socket,
    data: RequestData,
    handlers: TunnelRequestHandlers
): TunnelRequest {
    const requestId = uuidv4()
    let destroyed = false

    const onResponseHeader = (reqId: string, responseData: any) => {
        if (reqId === requestId && !destroyed) {
            handlers.onHeaders(responseData?.statusCode, responseData?.headers)
        }
    }

    const onResponseChunk = (reqId: string, chunk: any) => {
        if (reqId === requestId && !destroyed) {
            handlers.onData(chunk)
        }
    }

    const onResponseEnd = (reqId: string) => {
        if (reqId === requestId && !destroyed) {
            handlers.onEnd()
            cleanup()
        }
    }

    const onResponseDestroy = (reqId: string) => {
        if (reqId === requestId && !destroyed) {
            cleanup()
        }
    }

    const cleanup = () => {
        if (destroyed) return
        destroyed = true
        socket.off('response-headers', onResponseHeader)
        socket.off('response-chunk', onResponseChunk)
        socket.off('response-end', onResponseEnd)
        socket.off('response-destroy', onResponseDestroy)
    }

    // Set up listeners
    socket.on('response-headers', onResponseHeader)
    socket.on('response-chunk', onResponseChunk)
    socket.on('response-end', onResponseEnd)
    socket.on('response-destroy', onResponseDestroy)

    // Emit the request
    socket.emit('tunnel-request', requestId, data)

    return {
        requestId,
        destroy: () => {
            if (!destroyed) {
                cleanup()
                socket.emit('client-destroy', requestId)
            }
        }
    }
}

// RequestChannel with pause/resume support for backpressure handling
class RequestChannel extends EventEmitter {
    private tunnelRequest: TunnelRequest
    private paused: boolean = false
    private buffer: any[] = []

    constructor(socket: Socket, data: RequestData) {
        super()
        this.tunnelRequest = createTunnelRequest(socket, data, {
            onHeaders: (statusCode, headers) => {
                this.emit('response-header', statusCode, headers)
            },
            onData: (chunk) => {
                if (this.paused) {
                    this.buffer.push(chunk)
                } else {
                    this.emit('data', chunk)
                }
            },
            onEnd: () => {
                this.emit('end')
            },
            onError: (err) => {
                this.emit('error', err)
            }
        })
    }

    pause(): void {
        this.paused = true
    }

    resume(): void {
        this.paused = false
        // Flush buffered chunks
        while (this.buffer.length > 0 && !this.paused) {
            const chunk = this.buffer.shift()
            this.emit('data', chunk)
        }
    }

    destroy() {
        this.tunnelRequest.destroy()
        this.buffer = []
        this.removeAllListeners()
    }
}

export { createTunnelRequest, RequestChannel }
