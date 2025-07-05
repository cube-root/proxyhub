declare global {
    interface ClientInitializationOptions {
        port: number;
        debug?: boolean;
        keepHistory?: boolean;
        webInterface?: boolean;
        webPort?: number;
    }

    interface TunnelRequestArgument {
        method: string;
        headers: Record<string, string>;
        path: string;
        body?: any;
    }

    interface ResponseHeaderInfo {
        statusCode?: number;
        statusMessage?: string;
        headers: Record<string, string>;
        httpVersion?: string;
    }

    interface UrlInfo {
        id: string;
        url: string;
        localPort: number;
        active: boolean;
    }

    interface RequestLogEntry {
        id: string;
        timestamp: number;
        method: string;
        path: string;
        url: string;
        statusCode?: number;
        statusMessage?: string;
        duration?: number;
        requestHeaders: Record<string, string>;
        responseHeaders: Record<string, string>;
        requestBody?: string;
        responseBody?: string;
        error?: string;
    }

    interface LogManager {
        addLog(entry: RequestLogEntry): void;
        getLogs(): RequestLogEntry[];
        clearLogs(): void;
        getLogById(id: string): RequestLogEntry | undefined;
    }
}

export {}; 