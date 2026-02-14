declare global {
    interface ClientInitializationOptions {
        port?: number;
        debug?: boolean;
        token?: string;
        inspect?: boolean;
        inspectPort?: number;
        mock?: boolean;
    }

    interface TunnelRequestArgument {
        method: string;
        headers: Record<string, string>;
        path: string;
        body?: any;
        clientIp?: string;
    }

    interface ResponseHeaderInfo {
        statusCode?: number;
        statusMessage?: string;
        headers: Record<string, string>;
        httpVersion?: string;
    }

    interface RequestLogInsert {
        id: string;
        method: string;
        path: string;
        headers: string;
        body?: string;
        client_ip?: string;
        created_at: string;
    }

    interface ResponseHeadersUpdate {
        id: string;
        status_code?: number;
        status_message?: string;
        response_headers: string;
        http_version?: string;
    }

    interface RequestCompleteUpdate {
        id: string;
        response_body_size: number;
        response_body?: string;
        duration_ms: number;
        completed_at: string;
    }

    interface RequestErrorUpdate {
        id: string;
        error: string;
    }

    interface RequestLogRecord {
        id: string;
        method: string;
        path: string;
        headers: string;
        body: string | null;
        client_ip: string | null;
        status_code: number | null;
        status_message: string | null;
        response_headers: string | null;
        response_body: string | null;
        http_version: string | null;
        response_body_size: number;
        duration_ms: number | null;
        error: string | null;
        created_at: string;
        completed_at: string | null;
    }

    interface RequestQueryFilters {
        page?: number;
        limit?: number;
        method?: string;
        status?: number;
        path?: string;
        since?: string;
    }

    interface RequestStats {
        total: number;
        success: number;
        error: number;
        avg_duration_ms: number | null;
    }

    interface MockDefinition {
        id: string;
        method: string;
        path: string;
        path_type: 'exact' | 'prefix' | 'regex';
        status_code: number;
        headers: string;
        body: string | null;
        delay_ms: number;
        priority: number;
        enabled: number;
        description: string | null;
        created_at: string;
        updated_at: string;
    }

    interface MockInsert {
        method?: string;
        path: string;
        path_type?: string;
        status_code?: number;
        headers?: string;
        body?: string;
        delay_ms?: number;
        priority?: number;
        description?: string;
    }

    interface MockUpdate {
        method?: string;
        path?: string;
        path_type?: string;
        status_code?: number;
        headers?: string;
        body?: string;
        delay_ms?: number;
        priority?: number;
        enabled?: number;
        description?: string;
    }

}

export {};