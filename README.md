# ProxyHub

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/proxyhub)](https://www.npmjs.com/package/proxyhub)

Expose localhost to the internet. Open-source and self-hostable.

## Quick Start

```bash
npx proxyhub -p 3000
```

That's it! Your local server running on port 3000 is now accessible from the internet.

## Features

- **Instant Setup** - No account required, just run one command
- **Request Inspector** - Built-in web UI to monitor all proxied requests and responses in real-time
- **API Composer** - Postman-like request builder inside the inspector to craft and send HTTP requests
- **cURL Export** - Generate copy-ready cURL commands from any captured request
- **Mock Mode** - Define mock responses for API paths without a running backend, with a web UI to manage mocks
- **Token Protection** - Secure your tunnels with authentication tokens
- **Self-Hostable** - Run your own ProxyHub server
- **Session Timeouts** - Configurable session duration limits
- **WebSocket Support** - Full duplex communication via Socket.IO

## Installation

### Using npx (no install)

```bash
npx proxyhub -p <port>
```

### Global install

```bash
npm install -g proxyhub
proxyhub -p <port>
```

## Usage

### Basic Usage

```bash
# Expose local port 3000
proxyhub -p 3000

# With debug output
proxyhub -p 3000 --debug
```

### Request Inspector

Enable the built-in inspector to monitor all proxied requests and responses through a local web UI:

```bash
# Enable inspector (opens on port + 1000 by default)
proxyhub -p 3000 --inspect

# Custom inspector port
proxyhub -p 3000 --inspect --inspect-port 9000
```

Once enabled, open the inspector URL shown in the terminal (e.g., `http://localhost:4000`) to view requests in real-time.

Inspector features:
- Filter by method, status code, and path
- View full request/response headers and bodies
- Resend captured requests with one click
- **API Composer** — click "Compose" to build requests from scratch, or "Edit in Composer" on any captured request to pre-fill the form with its method, URL, headers, and body
- **cURL export** — expand the cURL section on any request detail page to get a ready-to-copy command
- Light/dark theme

### Mock Mode

Define mock API responses without needing a real backend server. Mock mode includes a web UI for managing mocks and supports exact, prefix, and regex path matching.

```bash
# Pure mock mode (no local server needed)
proxyhub --mock

# Hybrid mode (mocked paths return mock data, others proxy to localhost)
proxyhub --mock -p 3000

# Inspector automatically enables mock mode
proxyhub -p 3000 --inspect
```

Once running, open the Mock Manager URL shown in the terminal (e.g., `http://localhost:3001/mocks`) to create and manage mocks.

Mock features:
- **Pure mock mode** — no local server required, define all responses via the UI
- **Hybrid mode** — combine mocks with a real backend; mocked paths return mock data, non-mocked paths proxy normally
- **Path matching** — exact, prefix, or regex matching with configurable priority
- **Response customization** — set status codes, headers, body, and response delay
- **Inspector integration** — mocked requests appear in the inspector with a `MOCK` badge
- Enable/disable individual mocks without deleting them

### Token Protection

Secure your tunnel so only requests with the correct token can access it:

```bash
# Using CLI flag
proxyhub -p 3000 --token mysecrettoken

# Using environment variable
PROXYHUB_TOKEN=mysecrettoken proxyhub -p 3000
```

When token protection is enabled, requests must include the `X-Proxy-Token` header:

```bash
curl -H "X-Proxy-Token: mysecrettoken" https://your-tunnel.proxyhub.cloud/
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-p, --port <port>` | Port number to proxy |
| `-m, --mock` | Enable mock mode |
| `-t, --token <token>` | Token for tunnel protection |
| `-i, --inspect` | Enable request inspector UI |
| `--inspect-port <port>` | Port for inspector UI (default: port + 1000) |
| `-k, --auth-key <key>` | Authentication key for the ProxyHub server |
| `-d, --debug` | Enable debug mode |
| `-V, --version` | Output version number |
| `-h, --help` | Display help |

Either `--port` or `--mock` is required. Using `--inspect` automatically enables mock mode.

## Self-Hosting

### Docker (Recommended)

```bash
docker run -d \
  -p 4000:4000 \
  -e BASE_DOMAIN=your-domain.com \
  -e PROTOCOL=https \
  -e CONNECTION_TIMEOUT_MINUTES=30 \
  ghcr.io/cube-root/proxyhub-server:latest
```

### Docker Compose

```yaml
services:
  server:
    build:
      context: ./packages/server
      dockerfile: Dockerfile
    container_name: proxyhub-server
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - BASE_DOMAIN=your-domain.com
      - PROTOCOL=https
      - SOCKET_PATH=/socket.io
      - CONNECTION_TIMEOUT_MINUTES=30
```

### Connect Client to Self-Hosted Server

```bash
PROXYHUB_SOCKET_URL=https://your-server.com proxyhub -p 3000
```
## Environment Variables

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `BASE_DOMAIN` | `proxyhub.cloud` | Base domain for tunnel URLs |
| `PROTOCOL` | `https` | Protocol for generated URLs |
| `SOCKET_PATH` | `/socket.io` | Socket.IO path |
| `CONNECTION_TIMEOUT_MINUTES` | `30` | Session timeout (0 = unlimited) |
| `SOCKET_AUTH_KEY` | - | Shared key for socket authentication |
| `ALLOWED_ORIGINS` | - | Comma-separated list of allowed CORS origins |
| `RATE_LIMIT_WINDOW_MS` | `600000` | HTTP rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `5000` | Max HTTP requests per window |
| `SOCKET_MAX_CONNECTIONS_PER_MINUTE` | `30` | Max socket connections per IP per minute |

### Client

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXYHUB_SOCKET_URL` | `https://connect.proxyhub.cloud` | ProxyHub server URL |
| `PROXYHUB_SOCKET_PATH` | `/socket.io` | Socket.IO path |
| `PROXYHUB_TOKEN` | - | Token for tunnel protection |
| `PROXYHUB_AUTH_KEY` | - | Authentication key for the server |
| `PROXYHUB_ALLOW_INSECURE` | - | Allow self-signed TLS certificates |

## How It Works

1. Client connects to ProxyHub server via WebSocket
2. Server generates a unique tunnel URL (e.g., `https://abc123.proxyhub.cloud`)
3. Incoming HTTP requests to the tunnel URL are forwarded to the client
4. Client proxies requests to your local server and streams responses back

```
Internet Request                     Your Local Server
       |                                    ^
       v                                    |
  ProxyHub Server  <--WebSocket-->  ProxyHub Client
  (proxyhub.cloud)                   (your machine)
```

## Security

ProxyHub includes several security features for production use:

- **Socket authentication** — set `SOCKET_AUTH_KEY` on the server and `--auth-key` on the client to restrict connections
- **TLS verification** — enabled by default; opt out with `PROXYHUB_ALLOW_INSECURE` for self-signed certs
- **Rate limiting** — HTTP (5000 requests/10 min) and WebSocket (30 connections/min per IP) rate limits protect against abuse
- **CORS restrictions** — configure `ALLOWED_ORIGINS` to restrict cross-origin access
- **Security headers** — helmet middleware sets secure HTTP response headers
- **Header filtering** — hop-by-hop headers are stripped from proxied requests
- **Unpredictable tunnel IDs** — cryptographically random tunnel URLs

See [SECURITY.md](SECURITY.md) for full details, configuration options, and the list of fixed security issues.

## Development

```bash
# Clone the repository
git clone https://github.com/cube-root/proxyhub.git
cd proxyhub

# Install dependencies
npm install

# Build all packages
npm run build

# Run server locally
cd packages/server && npm run dev

# Run client (in another terminal)
cd packages/client && npm run dev -- -p 3000
```

## License

[MIT](LICENSE) - Copyright (c) 2024 Abhijith V
