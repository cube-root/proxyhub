# ProxyHub Server Configuration

## Environment Variables

Create a `.env` file in the server directory with the following variables:

### Required Configuration

```env
# Server Configuration
PORT=4000
NODE_ENV=development

# Domain Configuration
BASE_DOMAIN=proxyhub.cloud
PROTOCOL=https
```

### Optional Configuration

```env
# Socket.io Configuration
SOCKET_PATH=/socket.io
```

### Security Configuration (Recommended for Production)

```env
# Rate limiting (uncomment in production)
# RATE_LIMIT_WINDOW_MS=900000
# RATE_LIMIT_MAX_REQUESTS=100
```

## URL Format

The server generates tunnel URLs in the format:
```
https://{socket-id}.proxyhub.cloud
```

Where `{socket-id}` is the sanitized socket ID from the client connection.

## Security Features

1. **Input Validation**: All socket IDs are validated and sanitized
2. **Domain Validation**: Strict domain format validation
3. **Connection Validation**: Checks if tunnels are still active
4. **Timeout Handling**: 30-second timeout for requests
5. **Error Handling**: Proper error responses with JSON format
6. **Health Check**: Available at `/health` endpoint

## Version Information

The server automatically reads its version from the `package.json` file.

## Example Configuration

For development:
```env
PORT=4000
BASE_DOMAIN=localhost:4000
PROTOCOL=http
```

For production:
```env
PORT=4000
BASE_DOMAIN=proxyhub.cloud
PROTOCOL=https
``` 