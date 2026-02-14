# ProxyHub

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/@proxyhub/client)](https://www.npmjs.com/package/@proxyhub/client)

Expose localhost to the internet. Self-hostable ngrok alternative.

## Quick Start

```bash
npx @proxyhub/client -p 3000
```

That's it! Your local server running on port 3000 is now accessible from the internet.

## Features

- **Instant Setup** - No account required, just run one command
- **Token Protection** - Secure your tunnels with authentication tokens
- **Self-Hostable** - Run your own ProxyHub server
- **Session Timeouts** - Configurable session duration limits
- **WebSocket Support** - Full duplex communication via Socket.IO

## Installation

### Using npx (no install)

```bash
npx @proxyhub/client -p <port>
```

### Global install

```bash
npm install -g @proxyhub/client
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
| `-p, --port <port>` | Port number to proxy (required) |
| `-t, --token <token>` | Token for tunnel protection |
| `-d, --debug` | Enable debug mode |
| `-V, --version` | Output version number |
| `-h, --help` | Display help |

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
SOCKET_URL=https://your-server.com proxyhub -p 3000
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

### Client

| Variable | Default | Description |
|----------|---------|-------------|
| `SOCKET_URL` | `https://connect.proxyhub.cloud` | ProxyHub server URL |
| `PROXYHUB_TOKEN` | - | Token for tunnel protection |

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
