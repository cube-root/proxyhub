# Security

ProxyHub takes security seriously. This document describes the security features available, known issues that have been addressed, and how to configure security options.

## Security Features

### Socket.IO Authentication

Restrict which clients can connect to your ProxyHub server by setting a shared authentication key.

**Server:**

```bash
SOCKET_AUTH_KEY=your-secret-key node dist/index.js
```

**Client:**

```bash
proxyhub -p 3000 --auth-key your-secret-key

# Or via environment variable
PROXYHUB_AUTH_KEY=your-secret-key proxyhub -p 3000
```

When `SOCKET_AUTH_KEY` is set on the server, only clients providing the matching key can establish a tunnel. When unset, any client can connect (backward compatible).

Authentication uses `crypto.timingSafeEqual` to prevent timing attacks.

### TLS Certificate Verification

The client enforces TLS certificate verification by default. To allow self-signed certificates (e.g., in development), set:

```bash
PROXYHUB_ALLOW_INSECURE=1 proxyhub -p 3000
```

### CORS Restrictions

**Server:** Restrict allowed origins for HTTP and WebSocket connections:

```bash
ALLOWED_ORIGINS=https://example.com,https://app.example.com node dist/index.js
```

When unset, all origins are allowed (backward compatible).

**Inspector:** The inspector UI only accepts CORS requests from `localhost` and `127.0.0.1`.

### Token Protection

Secure individual tunnels with per-tunnel tokens:

```bash
proxyhub -p 3000 --token mysecrettoken
```

Requests must include the `X-Proxy-Token` header. See the main [README](README.md#token-protection) for details.

### Rate Limiting

**HTTP requests** are rate-limited by default (5000 requests per 10-minute window per IP). The `/status` and `/health` endpoints are excluded.

**Socket.IO connections** are limited to 30 connections per minute per IP.

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `600000` (10 min) | HTTP rate limit window in milliseconds |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max HTTP requests per window per IP |
| `SOCKET_MAX_CONNECTIONS_PER_MINUTE` | `10` | Max socket connections per minute per IP |

### Security Headers

The server uses [helmet](https://helmetjs.github.io/) to set secure HTTP headers including Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, and others.

### Request Body Limits

The server limits request bodies to 10 MB to prevent denial-of-service via oversized payloads.

### Header Filtering

Hop-by-hop headers (`Transfer-Encoding`, `Connection`, `Keep-Alive`, `Upgrade`, `TE`, `Trailer`, `Proxy-Authenticate`, `Proxy-Authorization`) are stripped from proxied requests to prevent header injection and protocol confusion attacks.

### Unpredictable Tunnel IDs

Tunnel IDs are generated using `crypto.randomBytes(16)` (32-character hex strings) instead of deterministic hashes. IDs are persisted in `~/.proxyhub/tunnel-ids.json` for stability across restarts while remaining unpredictable to attackers.

## Fixed Security Issues

| ID | Severity | Issue | Fix |
|----|----------|-------|-----|
| H8 | High | Vulnerable dependencies | Updated dependencies via `npm audit fix` |
| H4 | High | Hop-by-hop headers forwarded to tunnels | Headers are now stripped before forwarding |
| H3 | High | No request body size limit | Added 10 MB limit on JSON and URL-encoded bodies |
| H1 | High | No rate limiting | Added HTTP and Socket.IO rate limiting |
| C1 | Critical | No socket authentication | Added opt-in shared-key authentication with timing-safe comparison |
| C2 | Critical | TLS certificate verification disabled | Enabled by default; opt-out via `PROXYHUB_ALLOW_INSECURE` |
| C3 | Critical | Predictable tunnel IDs | Replaced MD5-based IDs with cryptographically random IDs |
| C4 | Critical | Unrestricted CORS | Server respects `ALLOWED_ORIGINS`; inspector restricted to localhost |
| M3 | Medium | Missing security headers | Added helmet middleware |

## Environment Variables Reference

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `SOCKET_AUTH_KEY` | unset (no auth) | Shared key for socket authentication |
| `ALLOWED_ORIGINS` | unset (allow all) | Comma-separated list of allowed CORS origins |
| `RATE_LIMIT_WINDOW_MS` | `600000` | HTTP rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `5000` | Max HTTP requests per window |
| `SOCKET_MAX_CONNECTIONS_PER_MINUTE` | `30` | Max socket connections per IP per minute |

### Client

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXYHUB_AUTH_KEY` | unset (random) | Authentication key sent to the server |
| `PROXYHUB_ALLOW_INSECURE` | unset (TLS on) | Set to allow self-signed TLS certificates |

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly by opening a private issue on [GitHub](https://github.com/cube-root/proxyhub/issues) or contacting the maintainers directly. Do not disclose vulnerabilities publicly until a fix is available.
