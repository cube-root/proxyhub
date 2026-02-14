# ProxyHub Server Hosting Guide

This guide covers hosting ProxyHub server on DigitalOcean/Vultr with Cloudflare DNS.

## How It Works

```
Client connects → Server assigns tunnel URL → Requests forwarded

Example:
  Client runs: proxyhub -p 3000
  Server assigns: https://a1b2c3d4e5f6.proxyhub.cloud

  Request to https://a1b2c3d4e5f6.proxyhub.cloud/api/users
       ↓
  Forwarded to http://localhost:3000/api/users
```

## Prerequisites

- DigitalOcean or Vultr account
- Cloudflare account with your domain
- Domain (e.g., `proxyhub.cloud`)

## 1. Create VPS Instance

### DigitalOcean
- Create Droplet: Ubuntu 22.04 LTS
- Plan: Basic ($6/mo is sufficient for small usage)
- Region: Choose closest to your users
- Authentication: SSH key (recommended)

### Vultr
- Deploy Instance: Ubuntu 22.04 LTS
- Plan: Regular Cloud Compute ($6/mo)
- Region: Choose closest to your users

## 2. Initial Server Setup

SSH into your server:

```bash
ssh root@YOUR_SERVER_IP
```

Update system and install dependencies:

```bash
apt update && apt upgrade -y
apt install -y curl git nginx certbot python3-certbot-dns-cloudflare
```

## 3. Cloudflare DNS Configuration

### Add DNS Records

In Cloudflare Dashboard → DNS → Records:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | `@` | `YOUR_SERVER_IP` | DNS only (gray) | Auto |
| A | `*` | `YOUR_SERVER_IP` | DNS only (gray) | Auto |
| A | `connect` | `YOUR_SERVER_IP` | DNS only (gray) | Auto |

**Important:**
- The wildcard `*` record enables dynamic tunnel subdomains (e.g., `a1b2c3d4e5f6.proxyhub.cloud`)
- Each client gets a unique subdomain like `{12-char-hash}.proxyhub.cloud`
- Use "DNS only" (gray cloud) to allow direct SSL termination on your server
- If using Cloudflare proxy (orange cloud), see [Cloudflare Proxy Mode](#cloudflare-proxy-mode-optional) section

## 4. SSL Certificate Setup

Create Cloudflare credentials:

```bash
mkdir -p /root/.secrets
cat > /root/.secrets/cloudflare.ini << EOF
dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN
EOF
chmod 600 /root/.secrets/cloudflare.ini
```

Generate Cloudflare API token:
1. Cloudflare Dashboard → My Profile → API Tokens
2. Create Token → Edit zone DNS template
3. Zone Resources: Include → Specific zone → your domain
4. Copy the token

Request wildcard certificate:

```bash
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d proxyhub.cloud \
  -d "*.proxyhub.cloud" \
  --email your@email.com \
  --agree-tos
```

## 5. Deploy ProxyHub Server

Choose one of the deployment methods below:

---

### Option A: Docker Deployment (Recommended)

#### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

#### Clone and deploy

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USERNAME/proxyhub.git
cd proxyhub
```

#### Create environment file

```bash
cat > .env << EOF
PORT=4000
BASE_DOMAIN=proxyhub.cloud
PROTOCOL=https
SOCKET_PATH=/socket.io
CONNECTION_TIMEOUT_MINUTES=30
EOF
```

#### Start with Docker Compose

```bash
docker compose up -d
```

#### Useful Docker commands

```bash
# View logs
docker compose logs -f

# Restart
docker compose restart

# Stop
docker compose down

# Rebuild and restart
docker compose up -d --build

# Check status
docker compose ps
```

---

### Option B: Node.js + PM2 Deployment

#### Install Node.js and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
```

#### Clone and build

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/YOUR_USERNAME/proxyhub.git
cd proxyhub/packages/server
npm install
npm run build
```

#### Create environment file

```bash
cat > .env << EOF
PORT=4000
BASE_DOMAIN=proxyhub.cloud
PROTOCOL=https
SOCKET_PATH=/socket.io
CONNECTION_TIMEOUT_MINUTES=30
EOF
```

#### Start with PM2

```bash
pm2 start dist/index.js --name proxyhub-server
pm2 save
pm2 startup
```

---

## 6. Nginx Configuration

Create Nginx config:

```bash
cat > /etc/nginx/sites-available/proxyhub << 'EOF'
# Main server for socket.io connections
server {
    listen 443 ssl http2;
    server_name connect.proxyhub.cloud;

    ssl_certificate /etc/letsencrypt/live/proxyhub.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxyhub.cloud/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location /socket.io {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Wildcard server for tunnel subdomains
server {
    listen 443 ssl http2;
    server_name *.proxyhub.cloud;

    ssl_certificate /etc/letsencrypt/live/proxyhub.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/proxyhub.cloud/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
        proxy_send_timeout 300;
        proxy_buffering off;
    }
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name *.proxyhub.cloud proxyhub.cloud connect.proxyhub.cloud;
    return 301 https://$host$request_uri;
}
EOF
```

Enable and restart:

```bash
ln -sf /etc/nginx/sites-available/proxyhub /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

## 7. Firewall Configuration

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## 8. Verify Deployment

Check services:

```bash
# Docker
docker compose ps

# OR PM2
pm2 status

# Nginx
systemctl status nginx
```

Test the server:

```bash
# Test main endpoint
curl https://connect.proxyhub.cloud/

# Test wildcard DNS (should return tunnel not found - that's OK)
curl https://test123.proxyhub.cloud/
# Expected: {"error":"Tunnel not found",...}
```

## 9. Client Configuration

Update client `.env` to point to your server:

```bash
PROXYHUB_SOCKET_URL=https://connect.proxyhub.cloud
PROXYHUB_SOCKET_PATH=/socket.io
```

Or use directly:

```bash
npx proxyhub -p 3000
```

---

## Maintenance

### Docker

```bash
# View logs
docker compose logs -f server

# Restart
docker compose restart

# Update deployment
cd /var/www/proxyhub
git pull
docker compose up -d --build
```

### PM2

```bash
# View logs
pm2 logs proxyhub-server

# Restart
pm2 restart proxyhub-server

# Update deployment
cd /var/www/proxyhub
git pull
cd packages/server
npm install
npm run build
pm2 restart proxyhub-server
```

### SSL Renewal

Certbot auto-renews via cron. Test with:

```bash
certbot renew --dry-run
```

---

## Cloudflare Proxy Mode (Optional)

If you want to use Cloudflare's proxy (orange cloud) for DDoS protection:

1. Set DNS records to "Proxied" (orange cloud)
2. In Cloudflare SSL/TLS settings:
   - Set mode to "Full (strict)"
3. In Network settings:
   - Enable WebSockets
4. Create Page Rule for `connect.proxyhub.cloud/*`:
   - Disable caching
   - Disable Rocket Loader

Note: Wildcard subdomains with Cloudflare proxy require an Enterprise plan or Advanced Certificate Manager ($10/mo).

---

## Troubleshooting

### Connection refused

```bash
# Docker
docker compose ps
docker compose logs server

# PM2
pm2 status
netstat -tlnp | grep 4000
```

### SSL errors

```bash
certbot certificates
nginx -t
```

### WebSocket issues

```bash
tail -f /var/log/nginx/error.log
```

### Client can't connect

```bash
# Verify DNS propagation
dig connect.proxyhub.cloud
dig test123.proxyhub.cloud
```

### Docker container keeps restarting

```bash
docker compose logs server
docker compose down
docker compose up -d --build
```
