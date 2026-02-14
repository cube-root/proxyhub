# ProxyHub Client Configuration

## Environment Variables

Create a `.env` file in the client directory with the following variables:

### Server Connection

```env
# ProxyHub Server URL
PROXYHUB_SOCKET_URL=https://connect.proxyhub.cloud

# Socket.io path (should match server)
PROXYHUB_SOCKET_PATH=/socket.io
```

### Development Configuration

For local development, you can connect to a local server:

```env
PROXYHUB_SOCKET_URL=http://localhost:4000
PROXYHUB_SOCKET_PATH=/socket.io
```

## Usage

```bash
# Install dependencies
npm install

# Build the client
npm run build

# Run the client
npx proxyhub -p 3000

# Or with debug mode
npx proxyhub -p 3000 --debug
```

## Command Line Options

- `-p, --port <port>` - Port number for proxying (required)
- `-d, --debug` - Enable debug mode
- `--keep-history` - Do not delete history on disconnect

## URL Format

When connected, the client will display a tunnel URL in the format:
```
https://{socket-id}.proxyhub.cloud -> http://localhost:{port}
```

## Security Features

1. **Secure Connection**: Uses WebSocket Secure (WSS) for HTTPS servers
2. **Input Validation**: All requests are validated before proxying
3. **Error Handling**: Comprehensive error handling and logging
4. **Connection Management**: Automatic reconnection and graceful shutdown
5. **Request Timeout**: 5-second timeout for local requests

## Example Output

```
────────────────────────────────────────────────────────────────────────────────

🫶 ProxyHub tunnel established successfully!

────────────────────────────────────────────────────────────────────────────────

Session Status       online
Version             1.0.0
Forwarding          https://abc123def.proxyhub.cloud -> http://localhost:3000

Connections         ttl     opn     rt1     rt5     p50     p90
                    0       0       0.00    0.00    0.00    0.00

────────────────────────────────────────────────────────────────────────────────
```

## Troubleshooting

### Connection Issues

1. Check your internet connection
2. Verify the server URL is correct
3. Try with debug mode: `npx proxyhub -p 3000 --debug`

### Invalid URL Format

If you see "Invalid hostname format" errors, ensure:
- The socket ID contains only alphanumeric characters
- The domain format is correct (subdomain.domain.tld)
- The client is properly connected to the server 