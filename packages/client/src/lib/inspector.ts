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
import {
    getAllMocks,
    getMockById as getMockDefById,
    insertMock,
    updateMock,
    deleteMock,
    toggleMock,
    clearMocks,
} from './mock-db.js';

let tunnelUrl: string | null = null;
let localTargetPort: number = 3000;
let mockEnabled: boolean = false;

export function setTunnelUrl(url: string): void {
    tunnelUrl = url;
}

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
    if (code === null) return '<span class="badge secondary">pending</span>';
    if (code < 300) return `<span class="badge success">${code}</span>`;
    if (code < 400) return `<span class="badge warning">${code}</span>`;
    return `<span class="badge danger">${code}</span>`;
}

function methodBadge(method: string): string {
    const colors: Record<string, string> = {
        GET: 'success', POST: 'warning', PUT: 'outline', PATCH: 'outline',
        DELETE: 'danger', HEAD: 'secondary', OPTIONS: 'secondary',
    };
    const cls = colors[method.toUpperCase()] || 'secondary';
    return `<span class="badge ${cls}">${escapeHtml(method)}</span>`;
}

function isMockedRequest(record: RequestLogRecord): boolean {
    if (!record.response_headers) return false;
    try {
        const headers = JSON.parse(record.response_headers);
        return !!headers['x-proxyhub-mock'];
    } catch {
        return false;
    }
}

const OAT_CSS = 'https://unpkg.com/@knadh/oat@latest/oat.min.css';
const INTER_FONT = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';

function pageHead(title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${INTER_FONT}">
<link rel="stylesheet" href="${OAT_CSS}">
<script>
  (function(){
    var t = localStorage.getItem('ph-theme');
    if (t === 'dark' || t === 'light') { document.documentElement.setAttribute('data-theme', t); }
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) { document.documentElement.setAttribute('data-theme', 'dark'); }
  })();
