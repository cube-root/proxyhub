# ProxyHub Client CLI

A command-line tool for tunneling localhost to the internet, similar to ngrok.

## Installation

```bash
npm install
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the example server** (runs on port 3000):
   ```bash
   npm run example-server
   ```

3. **In another terminal, run ProxyHub client:**
   ```bash
   npm run dev
   ```

4. **Access your local server** via the public URL provided by ProxyHub!

### Alternative: Use your own server
If you have your own server running, you can tunnel it directly:
```bash
# For a server running on port 8080
npm run dev:custom -- -p 8080 -d
```

## Development Commands

### Quick Start Development
```bash
npm run dev
```
- Runs the client targeting localhost:3000 with debug mode enabled
- Uses nodemon for auto-restart on file changes
- Uses tsx for fast TypeScript execution
- Connects to the default ProxyHub server

### Custom Development
```bash
npm run dev:custom -- -p 8080 -d --keep-history
```
- Pass custom arguments after the `--`
- Example above runs on port 8080 with debug and keep-history enabled

### Test Command
```bash
npm run test
```
- Runs the client on port 8080 with debug mode and keep-history enabled
- Good for testing different configurations

## Usage

### Basic Usage
```bash
proxyhub -p 3000
```

### With Options
```bash
proxyhub -p 3000 -d --keep-history
```

### Command Line Options

| Option | Description | Required |
|--------|-------------|----------|
| `-p, --port <port>` | Port number for proxying | Yes |
| `-d, --debug` | Enable debug mode | No |
| `-keep, --keep-history` | Do not delete history on disconnect | No |
| `-v, --version` | Show version number | No |
| `-h, --help` | Show help | No |

## How it Works

1. **Start Local Server**: Make sure your local application is running (e.g., on port 3000)
2. **Run ProxyHub Client**: `proxyhub -p 3000`
3. **Get Public URL**: The client will connect to the ProxyHub server and provide a public URL
4. **Access Remotely**: Use the public URL to access your local application from anywhere

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PROXYHUB_SOCKET_URL` | ProxyHub server URL | `https://connect.proxyhub.cloud` |
| `PROXYHUB_SOCKET_PATH` | Socket.IO path | `/socket.io` |

## Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development with auto-reload:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. Test the built version:
   ```bash
   npm start
   ```

## Examples

### Web Development
```bash
# Start your web server on port 3000
npm start

# In another terminal, tunnel it
proxyhub -p 3000
```

### API Development
```bash
# Start your API server on port 8080
python -m http.server 8080

# Tunnel it with debug mode
proxyhub -p 8080 -d
```

### Testing Webhooks
```bash
# Start your webhook handler on port 4000
node webhook-server.js

# Tunnel it and keep history for debugging
proxyhub -p 4000 --keep-history
``` 