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

let tunnelUrl: string | null = null;
let localTargetPort: number = 3000;

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

const OAT_CSS = 'https://unpkg.com/@knadh/oat@latest/oat.min.css';

function pageHead(title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${OAT_CSS}">
<script>
  (function(){
    var t = localStorage.getItem('ph-theme');
    if (t === 'dark' || t === 'light') { document.documentElement.setAttribute('data-theme', t); }
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) { document.documentElement.setAttribute('data-theme', 'dark'); }
  })();
</script>
<style>
  body { padding: var(--space-4); min-height: 100vh; display: flex; flex-direction: column; }
  .container { flex: 1; }
  .header { margin-bottom: var(--space-6); }
  .header h4 { margin: 0; }
  .header p { color: var(--muted-foreground); margin: 0; }
  .stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-bottom: var(--space-4); }
  .stat-card { text-align: center; }
  .stat-card .val { font-size: var(--text-4); font-weight: var(--font-bold); }
  .stat-card .lbl { font-size: var(--text-8); color: var(--muted-foreground); }
  .stat-card.ok .val { color: var(--success); }
  .stat-card.err .val { color: var(--danger); }
  .filters { margin-bottom: var(--space-4); }
  .filters fieldset.group { margin: 0; }
  table { table-layout: auto; }
  tr.clickable { cursor: pointer; }
  .path-cell { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: var(--text-8); }
  .mono { font-family: var(--font-mono); font-size: var(--text-8); }
  .text-right { text-align: end; }
  .text-muted { color: var(--muted-foreground); }
  .pagination { font-size: var(--text-7); }
  .empty-state { text-align: center; padding: var(--space-12) var(--space-4); color: var(--muted-foreground); }
  .empty-state p { font-size: var(--text-7); }
  .detail-grid { display: grid; grid-template-columns: 140px 1fr; gap: 0; font-size: var(--text-7); }
  .detail-grid dt { padding: var(--space-2) var(--space-3); color: var(--muted-foreground); font-weight: var(--font-medium); border-bottom: 1px solid var(--border); }
  .detail-grid dd { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); word-break: break-all; margin: 0; }
  .section-title { font-size: var(--text-7); font-weight: var(--font-semibold); margin: var(--space-5) 0 var(--space-2); }
  .theme-toggle { background: none; border: 1px solid var(--border); border-radius: var(--radius-full); width: 2rem; height: 2rem; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--foreground); font-size: 1rem; line-height: 1; }
  .theme-toggle:hover { background-color: var(--accent); }
  .theme-icon-light, .theme-icon-dark { display: none; }
  [data-theme="dark"] .theme-icon-light { display: inline; }
  [data-theme="dark"] .theme-icon-dark { display: none; }
  :not([data-theme="dark"]) .theme-icon-light, html:not([data-theme]) .theme-icon-light { display: none; }
  :not([data-theme="dark"]) .theme-icon-dark, html:not([data-theme]) .theme-icon-dark { display: inline; }
  [data-theme="light"] .theme-icon-dark { display: inline; }
  [data-theme="light"] .theme-icon-light { display: none; }
  .site-footer { margin-top: var(--space-8); padding: var(--space-4) 0; border-top: 1px solid var(--border); font-size: var(--text-8); color: var(--muted-foreground); }
  .site-footer a { color: var(--muted-foreground); text-decoration: none; }
  .site-footer a:hover { color: var(--foreground); text-decoration: underline; }
  /* Mobile cards for requests list */
  .mobile-cards { display: none; }
  .req-card { cursor: pointer; margin-bottom: var(--space-2); }
  .req-card:hover { border-color: var(--ring); }
  .req-card-header { margin-bottom: var(--space-2); }
  .req-card-path { font-family: var(--font-mono); font-size: var(--text-8); word-break: break-all; margin: var(--space-1) 0; }
  .req-card-meta { font-size: var(--text-8); color: var(--muted-foreground); }
  @media (max-width: 768px) {
    .stat-cards { grid-template-columns: repeat(2, 1fr); }
    .desktop-table { display: none; }
    .mobile-cards { display: block; }
    .detail-grid { grid-template-columns: 110px 1fr; }
    .filters .hstack { flex-wrap: wrap; }
  }
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

