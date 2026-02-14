import { Socket } from 'socket.io-client';
import chalk from 'chalk';
import { ResponseChannel } from './tunnel.js';
import {
    updateResponseHeaders as updateDbResponseHeaders,
    completeRequest,
} from './db.js';

export function serveMockResponse(
    socket: Socket,
    requestId: string,
    mock: MockDefinition,
    option: ClientInitializationOptions,
    requestData: TunnelRequestArgument,
    startTime: number,
): void {
    const send = () => {
        const responseChannel = new ResponseChannel(socket, requestId);

        let mockHeaders: Record<string, string>;
        try {
            mockHeaders = JSON.parse(mock.headers);
        } catch {
            mockHeaders = {};
        }

        // Add mock marker header
        mockHeaders['x-proxyhub-mock'] = mock.id;

        responseChannel.sendHeaders({
            statusCode: mock.status_code,
            statusMessage: 'OK',
            headers: mockHeaders,
            httpVersion: '1.1',
        });

        // Log response headers to inspector DB
        if (option.inspect) {
            updateDbResponseHeaders({
                id: requestId,
                status_code: mock.status_code,
                status_message: 'OK',
                response_headers: JSON.stringify(mockHeaders),
                http_version: '1.1',
            });
        }

        // Write body
        const bodyBuffer = mock.body ? Buffer.from(mock.body, 'utf-8') : Buffer.alloc(0);
        if (bodyBuffer.length > 0) {
            responseChannel.write(bodyBuffer);
        }
        responseChannel.end();

        // Complete request in inspector DB
        if (option.inspect) {
            completeRequest({
                id: requestId,
                response_body_size: bodyBuffer.length,
                response_body: mock.body || undefined,
                duration_ms: Date.now() - startTime,
                completed_at: new Date().toISOString(),
            });
        }

        // Console log with [MOCK] prefix
        const statusColor = mock.status_code < 300
            ? chalk.green
            : mock.status_code < 400
                ? chalk.yellow
                : chalk.red;

        console.log(
            chalk.magenta('[MOCK]'),
            chalk.cyan(requestData.method.padEnd(6)),
            chalk.white(requestData.path.padEnd(50)),
            statusColor(mock.status_code.toString()),
        );
    };

    if (mock.delay_ms > 0) {
        setTimeout(send, mock.delay_ms);
    } else {
        send();
    }
}

export function serveNoMockResponse(
    socket: Socket,
    requestId: string,
    option: ClientInitializationOptions,
    requestData: TunnelRequestArgument,
    startTime: number,
): void {
    const responseChannel = new ResponseChannel(socket, requestId);
    const body = JSON.stringify({
        error: 'No mock defined',
        path: requestData.path,
        method: requestData.method,
    });

    const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-proxyhub-mock': 'no-match',
    };

    responseChannel.sendHeaders({
        statusCode: 404,
        statusMessage: 'Not Found',
        headers,
        httpVersion: '1.1',
    });

    if (option.inspect) {
        updateDbResponseHeaders({
            id: requestId,
            status_code: 404,
            status_message: 'Not Found',
            response_headers: JSON.stringify(headers),
            http_version: '1.1',
        });
    }

    const bodyBuffer = Buffer.from(body, 'utf-8');
    responseChannel.write(bodyBuffer);
    responseChannel.end();

    if (option.inspect) {
        completeRequest({
            id: requestId,
            response_body_size: bodyBuffer.length,
            response_body: body,
            duration_ms: Date.now() - startTime,
            completed_at: new Date().toISOString(),
        });
    }

    console.log(
        chalk.magenta('[MOCK]'),
        chalk.cyan(requestData.method.padEnd(6)),
        chalk.white(requestData.path.padEnd(50)),
        chalk.red('404'),
        chalk.gray('(no mock defined)'),
    );
}
