declare global {
    interface ClientInitializationOptions {
        port: number;
        debug?: boolean;
        token?: string;
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

}

export {}; 