const THEME_TOGGLE = `<button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">
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
        return `<tr class="clickable" onclick="location.href='/${r.id}'">
            <td>${methodBadge(r.method)}</td>
            <td class="path-cell" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</td>
            <td>${statusBadge(r.status_code)}</td>
            <td class="text-right mono">${duration}</td>
            <td class="text-right mono">${size}</td>
            <td class="mono">${r.client_ip || '—'}</td>
            <td class="mono">${time}${errIcon}</td>
            <td><button class="small outline" onclick="event.stopPropagation();resend('${r.id}')">Resend</button></td>
        </tr>`;
    }).join('\n');

    const mobileCards = requests.map(r => {
        const duration = r.duration_ms !== null ? `${r.duration_ms}ms` : '—';
        const size = r.response_body_size ? formatBytes(r.response_body_size) : '—';
        const time = new Date(r.created_at).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return `<div class="card req-card" onclick="location.href='/${r.id}'">
            <div class="req-card-header hstack justify-between">
                <span>${methodBadge(r.method)} ${statusBadge(r.status_code)}</span>
                <button class="small outline" onclick="event.stopPropagation();resend('${r.id}')">Resend</button>
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
        <div class="val">${stats.total}</div>
        <div class="lbl">Total</div>
    </div>
    <div class="card stat-card ok">
        <div class="val">${stats.success}</div>
        <div class="lbl">Success</div>
    </div>
    <div class="card stat-card err">
        <div class="val">${stats.error}</div>
        <div class="lbl">Errors</div>
    </div>
    <div class="card stat-card">
        <div class="val">${stats.avg_duration_ms !== null ? stats.avg_duration_ms + '<small>ms</small>' : '—'}</div>
        <div class="lbl">Avg Duration</div>
    </div>
</div>

<div class="filters">
    <form method="get" action="/">
        <div class="hstack gap-2">
            <select name="method" style="width:auto">
                <option value="">All methods</option>
                ${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m =>
                    `<option value="${m}"${filters.method === m ? ' selected' : ''}>${m}</option>`
                ).join('')}
            </select>
            <input name="status" placeholder="Status" value="${filters.status || ''}" style="width:80px">
            <input name="path" placeholder="Path contains..." value="${escapeHtml(filters.path || '')}" style="width:auto;flex:1;min-width:120px">
            <button type="submit" data-variant="secondary">Filter</button>
        </div>
    </form>
</div>

<div class="hstack mb-4">
    <button class="small outline" onclick="location.reload()">Refresh</button>
    <a href="/compose"><button class="small" data-variant="secondary">+ Compose</button></a>
    ${stats.total > 0 ? '<button class="small" data-variant="danger" onclick="clearAll()">Clear logs</button>' : ''}
</div>

<div class="desktop-table">
<table>
<thead><tr>
    <th>Method</th><th>Path</th><th>Status</th><th class="text-right">Duration</th><th class="text-right">Size</th><th>Client IP</th><th>Time</th><th></th>
</tr></thead>
<tbody>
${tableRows || `<tr><td colspan="8"><div class="empty-state"><p>No requests captured yet.</p><p>Send a request through your tunnel to see it here.</p></div></td></tr>`}
</tbody>
</table>
</div>

<div class="mobile-cards">
${mobileCards || `<div class="empty-state"><p>No requests captured yet.</p><p>Send a request through your tunnel to see it here.</p></div>`}
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

    return `${pageHead(`${record.method} ${record.path} — ProxyHub Inspector`)}

<div class="hstack justify-between mb-4">
    <div class="hstack">
        <a href="/">&larr; Back</a>
        <button class="small outline" onclick="resendReq()">Resend</button>
        <a href="/compose?from=${record.id}"><button class="small" data-variant="secondary">Edit in Composer</button></a>
    </div>
    ${THEME_TOGGLE}
</div>

<div class="header">
    <h4>${methodBadge(record.method)} <code>${escapeHtml(record.path)}</code></h4>
</div>

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

<h5 class="section-title">Request Headers</h5>
<pre>${escapeHtml(prettyHeaders)}</pre>

${record.body ? `<h5 class="section-title">Request Body</h5><pre>${escapeHtml(record.body)}</pre>` : ''}

<h5 class="section-title">Response Headers</h5>
<pre>${escapeHtml(prettyResHeaders)}</pre>

${record.response_body ? `<h5 class="section-title">Response Body</h5><pre>${escapeHtml(record.response_body)}</pre>` : ''}

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
            ${['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m =>
                `<option value="${m}"${pfMethod === m ? ' selected' : ''}>${m}</option>`
            ).join('')}
        </select>
        <input id="compose-url" type="text" placeholder="${escapeHtml(baseUrl)}" value="${escapeHtml(pfUrl)}" style="flex:1;min-width:200px">
        <button onclick="sendRequest()" id="compose-send">Send</button>
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
                ${[['application/json','application/json'],['text/plain','text/plain'],['application/x-www-form-urlencoded','x-www-form-urlencoded'],['text/xml','text/xml']].map(([val,label]) =>
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

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function startInspector(port: number, targetPort: number): void {
    localTargetPort = targetPort;
    const app = express();

    app.use((_, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
        res.type('html').send(renderCompose(targetPort, prefill));
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
