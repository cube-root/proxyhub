import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let db: Database.Database | null = null;

const DB_DIR = path.join(os.homedir(), '.proxyhub');
const DB_PATH = path.join(DB_DIR, 'logs.db');

export function initDb(): void {
    if (db) return;

    fs.mkdirSync(DB_DIR, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS requests (
            id                 TEXT PRIMARY KEY,
            method             TEXT NOT NULL,
            path               TEXT NOT NULL,
            headers            TEXT NOT NULL DEFAULT '{}',
            body               TEXT,
            client_ip          TEXT,
            status_code        INTEGER,
            status_message     TEXT,
            response_headers   TEXT,
            response_body      TEXT,
            http_version       TEXT,
            response_body_size INTEGER DEFAULT 0,
            duration_ms        INTEGER,
            error              TEXT,
            created_at         TEXT NOT NULL,
            completed_at       TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_requests_method ON requests(method);
        CREATE INDEX IF NOT EXISTS idx_requests_status_code ON requests(status_code);
        CREATE INDEX IF NOT EXISTS idx_requests_path ON requests(path);
    `);

    // Migrate: add response_body column if missing (existing DBs)
    try {
        db.exec('ALTER TABLE requests ADD COLUMN response_body TEXT');
    } catch {
        // Column already exists
    }
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}

function getDb(): Database.Database {
    if (!db) throw new Error('Database not initialized. Call initDb() first.');
    return db;
}

export function insertRequest(data: RequestLogInsert): void {
    const stmt = getDb().prepare(`
        INSERT INTO requests (id, method, path, headers, body, client_ip, created_at)
        VALUES (@id, @method, @path, @headers, @body, @client_ip, @created_at)
    `);
    stmt.run({
        ...data,
        body: data.body ?? null,
        client_ip: data.client_ip ?? null,
    });
}

export function updateResponseHeaders(data: ResponseHeadersUpdate): void {
    const stmt = getDb().prepare(`
        UPDATE requests
        SET status_code = @status_code,
            status_message = @status_message,
            response_headers = @response_headers,
            http_version = @http_version
        WHERE id = @id
    `);
    stmt.run(data);
}

export function completeRequest(data: RequestCompleteUpdate): void {
    const stmt = getDb().prepare(`
        UPDATE requests
        SET response_body_size = @response_body_size,
            response_body = @response_body,
            duration_ms = @duration_ms,
            completed_at = @completed_at
        WHERE id = @id
    `);
    stmt.run({
        ...data,
        response_body: data.response_body ?? null,
    });
}

export function updateRequestError(data: RequestErrorUpdate): void {
    const stmt = getDb().prepare(`
        UPDATE requests
        SET error = @error,
            completed_at = @completed_at
        WHERE id = @id
    `);
    stmt.run({ ...data, completed_at: new Date().toISOString() });
}

export function getRequests(filters: RequestQueryFilters = {}): RequestLogRecord[] {
    const { page = 1, limit = 50, method, status, path: pathFilter, since } = filters;
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (method) {
        conditions.push('method = @method');
        params.method = method.toUpperCase();
    }
    if (status) {
        conditions.push('status_code = @status');
        params.status = status;
    }
    if (pathFilter) {
        conditions.push('path LIKE @pathFilter');
        params.pathFilter = `%${pathFilter}%`;
    }
    if (since) {
        conditions.push('created_at >= @since');
        params.since = since;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const stmt = getDb().prepare(`
        SELECT * FROM requests ${where}
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
    `);
    return stmt.all({ ...params, limit, offset }) as RequestLogRecord[];
}

export function getRequestById(id: string): RequestLogRecord | undefined {
    const stmt = getDb().prepare('SELECT * FROM requests WHERE id = @id');
    return stmt.get({ id }) as RequestLogRecord | undefined;
}

export function getRequestCount(filters: RequestQueryFilters = {}): number {
    const { method, status, path: pathFilter, since } = filters;
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (method) {
        conditions.push('method = @method');
        params.method = method.toUpperCase();
    }
    if (status) {
        conditions.push('status_code = @status');
        params.status = status;
    }
    if (pathFilter) {
        conditions.push('path LIKE @pathFilter');
        params.pathFilter = `%${pathFilter}%`;
    }
    if (since) {
        conditions.push('created_at >= @since');
        params.since = since;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = getDb().prepare(`SELECT COUNT(*) as count FROM requests ${where}`);
    const result = stmt.get(params) as { count: number };
    return result.count;
}

export function getStats(): RequestStats {
    const stmt = getDb().prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status_code >= 200 AND status_code < 400 THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN status_code >= 400 OR error IS NOT NULL THEN 1 ELSE 0 END) as error,
            AVG(duration_ms) as avg_duration_ms
        FROM requests
    `);
    const result = stmt.get() as RequestStats;
    return {
        total: result.total || 0,
        success: result.success || 0,
        error: result.error || 0,
        avg_duration_ms: result.avg_duration_ms ? Math.round(result.avg_duration_ms) : null,
    };
}

export function clearLogs(): void {
    getDb().exec('DELETE FROM requests');
}
