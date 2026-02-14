import express from 'express';
import * as http from 'http';
import * as crypto from 'crypto';
import {
    getRequests,
    getRequestById,
    getRequestCount,
    getStats,
    clearLogs,
    insertRequest,
    updateResponseHeaders,
    completeRequest,
    updateRequestError,
} from './db.js';

function parseJsonFields(record: RequestLogRecord): any {
    return {
        ...record,
        headers: tryParseJson(record.headers),
        response_headers: record.response_headers ? tryParseJson(record.response_headers) : null,
    };
}

function tryParseJson(str: string): any {
    try {
        return JSON.parse(str);
    } catch {
        return str;
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function statusBadge(code: number | null): string {
    if (code === null) return '<span class="badge">—</span>';
    const cls = code < 300 ? 'ok' : code < 400 ? 'warn' : 'err';
    return `<span class="badge ${cls}">${code}</span>`;
}

function renderPage(port: number, filters: RequestQueryFilters): string {
    const requests = getRequests(filters);
    const total = getRequestCount(filters);
    const stats = getStats();
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const pages = Math.ceil(total / limit);

    const qs = (overrides: Record<string, string | number>) => {
        const params: Record<string, string> = {};
        if (filters.method) params.method = filters.method;
        if (filters.status) params.status = String(filters.status);
        if (filters.path) params.path = filters.path;
        for (const [k, v] of Object.entries(overrides)) params[k] = String(v);
        return new URLSearchParams(params).toString();
    };

    const rows = requests.map(r => {
        const duration = r.duration_ms !== null ? `${r.duration_ms}ms` : '—';
        const size = r.response_body_size ? formatBytes(r.response_body_size) : '—';
        const time = new Date(r.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const error = r.error ? `<span class="err-text" title="${escapeHtml(r.error)}">err</span>` : '';
        return `<tr onclick="location.href='/${r.id}'" class="clickable">
            <td class="mono">${escapeHtml(r.method)}</td>
            <td class="mono path">${escapeHtml(r.path)}</td>
            <td>${statusBadge(r.status_code)}</td>
            <td class="right">${duration}</td>
            <td class="right">${size}</td>
            <td>${r.client_ip || '—'}</td>
            <td>${time} ${error}</td>
            <td><button class="resend-btn" onclick="event.stopPropagation();resend('${r.id}')">Resend</button></td>
        </tr>`;
    }).join('\n');

    const prevLink = page > 1 ? `<a href="/?${qs({ page: page - 1 })}">&larr; Prev</a>` : '<span class="disabled">&larr; Prev</span>';
    const nextLink = page < pages ? `<a href="/?${qs({ page: page + 1 })}">Next &rarr;</a>` : '<span class="disabled">Next &rarr;</span>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ProxyHub Inspector</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,system-ui,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px}
  h1{font-size:18px;margin-bottom:4px;color:#58a6ff}
  .stats{display:flex;gap:16px;margin:12px 0 16px;font-size:13px}
  .stats span{padding:4px 10px;border-radius:4px;background:#161b22;border:1px solid #30363d}
  .stats .ok{color:#3fb950}.stats .err{color:#f85149}
  .filters{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
  .filters input,.filters select{background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:5px 8px;border-radius:4px;font-size:13px}
  .filters button{background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:13px}
  .filters button:hover{background:#30363d}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px 10px;border-bottom:1px solid #30363d;color:#8b949e;font-weight:600;white-space:nowrap}
  td{padding:7px 10px;border-bottom:1px solid #21262d}
  tr.clickable{cursor:pointer}tr.clickable:hover{background:#161b22}
  .mono{font-family:'SF Mono',Consolas,monospace;font-size:12px}
  .path{max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .right{text-align:right}
  .badge{padding:2px 7px;border-radius:3px;font-size:12px;font-weight:600}
  .badge.ok{background:#0d2818;color:#3fb950}
  .badge.warn{background:#2a1f00;color:#d29922}
  .badge.err{background:#2d0a0a;color:#f85149}
  .err-text{color:#f85149;font-size:11px;margin-left:4px}
  .pagination{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px;color:#8b949e}
  .pagination a{color:#58a6ff;text-decoration:none}
  .pagination a:hover{text-decoration:underline}
  .pagination .disabled{color:#484f58}
  .empty{text-align:center;padding:40px;color:#484f58}
  .actions{margin-bottom:14px}
  .actions button{background:#da3633;border:none;color:#fff;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px}
  .actions button:hover{background:#f85149}
  .refresh-btn{background:#21262d !important;border:1px solid #30363d;color:#58a6ff}.refresh-btn:hover{background:#30363d !important}
  .resend-btn{background:#21262d;border:1px solid #30363d;color:#58a6ff;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px}
  .resend-btn:hover{background:#30363d}
  .resend-btn:disabled{opacity:0.5;cursor:not-allowed}
</style>
</head>
<body>
<h1>ProxyHub Inspector</h1>
<div class="stats">
    <span>Total: <b>${stats.total}</b></span>
    <span class="ok">2xx/3xx: <b>${stats.success}</b></span>
    <span class="err">4xx/5xx: <b>${stats.error}</b></span>
    <span>Avg: <b>${stats.avg_duration_ms !== null ? stats.avg_duration_ms + 'ms' : '—'}</b></span>
</div>
<form class="filters" method="get" action="/">
    <select name="method">
        <option value="">All methods</option>
        ${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m =>
            `<option value="${m}"${filters.method === m ? ' selected' : ''}>${m}</option>`
        ).join('')}
    </select>
    <input name="status" placeholder="Status" value="${filters.status || ''}" size="6">
    <input name="path" placeholder="Path contains..." value="${escapeHtml(filters.path || '')}" size="20">
    <button type="submit">Filter</button>
</form>
<div class="actions"><button class="refresh-btn" onclick="location.reload()">Refresh</button>${stats.total > 0 ? ' <button onclick="clearAll()">Clear all logs</button>' : ''}</div>
<table>
<thead><tr>
    <th>Method</th><th>Path</th><th>Status</th><th class="right">Duration</th><th class="right">Size</th><th>Client IP</th><th>Time</th><th>Actions</th>
</tr></thead>
<tbody>
${rows || '<tr><td colspan="8" class="empty">No requests captured yet.</td></tr>'}
</tbody>
</table>
<div class="pagination">
    <span>${prevLink}</span>
    <span>Page ${page} of ${pages || 1} &middot; ${total} requests</span>
    <span>${nextLink}</span>
</div>
<script>
function clearAll(){
    if(!confirm('Clear all request logs?'))return;
    fetch('/api/requests',{method:'DELETE'}).then(()=>location.reload());
}
function resend(id){
    fetch('/api/requests/'+id+'/resend',{method:'POST'})
        .then(r=>r.json())
        .then(d=>{if(d.id)location.href='/'+d.id;else alert(d.error||'Resend failed');})
        .catch(()=>alert('Resend failed'));
}
</script>
</body>
</html>`;
}

function renderDetail(record: RequestLogRecord): string {
    const parsed = parseJsonFields(record);
    const prettyHeaders = JSON.stringify(parsed.headers, null, 2);
    const prettyResHeaders = parsed.response_headers ? JSON.stringify(parsed.response_headers, null, 2) : '—';
    const duration = record.duration_ms !== null ? `${record.duration_ms}ms` : '—';
    const size = record.response_body_size ? formatBytes(record.response_body_size) : '—';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(record.method)} ${escapeHtml(record.path)} — ProxyHub Inspector</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,system-ui,BlinkMacSystemFont,sans-serif;background:#0d1117;color:#c9d1d9;padding:20px}
  a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}
  h1{font-size:16px;margin-bottom:12px;color:#58a6ff}
  .back{margin-bottom:12px;display:inline-block;font-size:13px}
  table{border-collapse:collapse;font-size:13px;width:100%;max-width:700px}
  th{text-align:left;padding:6px 12px;color:#8b949e;font-weight:600;width:160px;vertical-align:top;border-bottom:1px solid #21262d}
  td{padding:6px 12px;border-bottom:1px solid #21262d;word-break:break-all}
  .mono{font-family:'SF Mono',Consolas,monospace;font-size:12px}
  pre{background:#161b22;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;border:1px solid #30363d;margin-top:4px;color:#c9d1d9}
  .badge{padding:2px 7px;border-radius:3px;font-size:12px;font-weight:600}
  .badge.ok{background:#0d2818;color:#3fb950}
  .badge.warn{background:#2a1f00;color:#d29922}
  .badge.err{background:#2d0a0a;color:#f85149}
  .err-box{background:#2d0a0a;border:1px solid #f85149;color:#f85149;padding:8px 12px;border-radius:4px;margin-top:8px;font-size:13px}
  .resend-detail{background:#21262d;border:1px solid #30363d;color:#58a6ff;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:13px;margin-left:12px;text-decoration:none}
  .resend-detail:hover{background:#30363d}
  .resend-detail:disabled{opacity:0.5;cursor:not-allowed}
</style>
</head>
<body>
<a href="/" class="back">&larr; Back to requests</a>
<button class="resend-detail" onclick="resendReq()">Resend</button>
<h1>${escapeHtml(record.method)} ${escapeHtml(record.path)}</h1>
<table>
    <tr><th>Request ID</th><td class="mono">${escapeHtml(record.id)}</td></tr>
    <tr><th>Method</th><td>${escapeHtml(record.method)}</td></tr>
    <tr><th>Path</th><td class="mono">${escapeHtml(record.path)}</td></tr>
    <tr><th>Status</th><td>${statusBadge(record.status_code)} ${record.status_message ? escapeHtml(record.status_message) : ''}</td></tr>
    <tr><th>Duration</th><td>${duration}</td></tr>
    <tr><th>Response Size</th><td>${size}</td></tr>
    <tr><th>Client IP</th><td>${record.client_ip || '—'}</td></tr>
    <tr><th>HTTP Version</th><td>${record.http_version || '—'}</td></tr>
    <tr><th>Created</th><td>${record.created_at}</td></tr>
    <tr><th>Completed</th><td>${record.completed_at || '—'}</td></tr>
</table>
${record.error ? `<div class="err-box">${escapeHtml(record.error)}</div>` : ''}
<h1 style="margin-top:20px">Request Headers</h1>
<pre>${escapeHtml(prettyHeaders)}</pre>
${record.body ? `<h1 style="margin-top:20px">Request Body</h1><pre>${escapeHtml(record.body)}</pre>` : ''}
<h1 style="margin-top:20px">Response Headers</h1>
<pre>${escapeHtml(prettyResHeaders)}</pre>
${record.response_body ? `<h1 style="margin-top:20px">Response Body</h1><pre>${escapeHtml(record.response_body)}</pre>` : ''}
<script>
function resendReq(){
    fetch('/api/requests/${record.id}/resend',{method:'POST'})
        .then(r=>r.json())
        .then(d=>{if(d.id)location.href='/'+d.id;else alert(d.error||'Resend failed');})
        .catch(()=>alert('Resend failed'));
}
</script>
</body>
</html>`;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function startInspector(port: number, targetPort: number): void {
    const app = express();

    app.use((_, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    app.options('*', (_, res) => {
        res.sendStatus(204);
    });

    // HTML table view
    app.get('/', (req, res) => {
        const filters: RequestQueryFilters = {
            page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
            method: req.query.method as string | undefined,
            status: req.query.status ? parseInt(req.query.status as string, 10) : undefined,
            path: req.query.path as string | undefined,
        };
        res.type('html').send(renderPage(port, filters));
    });

    // Resend a request
    app.post('/api/requests/:id/resend', (req, res) => {
        const original = getRequestById(req.params.id);
        if (!original) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }

        const newId = crypto.randomUUID();
        const headers = tryParseJson(original.headers);

        insertRequest({
            id: newId,
            method: original.method,
            path: original.path,
            headers: original.headers,
            body: original.body || undefined,
            client_ip: original.client_ip || undefined,
            created_at: new Date().toISOString(),
        });

        const startTime = Date.now();

        // Remove headers that shouldn't be forwarded directly
        const outHeaders: Record<string, string> = { ...headers };
        delete outHeaders['host'];
        delete outHeaders['connection'];

        const reqOptions: http.RequestOptions = {
            hostname: 'localhost',
            port: targetPort,
            path: original.path,
            method: original.method,
            headers: outHeaders,
        };

        const proxyReq = http.request(reqOptions, (proxyRes) => {
            updateResponseHeaders({
                id: newId,
                status_code: proxyRes.statusCode,
                status_message: proxyRes.statusMessage,
                response_headers: JSON.stringify(proxyRes.headers),
                http_version: proxyRes.httpVersion,
            });

            const chunks: Buffer[] = [];
            let bodySize = 0;
            proxyRes.on('data', (chunk: Buffer) => {
                bodySize += chunk.length;
                if (bodySize <= 512 * 1024) {
                    chunks.push(chunk);
                }
            });

            proxyRes.on('end', () => {
                completeRequest({
                    id: newId,
                    response_body_size: bodySize,
                    response_body: Buffer.concat(chunks).toString('utf-8'),
                    duration_ms: Date.now() - startTime,
                    completed_at: new Date().toISOString(),
                });
                res.json({ id: newId });
            });
        });

        proxyReq.on('error', (err) => {
            updateRequestError({
                id: newId,
                error: err.message,
            });
            res.json({ id: newId });
        });

        if (original.body) {
            proxyReq.write(original.body);
        }
        proxyReq.end();
    });

    // HTML detail view
    app.get('/:id', (req, res, next) => {
        if (req.params.id === 'api' || req.params.id === 'health') return next();
        const record = getRequestById(req.params.id);
        if (!record) { res.status(404).type('html').send('<h1>Not found</h1>'); return; }
        res.type('html').send(renderDetail(record));
    });

    // JSON API
    app.get('/api/requests', (req, res) => {
        const filters: RequestQueryFilters = {
            page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
            method: req.query.method as string | undefined,
            status: req.query.status ? parseInt(req.query.status as string, 10) : undefined,
            path: req.query.path as string | undefined,
            since: req.query.since as string | undefined,
        };

        const requests = getRequests(filters).map(parseJsonFields);
        const total = getRequestCount(filters);

        res.json({
            data: requests,
            pagination: {
                page: filters.page || 1,
                limit: filters.limit || 50,
                total,
                pages: Math.ceil(total / (filters.limit || 50)),
            },
        });
    });

    app.get('/api/requests/:id', (req, res) => {
        const record = getRequestById(req.params.id);
        if (!record) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }
        res.json(parseJsonFields(record));
    });

    app.get('/api/stats', (_, res) => {
        res.json(getStats());
    });

    app.delete('/api/requests', (_, res) => {
        clearLogs();
        res.json({ message: 'All logs cleared' });
    });

    app.get('/health', (_, res) => {
        res.json({ status: 'ok' });
    });

    app.listen(port, () => {
        console.log(`Inspector: http://localhost:${port}`);
    });
}
