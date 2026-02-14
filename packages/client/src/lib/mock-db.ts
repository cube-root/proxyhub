import * as crypto from 'crypto';
import { getDb } from './db.js';

export function insertMock(data: MockInsert): MockDefinition {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const record = {
        id,
        method: (data.method || '*').toUpperCase(),
        path: data.path,
        path_type: data.path_type || 'exact',
        status_code: data.status_code ?? 200,
        headers: data.headers || '{}',
        body: data.body ?? null,
        delay_ms: data.delay_ms ?? 0,
        priority: data.priority ?? 0,
        enabled: 1,
        description: data.description ?? null,
        created_at: now,
        updated_at: now,
    };

    const stmt = getDb().prepare(`
        INSERT INTO mocks (id, method, path, path_type, status_code, headers, body, delay_ms, priority, enabled, description, created_at, updated_at)
        VALUES (@id, @method, @path, @path_type, @status_code, @headers, @body, @delay_ms, @priority, @enabled, @description, @created_at, @updated_at)
    `);
    stmt.run(record);

    return record as MockDefinition;
}

export function updateMock(id: string, data: MockUpdate): MockDefinition | undefined {
    const existing = getMockById(id);
    if (!existing) return undefined;

    const fields: string[] = [];
    const params: Record<string, any> = { id };

    if (data.method !== undefined) { fields.push('method = @method'); params.method = data.method.toUpperCase(); }
    if (data.path !== undefined) { fields.push('path = @path'); params.path = data.path; }
    if (data.path_type !== undefined) { fields.push('path_type = @path_type'); params.path_type = data.path_type; }
    if (data.status_code !== undefined) { fields.push('status_code = @status_code'); params.status_code = data.status_code; }
    if (data.headers !== undefined) { fields.push('headers = @headers'); params.headers = data.headers; }
    if (data.body !== undefined) { fields.push('body = @body'); params.body = data.body; }
    if (data.delay_ms !== undefined) { fields.push('delay_ms = @delay_ms'); params.delay_ms = data.delay_ms; }
    if (data.priority !== undefined) { fields.push('priority = @priority'); params.priority = data.priority; }
    if (data.enabled !== undefined) { fields.push('enabled = @enabled'); params.enabled = data.enabled; }
    if (data.description !== undefined) { fields.push('description = @description'); params.description = data.description; }

    if (fields.length === 0) return existing;

    fields.push('updated_at = @updated_at');
    params.updated_at = new Date().toISOString();

    const stmt = getDb().prepare(`UPDATE mocks SET ${fields.join(', ')} WHERE id = @id`);
    stmt.run(params);

    return getMockById(id);
}

export function deleteMock(id: string): boolean {
    const stmt = getDb().prepare('DELETE FROM mocks WHERE id = @id');
    const result = stmt.run({ id });
    return result.changes > 0;
}

export function getMockById(id: string): MockDefinition | undefined {
    const stmt = getDb().prepare('SELECT * FROM mocks WHERE id = @id');
    return stmt.get({ id }) as MockDefinition | undefined;
}

export function getAllMocks(): MockDefinition[] {
    const stmt = getDb().prepare('SELECT * FROM mocks ORDER BY priority DESC');
    return stmt.all() as MockDefinition[];
}

export function getAllEnabledMocks(): MockDefinition[] {
    const stmt = getDb().prepare('SELECT * FROM mocks WHERE enabled = 1 ORDER BY priority DESC');
    return stmt.all() as MockDefinition[];
}

export function toggleMock(id: string, enabled: boolean): MockDefinition | undefined {
    const stmt = getDb().prepare('UPDATE mocks SET enabled = @enabled, updated_at = @updated_at WHERE id = @id');
    stmt.run({ id, enabled: enabled ? 1 : 0, updated_at: new Date().toISOString() });
    return getMockById(id);
}

export function clearMocks(): void {
    getDb().exec('DELETE FROM mocks');
}
