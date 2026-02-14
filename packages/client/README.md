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

## Installation

### Using npx (no install needed)

```bash
npx proxyhub -p <port>
```

### Global install

```bash
npm install -g proxyhub
proxyhub -p <port>
```

## Usage

### Basic

```bash
proxyhub -p 3000
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
proxyhub -p 3000 --token mysecrettoken
```

Requests must then include the `X-Proxy-Token` header:

```bash
curl -H "X-Proxy-Token: mysecrettoken" https://your-tunnel.proxyhub.cloud/
```

### Debug Mode

```bash
proxyhub -p 3000 --debug
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-p, --port <port>` | Port number to proxy |
| `-m, --mock` | Enable mock mode |
| `-t, --token <token>` | Token for tunnel protection |
| `-i, --inspect` | Enable request inspector UI |
| `--inspect-port <port>` | Port for inspector UI (default: port + 1000) |
| `-d, --debug` | Enable debug mode |
| `-V, --version` | Output version number |
| `-h, --help` | Display help |

Either `--port` or `--mock` is required. Using `--inspect` automatically enables mock mode.

## Self-Hosted Server

Connect to your own ProxyHub server using environment variables:

```bash
PROXYHUB_SOCKET_URL=https://your-server.com proxyhub -p 3000
```

See the [self-hosting guide](https://github.com/cube-root/proxyhub#self-hosting) for server setup instructions.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXYHUB_SOCKET_URL` | `https://connect.proxyhub.cloud` | ProxyHub server URL |
| `PROXYHUB_SOCKET_PATH` | `/socket.io` | Socket.IO path |
| `PROXYHUB_TOKEN` | - | Token for tunnel protection |

## How It Works

1. Client connects to the ProxyHub server via WebSocket
2. Server assigns a unique public URL (e.g., `https://abc123.proxyhub.cloud`)
3. Incoming requests to that URL are forwarded through the WebSocket to the client
4. Client proxies them to your local server and streams responses back

## Links

- [GitHub](https://github.com/cube-root/proxyhub)
- [Documentation](https://proxyhub.app)
- [Self-Hosting Guide](https://github.com/cube-root/proxyhub#self-hosting)

## License

[MIT](https://github.com/cube-root/proxyhub/blob/main/LICENSE)