</script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: 'Inter', var(--font-sans, system-ui, sans-serif); padding: var(--space-4); min-height: 100vh; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
  .container { flex: 1; max-width: 1200px; margin: 0 auto; width: 100%; }

  /* ── Animations ── */
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }

  /* ── Header ── */
  .header { margin-bottom: var(--space-6); padding-bottom: var(--space-4); border-bottom: 2px solid var(--border); position: relative; }
  .header::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 60px; height: 2px; background: linear-gradient(90deg, #7c3aed, #2563eb); border-radius: 2px; }
  .header h4 { margin: 0; font-weight: 700; letter-spacing: -0.02em; }
  .header p { color: var(--muted-foreground); margin: var(--space-1) 0 0; font-size: var(--text-7); }

  /* ── Stat Cards ── */
  .stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-bottom: var(--space-5); animation: fadeSlideIn 0.4s ease; }
  .stat-card { text-align: center; position: relative; overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease; border-radius: var(--radius-lg, 0.75rem); padding: var(--space-3); }
  .stat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  [data-theme="dark"] .stat-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
  .stat-card .stat-icon { font-size: 1.1rem; margin-bottom: var(--space-1); display: block; opacity: 0.8; }
  .stat-card .val { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2; }
  .stat-card .lbl { font-size: 0.7rem; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-top: 0.2rem; }
  .stat-card.ok { border-left: 3px solid var(--success); }
  .stat-card.ok .val { color: var(--success); }
  .stat-card.err { border-left: 3px solid var(--danger); }
  .stat-card.err .val { color: var(--danger); }

  /* ── Filters ── */
  .filters { margin-bottom: var(--space-4); }
  .filters fieldset.group { margin: 0; }
  .filters select, .filters input[type="text"], .filters input[name="status"] {
    border-radius: var(--radius-md, 0.5rem); transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .filters select:focus, .filters input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.15); outline: none; }

  /* ── Action bar ── */
  .action-bar { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border); }

  /* ── Table ── */
  table { table-layout: auto; border-collapse: separate; border-spacing: 0; width: 100%; }
  thead th { font-size: var(--text-8); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; color: var(--muted-foreground); white-space: nowrap; padding: var(--space-2) var(--space-3); }
  tbody tr { transition: background-color 0.15s ease; }
  tbody tr:nth-child(even) { background-color: rgba(0,0,0,0.02); }
  [data-theme="dark"] tbody tr:nth-child(even) { background-color: rgba(255,255,255,0.02); }
  tr.clickable { cursor: pointer; }
  tr.clickable:hover { background-color: rgba(124,58,237,0.06) !important; }
  [data-theme="dark"] tr.clickable:hover { background-color: rgba(124,58,237,0.12) !important; }
  td { padding: var(--space-2) var(--space-3); vertical-align: middle; }
  .path-cell { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: 'Inter', var(--font-mono); font-size: var(--text-8); }
  .mono { font-family: var(--font-mono); font-size: var(--text-8); }
  .text-right { text-align: end; }
  .text-muted { color: var(--muted-foreground); }

  /* ── Badges ── */
  .badge { font-weight: 600; font-size: 0.7rem; padding: 0.2em 0.65em; border-radius: var(--radius-full, 9999px); letter-spacing: 0.02em; line-height: 1.5; display: inline-block; text-align: center; min-width: 2.2em; }

  /* ── Pagination ── */
  .pagination { font-size: var(--text-7); }
  .pagination a, .pagination .text-muted { display: inline-block; padding: 0.3em 0.8em; border-radius: var(--radius-full, 9999px); text-decoration: none; font-weight: 500; transition: background-color 0.15s ease; }
  .pagination a:hover { background-color: rgba(124,58,237,0.1); color: #7c3aed; }

  /* ── Empty State ── */
  .empty-state { text-align: center; padding: var(--space-12) var(--space-4); color: var(--muted-foreground); animation: fadeSlideIn 0.5s ease; }
  .empty-state .empty-icon { font-size: 3rem; display: block; margin-bottom: var(--space-3); opacity: 0.6; }
  .empty-state p { font-size: var(--text-7); margin: var(--space-1) 0; }
  .empty-state p:first-of-type { font-weight: 600; color: var(--foreground); font-size: var(--text-6, 1rem); }

  /* ── Detail page ── */
  .detail-grid { display: grid; grid-template-columns: 140px 1fr; gap: 0; font-size: var(--text-7); }
  .detail-grid dt { padding: var(--space-2) var(--space-3); color: var(--muted-foreground); font-weight: 500; border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.015); }
  [data-theme="dark"] .detail-grid dt { background: rgba(255,255,255,0.02); }
  .detail-grid dd { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); word-break: break-all; margin: 0; }
  .section-title { font-size: var(--text-7); font-weight: 600; margin: var(--space-5) 0 var(--space-2); display: flex; align-items: center; gap: var(--space-2); }
  pre { border-radius: var(--radius-md, 0.5rem); font-size: var(--text-8); line-height: 1.6; }

  /* ── Theme toggle ── */
  .theme-toggle { background: none; border: 1px solid var(--border); border-radius: var(--radius-full); width: 2.2rem; height: 2.2rem; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--foreground); font-size: 1.05rem; line-height: 1; transition: all 0.2s ease; }
  .theme-toggle:hover { background-color: var(--accent); box-shadow: 0 0 8px rgba(124,58,237,0.25); border-color: #7c3aed; }
  .theme-icon-light, .theme-icon-dark { display: none; }
  [data-theme="dark"] .theme-icon-light { display: inline; }
  [data-theme="dark"] .theme-icon-dark { display: none; }
  :not([data-theme="dark"]) .theme-icon-light, html:not([data-theme]) .theme-icon-light { display: none; }
  :not([data-theme="dark"]) .theme-icon-dark, html:not([data-theme]) .theme-icon-dark { display: inline; }
  [data-theme="light"] .theme-icon-dark { display: inline; }
  [data-theme="light"] .theme-icon-light { display: none; }

  /* ── Footer ── */
  .site-footer { margin-top: var(--space-8); padding: var(--space-4) 0; border-top: 1px solid var(--border); font-size: var(--text-8); color: var(--muted-foreground); }
  .site-footer a { color: var(--muted-foreground); text-decoration: none; transition: color 0.15s ease; }
  .site-footer a:hover { color: var(--foreground); }

  /* ── Mobile request cards ── */
  .mobile-cards { display: none; }
  .req-card { cursor: pointer; margin-bottom: var(--space-2); border-radius: var(--radius-md, 0.5rem); transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; animation: fadeSlideIn 0.35s ease both; }
  .req-card:hover { border-color: #7c3aed; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(124,58,237,0.1); }
  .req-card-header { margin-bottom: var(--space-2); }
  .req-card-path { font-family: var(--font-mono); font-size: var(--text-8); word-break: break-all; margin: var(--space-1) 0; }
  .req-card-meta { font-size: var(--text-8); color: var(--muted-foreground); }

  /* ── Mock pill & banner ── */
  .mock-pill { display: inline-block; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em; padding: 0.15em 0.55em; border-radius: var(--radius-full); background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; vertical-align: middle; line-height: 1.4; box-shadow: 0 0 6px rgba(124,58,237,0.3); }
  [data-theme="dark"] .mock-pill { background: linear-gradient(135deg, #a78bfa, #8b5cf6); color: #1e1b4b; box-shadow: 0 0 8px rgba(167,139,250,0.3); }
  .mock-banner { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); margin-bottom: var(--space-4); background: linear-gradient(135deg, #ede9fe, #e0e7ff); border: 1px solid #c4b5fd; color: #5b21b6; font-size: var(--text-7); }
  [data-theme="dark"] .mock-banner { background: linear-gradient(135deg, #2e1065, #1e1b4b); border-color: #6d28d9; color: #c4b5fd; }
  .mock-banner-icon { font-size: 1.15rem; flex-shrink: 0; }
  .mock-banner a { color: inherit; text-decoration: underline; font-weight: 600; }

  /* ── Buttons ── */
  button, [type="submit"], .button { 
    font-family: 'Inter', var(--font-sans, system-ui, sans-serif);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
    font-size: 0.9rem; 
    padding: 0.6em 1.2em; 
    font-weight: 600; 
    border-radius: var(--radius-md, 0.5rem); 
    cursor: pointer;
    display: inline-flex; 
    align-items: center; 
    justify-content: center; 
    gap: 0.5em; 
    line-height: 1.2;
    border: 1px solid transparent;
  }
  button:active, [type="submit"]:active, .button:active { transform: scale(0.96); }
  button.small { font-size: 0.8rem; padding: 0.4em 0.8em; }
  
  /* Primary button style (default) */
  button:not(.outline):not([data-variant]) {
      background-color: var(--foreground);
      color: var(--background);
      border-color: var(--foreground);
  }
  button:not(.outline):not([data-variant]):hover {
      background-color: #7c3aed;
      border-color: #7c3aed;
      color: white;
      box-shadow: 0 4px 12px rgba(124,58,237,0.3);
      transform: translateY(-1px);
  }

  /* Outline button style */
  button.outline {
      background-color: transparent;
      border-color: var(--border);
      color: var(--foreground);
  }
  button.outline:hover {
      border-color: var(--foreground);
      background-color: rgba(0,0,0,0.03);
  }
  [data-theme="dark"] button.outline:hover {
      background-color: rgba(255,255,255,0.05);
  }

  /* Secondary variant */
  button[data-variant="secondary"] {
      background-color: var(--secondary, #f3f4f6);
      color: var(--foreground);
      border-color: var(--secondary, #f3f4f6);
  }
  [data-theme="dark"] button[data-variant="secondary"] {
      background-color: #1f2937;
      border-color: #1f2937;
  }
  button[data-variant="secondary"]:hover {
      background-color: #e5e7eb;
      border-color: #e5e7eb;
      transform: translateY(-1px);
  }
  [data-theme="dark"] button[data-variant="secondary"]:hover {
      background-color: #374151;
      border-color: #374151;
  }

  /* Danger variant */
  button[data-variant="danger"] {
      background-color: #fee2e2;
      color: #b91c1c;
      border-color: #fee2e2;
  }
  [data-theme="dark"] button[data-variant="danger"] {
      background-color: #450a0a;
      color: #fca5a5;
      border-color: #450a0a;
  }
  button[data-variant="danger"]:hover {
      background-color: #fecaca;
      border-color: #fecaca;
  }
  [data-theme="dark"] button[data-variant="danger"]:hover {
      background-color: #7f1d1d;
      border-color: #7f1d1d;
  }

  /* ── Action bar ── */
  .action-bar { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); padding: var(--space-3) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: rgba(0,0,0,0.005); }
  [data-theme="dark"] .action-bar { background: rgba(255,255,255,0.01); }
</style>
</head>
<body>
<div class="container">`;
}

const PAGE_FOOT = `</div>
<footer class="site-footer">
    <div class="container hstack justify-between">
        <span>ProxyHub Inspector &middot; <a href="https://proxyhub.app" target="_blank" rel="noopener">proxyhub.app</a></span>
        <span><a href="https://proxyhub.app" target="_blank" rel="noopener">Docs</a></span>
    </div>
</footer>
<script>
function toggleTheme(){
    var el = document.documentElement;
    var current = el.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    el.setAttribute('data-theme', next);
    localStorage.setItem('ph-theme', next);
}
</script>
</body></html>`;

const THEME_TOGGLE = `<button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle dark mode">
    <span class="theme-icon-light">&#9788;</span>
    <span class="theme-icon-dark">&#9790;</span>
</button>`;

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

    const tableRows = requests.map(r => {
        const duration = r.duration_ms !== null ? `${r.duration_ms}ms` : '—';
        const size = r.response_body_size ? formatBytes(r.response_body_size) : '—';
        const time = new Date(r.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const errIcon = r.error ? ` <span class="badge danger" title="${escapeHtml(r.error)}">err</span>` : '';
        const mockPill = isMockedRequest(r) ? ' <span class="mock-pill">MOCK</span>' : '';
        return `<tr class="clickable" onclick="location.href='/${r.id}'">
            <td>${methodBadge(r.method)}</td>
            <td class="path-cell" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</td>
            <td>${statusBadge(r.status_code)}${mockPill}</td>
            <td class="text-right mono">${duration}</td>
            <td class="text-right mono">${size}</td>
            <td class="mono">${r.client_ip || '—'}</td>
            <td class="mono">${time}${errIcon}</td>
            <td><button class="small outline" onclick="event.stopPropagation();resend('${r.id}')">&#8635; Resend</button></td>
        </tr>`;
    }).join('\n');

    const mobileCards = requests.map(r => {
        const duration = r.duration_ms !== null ? `${r.duration_ms}ms` : '—';
        const size = r.response_body_size ? formatBytes(r.response_body_size) : '—';
        const time = new Date(r.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const mockPill = isMockedRequest(r) ? ' <span class="mock-pill">MOCK</span>' : '';
        return `<div class="card req-card" onclick="location.href='/${r.id}'">
            <div class="req-card-header hstack justify-between">
                <span>${methodBadge(r.method)} ${statusBadge(r.status_code)}${mockPill}</span>
                <button class="small outline" onclick="event.stopPropagation();resend('${r.id}')">&#8635; Resend</button>
            </div>
            <div class="req-card-path">${escapeHtml(r.path)}</div>
            <div class="req-card-meta hstack gap-4">${time} &middot; ${duration} &middot; ${size}${r.client_ip ? ` &middot; ${r.client_ip}` : ''}</div>
        </div>`;
    }).join('\n');

    const prevLink = page > 1 ? `<a href="/?${qs({ page: page - 1 })}">&larr; Prev</a>` : '<span class="text-muted">&larr; Prev</span>';
    const nextLink = page < pages ? `<a href="/?${qs({ page: page + 1 })}">Next &rarr;</a>` : '<span class="text-muted">Next &rarr;</span>';

    return `${pageHead('ProxyHub Inspector')}

<div class="header hstack justify-between">
    <div>
        <h4>ProxyHub Inspector</h4>
        <p>Request &amp; response monitor</p>
    </div>
    ${THEME_TOGGLE}
</div>

<div class="stat-cards">
    <div class="card stat-card">
        <span class="stat-icon">&#128202;</span>
        <div class="val">${stats.total}</div>
        <div class="lbl">Total</div>
    </div>
    <div class="card stat-card ok">
        <span class="stat-icon">&#9989;</span>
        <div class="val">${stats.success}</div>
        <div class="lbl">Success</div>
    </div>
    <div class="card stat-card err">
        <span class="stat-icon">&#10060;</span>
        <div class="val">${stats.error}</div>
        <div class="lbl">Errors</div>
    </div>
    <div class="card stat-card">
        <span class="stat-icon">&#9201;</span>
        <div class="val">${stats.avg_duration_ms !== null ? stats.avg_duration_ms + '<small>ms</small>' : '—'}</div>
        <div class="lbl">Avg Duration</div>
    </div>
</div>

<div class="filters">
    <form method="get" action="/">
        <div class="hstack gap-2">
            <select name="method" style="width:auto">
                <option value="">All methods</option>
                ${['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m =>
        `<option value="${m}"${filters.method === m ? ' selected' : ''}>${m}</option>`
    ).join('')}
            </select>
            <input name="status" placeholder="Status" value="${filters.status || ''}" style="width:80px">
            <input name="path" placeholder="Path contains..." value="${escapeHtml(filters.path || '')}" style="width:auto;flex:1;min-width:120px">
            <button type="submit" data-variant="secondary">Filter</button>
        </div>
    </form>
</div>

<div class="action-bar">
    <button class="outline" onclick="location.reload()">&#8635; Refresh</button>
    <a href="/compose" class="button" data-variant="secondary" style="text-decoration:none">+ Compose</a>
    ${mockEnabled ? `<a href="/mocks" class="button" data-variant="secondary" style="text-decoration:none">&#127917; Mocks${(() => { const c = getAllMocks().length; return c > 0 ? ` <span class="mock-pill">${c}</span>` : ''; })()}</a>` : ''}
    ${stats.total > 0 ? '<button data-variant="danger" onclick="clearAll()">Clear logs</button>' : ''}
    <span class="refresh-indicator" style="margin-left:auto;"><span class="refresh-dot"></span> Live</span>
</div>

<div class="desktop-table">
<table>
<thead><tr>
    <th>Method</th><th>Path</th><th>Status</th><th class="text-right">Duration</th><th class="text-right">Size</th><th>Client IP</th><th>Time</th><th></th>
</tr></thead>
<tbody>
${tableRows || `<tr><td colspan="8"><div class="empty-state"><span class="empty-icon">&#128225;</span><p>No requests captured yet</p><p>Send a request through your tunnel to see it here.</p></div></td></tr>`}
</tbody>
</table>
</div>

<div class="mobile-cards">
${mobileCards || `<div class="empty-state"><span class="empty-icon">&#128225;</span><p>No requests captured yet</p><p>Send a request through your tunnel to see it here.</p></div>`}
</div>

${total > 0 ? `<div class="hstack justify-between pagination mt-4">
    <span>${prevLink}</span>
    <span class="text-muted">Page ${page} of ${pages || 1} &middot; ${total} requests</span>
    <span>${nextLink}</span>
</div>` : ''}

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
// Auto-refresh every 5s
var _refreshTimer=setInterval(function(){
    fetch('/api/stats').then(function(r){return r.json();}).then(function(s){
        var cards=document.querySelectorAll('.stat-card .val');
        if(cards[0])cards[0].textContent=s.total;
        if(cards[1])cards[1].textContent=s.success;
        if(cards[2])cards[2].textContent=s.error;
        if(cards[3])cards[3].innerHTML=s.avg_duration_ms!==null?s.avg_duration_ms+'<small>ms</small>':'\u2014';
    }).catch(function(){});
},5000);
</script>

${PAGE_FOOT}`;
}

function generateCurl(record: RequestLogRecord): string {
    const baseUrl = tunnelUrl || `http://localhost:${localTargetPort}`;
    const fullUrl = `${baseUrl}${record.path}`;
    const headers = tryParseJson(record.headers);

    const parts: string[] = ['curl'];

    if (record.method !== 'GET') {
        parts.push(`-X ${record.method}`);
    }

    parts.push(`'${fullUrl}'`);

    // Skip hop-by-hop and host headers
    const skipHeaders = new Set(['host', 'connection', 'content-length']);
    if (headers && typeof headers === 'object') {
        for (const [key, value] of Object.entries(headers as Record<string, string>)) {
            if (skipHeaders.has(key.toLowerCase())) continue;
            parts.push(`-H '${key}: ${String(value).replace(/'/g, "'\\''")}'`);
        }
    }

    if (record.body && record.method !== 'GET' && record.method !== 'HEAD') {
        parts.push(`-d '${record.body.replace(/'/g, "'\\''")}'`);
    }

    return parts.join(' \\\n  ');
}

function renderDetail(record: RequestLogRecord): string {
    const parsed = parseJsonFields(record);
    const prettyHeaders = JSON.stringify(parsed.headers, null, 2);
    const prettyResHeaders = parsed.response_headers ? JSON.stringify(parsed.response_headers, null, 2) : '—';
    const duration = record.duration_ms !== null ? `${record.duration_ms}ms` : '—';
    const size = record.response_body_size ? formatBytes(record.response_body_size) : '—';
    const curlCmd = generateCurl(record);

    // Check if this was a mocked response
    const mocked = isMockedRequest(record);
    const mockBanner = mocked
        ? `<div class="mock-banner">
            <span class="mock-banner-icon">&#9889;</span>
            <span>This response was served from <strong>mock data</strong>, not a live server.${mockEnabled ? ' <a href="/mocks">Manage mocks</a>' : ''}</span>
        </div>`
        : '';

    return `${pageHead(`${record.method} ${record.path} — ProxyHub Inspector`)}

<div class="hstack justify-between mb-4">
    <div class="hstack gap-2">
        <a href="/" class="button outline" style="text-decoration:none">&larr; Back</a>
        <button class="outline" onclick="resendReq()">&#8635; Resend</button>
        <a href="/compose?from=${record.id}" class="button" data-variant="secondary" style="text-decoration:none">&#9998; Edit in Composer</a>
    </div>
    ${THEME_TOGGLE}
</div>

<div class="header">
    <h4>${methodBadge(record.method)} <code>${escapeHtml(record.path)}</code></h4>
</div>

${mockBanner}

<div class="card mb-4">
    <dl class="detail-grid">
        <dt>Request ID</dt><dd class="mono">${escapeHtml(record.id)}</dd>
        <dt>Status</dt><dd>${statusBadge(record.status_code)} ${record.status_message ? escapeHtml(record.status_message) : ''}</dd>
        <dt>Duration</dt><dd>${duration}</dd>
        <dt>Response Size</dt><dd>${size}</dd>
        <dt>Client IP</dt><dd>${record.client_ip || '—'}</dd>
        <dt>HTTP Version</dt><dd>${record.http_version || '—'}</dd>
        <dt>Created</dt><dd>${record.created_at}</dd>
        <dt>Completed</dt><dd>${record.completed_at || '—'}</dd>
    </dl>
</div>

${record.error ? `<div role="alert" data-variant="error" class="mb-4">${escapeHtml(record.error)}</div>` : ''}

<h5 class="section-title">&#128229; Request Headers</h5>
<pre>${escapeHtml(prettyHeaders)}</pre>

${record.body ? `<h5 class="section-title">&#128196; Request Body</h5><pre>${escapeHtml(record.body)}</pre>` : ''}

<h5 class="section-title">&#128228; Response Headers</h5>
<pre>${escapeHtml(prettyResHeaders)}</pre>

${record.response_body ? `<h5 class="section-title">&#128230; Response Body</h5><pre>${escapeHtml(record.response_body)}</pre>` : ''}

<details class="mt-4">
    <summary style="cursor:pointer;font-weight:var(--font-semibold);font-size:var(--text-7);">cURL</summary>
    <div class="mt-2" style="position:relative;">
        <button class="small outline" onclick="copyCurl()" id="copy-curl-btn" style="position:absolute;top:var(--space-2);right:var(--space-2);">Copy</button>
        <pre id="curl-cmd" style="padding-right:4rem;">${escapeHtml(curlCmd)}</pre>
    </div>
</details>

<script>
function copyCurl(){
    var text=document.getElementById('curl-cmd').textContent;
    navigator.clipboard.writeText(text).then(function(){
        var btn=document.getElementById('copy-curl-btn');
        btn.textContent='Copied!';
        setTimeout(function(){btn.textContent='Copy';},1500);
    });
}
function resendReq(){
    fetch('/api/requests/${record.id}/resend',{method:'POST'})
        .then(r=>r.json())
        .then(d=>{if(d.id)location.href='/'+d.id;else alert(d.error||'Resend failed');})
        .catch(()=>alert('Resend failed'));
}
</script>

${PAGE_FOOT}`;
}

function renderCompose(targetPort: number, prefill?: RequestLogRecord): string {
    const pfMethod = prefill ? prefill.method.toUpperCase() : '';
    const pfHeaders = prefill ? tryParseJson(prefill.headers) : null;
    const pfBody = prefill?.body || '';
    // Build the full URL — prefer tunnel URL (forwarding URL), fall back to localhost
    const baseUrl = tunnelUrl || `http://localhost:${targetPort}`;
    const pfUrl = prefill ? `${baseUrl}${prefill.path}` : baseUrl;

    // Build prefill header rows HTML
    let headerRowsHtml: string;
    if (pfHeaders && typeof pfHeaders === 'object' && Object.keys(pfHeaders).length > 0) {
        headerRowsHtml = Object.entries(pfHeaders as Record<string, string>).map(([k, v]) =>
            `<div class="hstack gap-2 mb-2 compose-header-row">
                <input type="text" placeholder="Key" class="header-key" style="flex:1;min-width:100px" value="${escapeHtml(k)}">
                <input type="text" placeholder="Value" class="header-val" style="flex:2;min-width:140px" value="${escapeHtml(String(v))}">
                <button class="small outline" onclick="removeHeaderRow(this)" title="Remove">&times;</button>
            </div>`
        ).join('\n');
    } else {
        headerRowsHtml = `<div class="hstack gap-2 mb-2 compose-header-row">
                <input type="text" placeholder="Key" class="header-key" style="flex:1;min-width:100px">
                <input type="text" placeholder="Value" class="header-val" style="flex:2;min-width:140px">
                <button class="small outline" onclick="removeHeaderRow(this)" title="Remove">&times;</button>
            </div>`;
    }

    // Detect content type from prefill headers
    let pfContentType = 'application/json';
    if (pfHeaders && typeof pfHeaders === 'object') {
        const ct = (pfHeaders as Record<string, string>)['content-type'] || (pfHeaders as Record<string, string>)['Content-Type'] || '';
        if (ct.includes('text/plain')) pfContentType = 'text/plain';
        else if (ct.includes('x-www-form-urlencoded')) pfContentType = 'application/x-www-form-urlencoded';
        else if (ct.includes('xml')) pfContentType = 'text/xml';
    }

    const hasBody = pfMethod && pfMethod !== 'GET' && pfMethod !== 'HEAD' && pfMethod !== 'OPTIONS';

    return `${pageHead('API Composer — ProxyHub Inspector')}

<div class="hstack justify-between mb-4">
    <div class="hstack">
        <a href="/">&larr; Back</a>
    </div>
    ${THEME_TOGGLE}
</div>

<div class="header">
    <h4>API Composer</h4>
    <p>Build and send HTTP requests</p>
</div>

<div class="card mb-4">
    <div class="hstack gap-2 mb-4 compose-url-row">
        <select id="compose-method" style="width:auto">
            ${['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m =>
        `<option value="${m}"${pfMethod === m ? ' selected' : ''}>${m}</option>`
    ).join('')}
        </select>
        <input id="compose-url" type="text" placeholder="${escapeHtml(baseUrl)}" value="${escapeHtml(pfUrl)}" style="flex:1;min-width:200px">
        <button onclick="sendRequest()" id="compose-send" title="Ctrl+Enter to send">&#9889; Send</button>
    </div>

    <details open class="mb-4">
        <summary style="cursor:pointer;font-weight:var(--font-semibold);font-size:var(--text-7);">Headers</summary>
        <div id="compose-headers" class="mt-2">
            ${headerRowsHtml}
        </div>
        <button class="small outline mt-2" onclick="addHeaderRow()">+ Add Header</button>
    </details>

    <details id="compose-body-section" class="mb-2">
        <summary style="cursor:pointer;font-weight:var(--font-semibold);font-size:var(--text-7);">Body</summary>
        <div class="mt-2">
            <select id="compose-content-type" style="width:auto;margin-bottom:var(--space-2)">
                ${[['application/json', 'application/json'], ['text/plain', 'text/plain'], ['application/x-www-form-urlencoded', 'x-www-form-urlencoded'], ['text/xml', 'text/xml']].map(([val, label]) =>
        `<option value="${val}"${pfContentType === val ? ' selected' : ''}>${label}</option>`
    ).join('')}
            </select>
            <textarea id="compose-body" rows="6" placeholder='{"key": "value"}' style="width:100%;font-family:var(--font-mono);font-size:var(--text-8);">${escapeHtml(pfBody)}</textarea>
        </div>
    </details>
</div>

<div id="compose-response" class="card mb-4" style="display:none;">
    <div id="compose-error" role="alert" data-variant="error" class="mb-4" style="display:none;"></div>
    <div id="compose-response-meta" class="hstack gap-4 mb-4" style="font-size:var(--text-7);"></div>
    <details id="compose-res-headers-section" class="mb-4">
        <summary style="cursor:pointer;font-weight:var(--font-semibold);font-size:var(--text-7);">Response Headers</summary>
        <pre id="compose-res-headers" class="mt-2" style="font-size:var(--text-8);max-height:300px;overflow:auto;"></pre>
    </details>
    <h5 class="section-title" style="margin-top:0;">Response Body</h5>
    <pre id="compose-res-body" style="max-height:500px;overflow:auto;font-size:var(--text-8);"></pre>
</div>

<style>
    .compose-url-row { flex-wrap: wrap; }
    @media (max-width: 768px) {
        .compose-url-row select, .compose-url-row input { width: 100%; }
        .compose-header-row { flex-wrap: wrap; }
    }
</style>

<script>
// Keyboard shortcut: Ctrl+Enter to send
document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();sendRequest();}
});
function escapeHtmlC(str){
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatBytesC(b){
    if(b<1024)return b+' B';
    if(b<1024*1024)return (b/1024).toFixed(1)+' KB';
    return (b/(1024*1024)).toFixed(1)+' MB';
}
function addHeaderRow(){
    var container=document.getElementById('compose-headers');
    var row=document.createElement('div');
    row.className='hstack gap-2 mb-2 compose-header-row';
    row.innerHTML='<input type="text" placeholder="Key" class="header-key" style="flex:1;min-width:100px">'
        +'<input type="text" placeholder="Value" class="header-val" style="flex:2;min-width:140px">'
        +'<button class="small outline" onclick="removeHeaderRow(this)" title="Remove">&times;</button>';
    container.appendChild(row);
}
function removeHeaderRow(btn){
    var container=document.getElementById('compose-headers');
    var rows=container.querySelectorAll('.compose-header-row');
    if(rows.length<=1){
        // Don't remove the last row, just clear it
        rows[0].querySelector('.header-key').value='';
        rows[0].querySelector('.header-val').value='';
        return;
    }
    btn.closest('.compose-header-row').remove();
}

// Toggle body section visibility based on method
document.getElementById('compose-method').addEventListener('change',function(){
    var m=this.value;
    var section=document.getElementById('compose-body-section');
    if(m==='GET'||m==='HEAD'||m==='OPTIONS'){
        section.style.display='none';
    } else {
        section.style.display='';
    }
});
// Initialize: show/hide body based on current method
(function(){
    var m=document.getElementById('compose-method').value;
    document.getElementById('compose-body-section').style.display=
        (m==='GET'||m==='HEAD'||m==='OPTIONS')?'none':'';
})();

function sendRequest(){
    var method=document.getElementById('compose-method').value;
    var url=document.getElementById('compose-url').value.trim();
    if(!url){alert('Please enter a URL');return;}

    var headers={};
    document.querySelectorAll('#compose-headers .compose-header-row').forEach(function(row){
        var k=row.querySelector('.header-key').value.trim();
        var v=row.querySelector('.header-val').value;
        if(k) headers[k]=v;
    });

    var body=null;
    if(method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'){
        var bodyText=document.getElementById('compose-body').value;
        if(bodyText){
            body=bodyText;
            var ct=document.getElementById('compose-content-type').value;
            if(!headers['Content-Type']&&!headers['content-type']){
                headers['Content-Type']=ct;
            }
        }
    }

    var sendBtn=document.getElementById('compose-send');
    sendBtn.disabled=true;
    sendBtn.textContent='Sending...';

    fetch('/api/compose',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({method:method,url:url,headers:headers,body:body})
    })
    .then(function(r){return r.json();})
    .then(function(data){renderResponse(data);})
    .catch(function(err){
        var panel=document.getElementById('compose-response');
        panel.style.display='';
        var errEl=document.getElementById('compose-error');
        errEl.style.display='';
        errEl.textContent='Network error: '+err.message;
        document.getElementById('compose-response-meta').innerHTML='';
        document.getElementById('compose-res-headers').textContent='';
        document.getElementById('compose-res-body').textContent='';
    })
    .finally(function(){
        sendBtn.disabled=false;
        sendBtn.textContent='Send';
    });
}

function renderResponse(data){
    var panel=document.getElementById('compose-response');
    panel.style.display='';
    var errEl=document.getElementById('compose-error');
    var metaEl=document.getElementById('compose-response-meta');
    var headersEl=document.getElementById('compose-res-headers');
    var bodyEl=document.getElementById('compose-res-body');
    var headersSec=document.getElementById('compose-res-headers-section');

    if(data.error&&!data.status_code){
        errEl.style.display='';
        errEl.textContent=data.error;
        metaEl.innerHTML=data.id?'<a href="/'+data.id+'">View in Inspector</a>':'';
        headersEl.textContent='';
        bodyEl.textContent='';
        headersSec.style.display='none';
        return;
    }
    errEl.style.display='none';
    headersSec.style.display='';

    var statusClass='secondary';
    if(data.status_code<300)statusClass='success';
    else if(data.status_code<400)statusClass='warning';
    else statusClass='danger';

    metaEl.innerHTML='<span class="badge '+statusClass+'">'+data.status_code+' '+escapeHtmlC(data.status_message||'')+'</span>'
        +'<span class="mono">'+data.duration_ms+'ms</span>'
        +'<span class="mono">'+formatBytesC(data.response_body_size||0)+'</span>'
        +'<a href="/'+data.id+'">View in Inspector</a>';

    var rh=data.response_headers;
    if(typeof rh==='string'){try{rh=JSON.parse(rh);}catch(e){}}
    headersEl.textContent=typeof rh==='object'?JSON.stringify(rh,null,2):(rh||'');

    var rb=data.response_body||'';
    try{rb=JSON.stringify(JSON.parse(rb),null,2);}catch(e){}
    bodyEl.textContent=rb;
}
</script>

${PAGE_FOOT}`;
}

function renderMocksPage(): string {
    const mocks = getAllMocks();

    const tableRows = mocks.map(m => {
        const enabledClass = m.enabled ? 'success' : 'secondary';
        const enabledLabel = m.enabled ? 'ON' : 'OFF';
        let parsedHeaders: Record<string, string> = {};
        try { parsedHeaders = JSON.parse(m.headers); } catch { }

        return `<tr>
            <td>${methodBadge(m.method)}</td>
            <td class="path-cell mono" title="${escapeHtml(m.path)}">${escapeHtml(m.path)}</td>
            <td><span class="badge outline">${escapeHtml(m.path_type)}</span></td>
            <td>${statusBadge(m.status_code)}</td>
            <td class="mono">${m.delay_ms}ms</td>
            <td class="mono">${m.priority}</td>
            <td><button class="small ${enabledClass}" onclick="toggleMock('${m.id}',${m.enabled ? 'false' : 'true'})">${enabledLabel}</button></td>
            <td>
                <div class="hstack gap-1">
                    <button class="small outline" onclick="editMock('${m.id}')">Edit</button>
                    <button class="small" data-variant="danger" onclick="deleteMock('${m.id}')">Delete</button>
                </div>
            </td>
        </tr>`;
    }).join('\n');

    return `${pageHead('Mock Manager — ProxyHub Inspector')}

<style>
    .mock-form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    .mock-form .full { grid-column: 1 / -1; }
    .mock-form label { font-size: var(--text-8); font-weight: 500; margin-bottom: var(--space-1); display: block; color: var(--muted-foreground); }
    .mock-form textarea { width: 100%; font-family: var(--font-mono); font-size: var(--text-8); border-radius: var(--radius-md, 0.5rem); }
    .mock-form input, .mock-form select { width: 100%; border-radius: var(--radius-md, 0.5rem); }
    .mock-form input:focus, .mock-form select:focus, .mock-form textarea:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.15); outline: none; }
    #mock-form-card { border-left: 3px solid #7c3aed; }
    #mock-header-rows .hstack { margin-bottom: var(--space-1); }
    @media (max-width: 768px) { .mock-form { grid-template-columns: 1fr; } }
</style>

<div class="hstack justify-between mb-4">
    <div class="hstack gap-2">
        <a href="/" class="button outline" style="text-decoration:none">&larr; Inspector</a>
        <a href="/compose" class="button outline" style="text-decoration:none">Compose</a>
    </div>
    ${THEME_TOGGLE}
</div>

<div class="header">
    <h4>Mock Manager</h4>
    <p>Define mock responses for API paths</p>
</div>

<div class="action-bar">
    <button onclick="showForm()">+ New Mock</button>
    ${mocks.length > 0 ? '<button data-variant="danger" onclick="clearAllMocks()">Clear All</button>' : ''}
</div>

<div id="mock-form-card" class="card mb-4" style="display:none;">
    <h5 id="mock-form-title" class="mb-4">Create Mock</h5>
    <input type="hidden" id="mock-edit-id" value="">
    <div class="mock-form">
        <div>
            <label>Method</label>
            <select id="mock-method">
                <option value="*">* (Any)</option>
                ${['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(m =>
        `<option value="${m}">${m}</option>`
    ).join('')}
            </select>
        </div>
        <div>
            <label>Path Type</label>
            <select id="mock-path-type">
                <option value="exact">Exact</option>
                <option value="prefix">Prefix</option>
                <option value="regex">Regex</option>
            </select>
        </div>
        <div class="full">
            <label>Path</label>
            <input type="text" id="mock-path" placeholder="/api/users">
        </div>
        <div>
            <label>Status Code</label>
            <input type="number" id="mock-status" value="200" min="100" max="599">
        </div>
        <div>
            <label>Delay (ms)</label>
            <input type="number" id="mock-delay" value="0" min="0">
        </div>
        <div>
            <label>Priority</label>
            <input type="number" id="mock-priority" value="0">
        </div>
        <div>
            <label>Content-Type Quick Select</label>
            <select id="mock-content-type" onchange="applyContentType()">
                <option value="">Custom headers</option>
                <option value="application/json" selected>application/json</option>
                <option value="text/plain">text/plain</option>
                <option value="text/html">text/html</option>
                <option value="application/xml">application/xml</option>
            </select>
        </div>
        <div class="full">
            <label>Response Headers</label>
            <div id="mock-header-rows">
                <div class="hstack gap-2 mock-hdr-row">
                    <input type="text" placeholder="Key" class="mhdr-key" style="flex:1">
                    <input type="text" placeholder="Value" class="mhdr-val" style="flex:2">
                    <button class="small outline" onclick="removeMockHeaderRow(this)">&times;</button>
                </div>
            </div>
            <button class="small outline mt-1" onclick="addMockHeaderRow()">+ Add Header</button>
        </div>
        <div class="full">
            <label>Response Body</label>
            <textarea id="mock-body" rows="6" placeholder='{"message": "Hello from mock"}'></textarea>
        </div>
        <div class="full">
            <label>Description (optional)</label>
            <input type="text" id="mock-description" placeholder="What this mock is for">
        </div>
        <div class="full hstack gap-2">
            <button onclick="saveMock()" id="mock-save-btn">Save Mock</button>
            <button class="outline" onclick="hideForm()">Cancel</button>
        </div>
    </div>
</div>

${mocks.length > 0 ? `<table>
<thead><tr>
    <th>Method</th><th>Path</th><th>Type</th><th>Status</th><th>Delay</th><th>Priority</th><th>Enabled</th><th>Actions</th>
</tr></thead>
<tbody>
${tableRows}
</tbody>
</table>` : `<div class="empty-state"><span class="empty-icon">&#127917;</span><p>No mocks defined yet</p><p>Click "+ New Mock" to create your first mock response.</p></div>`}

<script>
function showForm(data){
    var card=document.getElementById('mock-form-card');
    card.style.display='';
    document.getElementById('mock-form-title').textContent=data?'Edit Mock':'Create Mock';
    document.getElementById('mock-edit-id').value=data?data.id:'';
    document.getElementById('mock-method').value=data?data.method:'*';
    document.getElementById('mock-path-type').value=data?data.path_type:'exact';
    document.getElementById('mock-path').value=data?data.path:'';
    document.getElementById('mock-status').value=data?data.status_code:200;
    document.getElementById('mock-delay').value=data?data.delay_ms:0;
    document.getElementById('mock-priority').value=data?data.priority:0;
    document.getElementById('mock-body').value=data&&data.body?data.body:'';
    document.getElementById('mock-description').value=data&&data.description?data.description:'';

    // Populate headers
    var container=document.getElementById('mock-header-rows');
    container.innerHTML='';
    var headers={};
    if(data&&data.headers){
        try{headers=typeof data.headers==='string'?JSON.parse(data.headers):data.headers;}catch(e){}
    }
    var keys=Object.keys(headers);
    if(keys.length>0){
        keys.forEach(function(k){
            addMockHeaderRow(k,headers[k]);
        });
    } else {
        addMockHeaderRow();
    }
    card.scrollIntoView({behavior:'smooth'});
}
function hideForm(){
    document.getElementById('mock-form-card').style.display='none';
}
function addMockHeaderRow(key,val){
    var container=document.getElementById('mock-header-rows');
    var row=document.createElement('div');
    row.className='hstack gap-2 mock-hdr-row';
    row.innerHTML='<input type="text" placeholder="Key" class="mhdr-key" style="flex:1" value="'+(key?escH(key):'')+'">'
        +'<input type="text" placeholder="Value" class="mhdr-val" style="flex:2" value="'+(val?escH(val):'')+'">'
        +'<button class="small outline" onclick="removeMockHeaderRow(this)">&times;</button>';
    container.appendChild(row);
}
function removeMockHeaderRow(btn){
    var container=document.getElementById('mock-header-rows');
    var rows=container.querySelectorAll('.mock-hdr-row');
    if(rows.length<=1){
        rows[0].querySelector('.mhdr-key').value='';
        rows[0].querySelector('.mhdr-val').value='';
        return;
    }
    btn.closest('.mock-hdr-row').remove();
}
function escH(s){return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function applyContentType(){
    var ct=document.getElementById('mock-content-type').value;
    if(!ct)return;
    var container=document.getElementById('mock-header-rows');
    var rows=container.querySelectorAll('.mock-hdr-row');
    var found=false;
    rows.forEach(function(row){
        if(row.querySelector('.mhdr-key').value.toLowerCase()==='content-type'){
            row.querySelector('.mhdr-val').value=ct;
            found=true;
        }
    });
    if(!found){
        // If first row is empty, use it
        if(rows.length===1&&!rows[0].querySelector('.mhdr-key').value){
            rows[0].querySelector('.mhdr-key').value='Content-Type';
            rows[0].querySelector('.mhdr-val').value=ct;
        } else {
            addMockHeaderRow('Content-Type',ct);
        }
    }
}
function getHeadersObj(){
    var headers={};
    document.querySelectorAll('#mock-header-rows .mock-hdr-row').forEach(function(row){
        var k=row.querySelector('.mhdr-key').value.trim();
        var v=row.querySelector('.mhdr-val').value;
        if(k)headers[k]=v;
    });
    return headers;
}
function saveMock(){
    var editId=document.getElementById('mock-edit-id').value;
    var data={
        method:document.getElementById('mock-method').value,
        path:document.getElementById('mock-path').value.trim(),
        path_type:document.getElementById('mock-path-type').value,
        status_code:parseInt(document.getElementById('mock-status').value)||200,
        headers:JSON.stringify(getHeadersObj()),
        body:document.getElementById('mock-body').value,
        delay_ms:parseInt(document.getElementById('mock-delay').value)||0,
        priority:parseInt(document.getElementById('mock-priority').value)||0,
        description:document.getElementById('mock-description').value||null
    };
    if(!data.path){alert('Path is required');return;}
    var url=editId?'/api/mocks/'+editId:'/api/mocks';
    var method=editId?'PUT':'POST';
    fetch(url,{method:method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
        .then(function(r){if(!r.ok)throw new Error('Failed');return r.json();})
        .then(function(){location.reload();})
        .catch(function(e){alert('Error: '+e.message);});
}
function editMock(id){
    fetch('/api/mocks/'+id)
        .then(function(r){return r.json();})
        .then(function(data){showForm(data);})
        .catch(function(){alert('Failed to load mock');});
}
function deleteMock(id){
    if(!confirm('Delete this mock?'))return;
    fetch('/api/mocks/'+id,{method:'DELETE'})
        .then(function(){location.reload();})
        .catch(function(){alert('Delete failed');});
}
function toggleMock(id,enabled){
    fetch('/api/mocks/'+id+'/toggle',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:enabled})})
        .then(function(){location.reload();})
        .catch(function(){alert('Toggle failed');});
}
function clearAllMocks(){
    if(!confirm('Delete all mocks?'))return;
    fetch('/api/mocks',{method:'DELETE'})
        .then(function(){location.reload();})
        .catch(function(){alert('Clear failed');});
}
</script>

${PAGE_FOOT}`;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function startInspector(port: number, targetPort: number | undefined, options?: { mock?: boolean }): void {
    localTargetPort = targetPort || 0;
    mockEnabled = options?.mock || false;
    const app = express();

    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin) {
            try {
                const host = new URL(origin).hostname;
                if (host === 'localhost' || host === '127.0.0.1') {
                    res.header('Access-Control-Allow-Origin', origin);
                }
            } catch {
                // Invalid origin — don't set CORS header
            }
        }
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    app.use(express.json({ limit: '2mb' }));

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

    // Compose page
    app.get('/compose', (req, res) => {
        const fromId = req.query.from as string | undefined;
        const prefill = fromId ? getRequestById(fromId) : undefined;
        res.type('html').send(renderCompose(targetPort || 0, prefill));
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

    // Compose API — execute a request
    app.post('/api/compose', (req, res) => {
        const { method, url: rawUrl, headers: reqHeaders, body: reqBody } = req.body || {};

        if (!method || !rawUrl) {
            res.status(400).json({ error: 'method and url are required' });
            return;
        }

        // Parse the URL — accept full URLs or paths (default to localhost:targetPort)
        let parsedUrl: URL;
        try {
            if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
                parsedUrl = new URL(rawUrl);
            } else {
                parsedUrl = new URL(rawUrl, `http://localhost:${targetPort}`);
            }
        } catch {
            res.status(400).json({ error: 'Invalid URL' });
            return;
        }

        // If the URL matches the tunnel URL, rewrite to localhost:targetPort
        // to avoid a duplicate DB entry from the tunnel-request handler
        if (tunnelUrl) {
            const tunnelOrigin = new URL(tunnelUrl).origin;
            if (parsedUrl.origin === tunnelOrigin) {
                parsedUrl = new URL(parsedUrl.pathname + parsedUrl.search, `http://localhost:${targetPort}`);
            }
        }

        const newId = crypto.randomUUID();
        const outHeaders: Record<string, string> = { ...(reqHeaders || {}) };

        insertRequest({
            id: newId,
            method: method.toUpperCase(),
            path: parsedUrl.pathname + parsedUrl.search,
            headers: JSON.stringify(outHeaders),
            body: reqBody || undefined,
            client_ip: 'compose',
            created_at: new Date().toISOString(),
        });

        const startTime = Date.now();

        // Don't forward hop-by-hop headers
        delete outHeaders['host'];
        delete outHeaders['connection'];

        const reqOptions: http.RequestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: method.toUpperCase(),
            headers: outHeaders,
            timeout: 30000,
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
                const responseBody = Buffer.concat(chunks).toString('utf-8');
                const durationMs = Date.now() - startTime;
                completeRequest({
                    id: newId,
                    response_body_size: bodySize,
                    response_body: responseBody,
                    duration_ms: durationMs,
                    completed_at: new Date().toISOString(),
                });
                res.json({
                    id: newId,
                    status_code: proxyRes.statusCode,
                    status_message: proxyRes.statusMessage,
                    response_headers: JSON.stringify(proxyRes.headers),
                    response_body: responseBody,
                    duration_ms: durationMs,
                    response_body_size: bodySize,
                });
            });
        });

        proxyReq.on('timeout', () => {
            proxyReq.destroy();
            updateRequestError({ id: newId, error: 'Request timed out (30s)' });
            res.json({ id: newId, error: 'Request timed out (30s)' });
        });

        proxyReq.on('error', (err) => {
            updateRequestError({ id: newId, error: err.message });
            res.json({ id: newId, error: err.message });
        });

        if (reqBody && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
            proxyReq.write(reqBody);
        }
        proxyReq.end();
    });

    // Mock management routes (conditionally enabled)
    if (mockEnabled) {
        // Mock management HTML page
        app.get('/mocks', (_req, res) => {
            res.type('html').send(renderMocksPage());
        });

        // Mock API routes
        app.get('/api/mocks', (_req, res) => {
            res.json(getAllMocks());
        });

        app.post('/api/mocks', (req, res) => {
            const { path, method, path_type, status_code, headers, body, delay_ms, priority, description } = req.body || {};
            if (!path) {
                res.status(400).json({ error: 'path is required' });
                return;
            }
            const mock = insertMock({ path, method, path_type, status_code, headers, body, delay_ms, priority, description });
            res.status(201).json(mock);
        });

        app.get('/api/mocks/:id', (req, res) => {
            const mock = getMockDefById(req.params.id);
            if (!mock) { res.status(404).json({ error: 'Mock not found' }); return; }
            res.json(mock);
        });

        app.put('/api/mocks/:id', (req, res) => {
            const updated = updateMock(req.params.id, req.body || {});
            if (!updated) { res.status(404).json({ error: 'Mock not found' }); return; }
            res.json(updated);
        });

        app.delete('/api/mocks/:id', (req, res) => {
            const deleted = deleteMock(req.params.id);
            if (!deleted) { res.status(404).json({ error: 'Mock not found' }); return; }
            res.json({ message: 'Mock deleted' });
        });

        app.patch('/api/mocks/:id/toggle', (req, res) => {
            const { enabled } = req.body || {};
            if (typeof enabled !== 'boolean' && typeof enabled !== 'number') {
                res.status(400).json({ error: 'enabled is required (boolean)' });
                return;
            }
            const mock = toggleMock(req.params.id, !!enabled);
            if (!mock) { res.status(404).json({ error: 'Mock not found' }); return; }
            res.json(mock);
        });

        app.delete('/api/mocks', (_req, res) => {
            clearMocks();
            res.json({ message: 'All mocks cleared' });
        });
    }

    // HTML detail view
    app.get('/:id', (req, res, next) => {
        if (req.params.id === 'api' || req.params.id === 'health' || req.params.id === 'mocks') return next();
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
        if (mockEnabled) {
            console.log(`Mock Manager: http://localhost:${port}/mocks`);
        }
    });
}
