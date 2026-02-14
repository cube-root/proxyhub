# ProxyHub Server Setup Makefile
# Ubuntu 22.04 LTS - DigitalOcean / Vultr
# Reference: docs/HOSTING.md

SHELL := /bin/bash

# Configuration - override these when running make
DOMAIN ?= proxyhub.cloud
EMAIL ?= admin@$(DOMAIN)
SERVER_PORT ?= 4000
CLOUDFLARE_API_TOKEN ?=
REPO_URL ?= https://github.com/cube-root/proxyhub.git
INSTALL_DIR ?= /var/www/proxyhub
CONNECTION_TIMEOUT_MINUTES ?= 30

# Paths
SETUP_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
NGINX_AVAILABLE := /etc/nginx/sites-available/proxyhub
NGINX_ENABLED := /etc/nginx/sites-enabled/proxyhub
CERT_DIR := /etc/letsencrypt/live/$(DOMAIN)
CF_CREDS := /root/.secrets/cloudflare.ini

.PHONY: all system docker nginx ssl firewall deploy env start verify clean \
        help logs restart update certbot-check

# --------------------------------------------------------------------------
# Full setup (run targets in order)
# --------------------------------------------------------------------------

all: system docker ssl nginx firewall deploy env start verify
	@echo ""
	@echo "======================================"
	@echo " ProxyHub setup complete!"
	@echo " Domain: $(DOMAIN)"
	@echo " Test:   curl https://connect.$(DOMAIN)/"
	@echo "======================================"

# --------------------------------------------------------------------------
# 1. System packages
# --------------------------------------------------------------------------

system:
	@echo "[1/8] Updating system and installing dependencies..."
	apt update && apt upgrade -y
	apt install -y curl git nginx certbot python3-certbot-dns-cloudflare

# --------------------------------------------------------------------------
# 2. Docker
# --------------------------------------------------------------------------

docker:
	@echo "[2/8] Installing Docker..."
	@if command -v docker >/dev/null 2>&1; then \
		echo "[INFO] Docker is already installed: $$(docker --version)"; \
	else \
		apt-get update; \
		apt install -y apt-transport-https ca-certificates curl software-properties-common; \
		curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg; \
		echo "deb [arch=$$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $$(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null; \
		apt update; \
		apt -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin; \
		usermod -aG docker $${SUDO_USER:-$$USER}; \
		echo "[INFO] Docker installed: $$(docker --version)"; \
	fi

# --------------------------------------------------------------------------
# 3. SSL certificate (requires Cloudflare API token)
# --------------------------------------------------------------------------

ssl: certbot-check
	@echo "[3/8] Setting up SSL certificate..."
	@if [ -d "$(CERT_DIR)" ]; then \
		echo "[INFO] Certificate already exists at $(CERT_DIR)"; \
	else \
		if [ -z "$(CLOUDFLARE_API_TOKEN)" ]; then \
			echo "[ERROR] CLOUDFLARE_API_TOKEN is required."; \
			echo "  Usage: make ssl CLOUDFLARE_API_TOKEN=your_token DOMAIN=$(DOMAIN) EMAIL=$(EMAIL)"; \
			exit 1; \
		fi; \
		mkdir -p /root/.secrets; \
		echo "dns_cloudflare_api_token = $(CLOUDFLARE_API_TOKEN)" > $(CF_CREDS); \
		chmod 600 $(CF_CREDS); \
		certbot certonly \
			--dns-cloudflare \
			--dns-cloudflare-credentials $(CF_CREDS) \
			-d $(DOMAIN) \
			-d "*.$(DOMAIN)" \
			--email $(EMAIL) \
			--agree-tos \
			--non-interactive; \
	fi

certbot-check:
	@command -v certbot >/dev/null 2>&1 || { echo "[ERROR] certbot not found. Run 'make system' first."; exit 1; }

# --------------------------------------------------------------------------
# 4. Nginx
# --------------------------------------------------------------------------

nginx:
	@echo "[4/8] Configuring Nginx..."
	sed -e 's|__DOMAIN__|$(DOMAIN)|g' \
	    -e 's|__CERT_DIR__|$(CERT_DIR)|g' \
	    -e 's|__SERVER_PORT__|$(SERVER_PORT)|g' \
	    $(SETUP_DIR)/nginx.conf.template > $(NGINX_AVAILABLE)
	ln -sf $(NGINX_AVAILABLE) $(NGINX_ENABLED)
	rm -f /etc/nginx/sites-enabled/default
	nginx -t
	systemctl restart nginx

# --------------------------------------------------------------------------
# 5. Firewall
# --------------------------------------------------------------------------

firewall:
	@echo "[5/8] Configuring firewall..."
	ufw allow OpenSSH
	ufw allow 'Nginx Full'
	ufw --force enable

# --------------------------------------------------------------------------
# 6. Clone / deploy repo
# --------------------------------------------------------------------------

deploy:
	@echo "[6/8] Deploying ProxyHub..."
	@if [ -d "$(INSTALL_DIR)" ]; then \
		echo "[INFO] $(INSTALL_DIR) already exists, pulling latest..."; \
		cd $(INSTALL_DIR) && git pull; \
	else \
		mkdir -p $$(dirname $(INSTALL_DIR)); \
		git clone $(REPO_URL) $(INSTALL_DIR); \
	fi

# --------------------------------------------------------------------------
# 7. Environment file
# --------------------------------------------------------------------------

env:
	@echo "[7/8] Creating .env file..."
	@echo "PORT=$(SERVER_PORT)" > $(INSTALL_DIR)/.env
	@echo "BASE_DOMAIN=$(DOMAIN)" >> $(INSTALL_DIR)/.env
	@echo "PROTOCOL=https" >> $(INSTALL_DIR)/.env
	@echo "SOCKET_PATH=/socket.io" >> $(INSTALL_DIR)/.env
	@echo "CONNECTION_TIMEOUT_MINUTES=$(CONNECTION_TIMEOUT_MINUTES)" >> $(INSTALL_DIR)/.env
	@echo "[INFO] .env written to $(INSTALL_DIR)/.env"

# --------------------------------------------------------------------------
# 8. Start containers
# --------------------------------------------------------------------------

start:
	@echo "[8/8] Starting ProxyHub..."
	cd $(INSTALL_DIR) && docker compose up -d --build

# --------------------------------------------------------------------------
# Verify
# --------------------------------------------------------------------------

verify:
	@echo ""
	@echo "--- Verifying deployment ---"
	cd $(INSTALL_DIR) && docker compose ps
	systemctl status nginx --no-pager -l
	@echo ""
	@echo "Run these to test:"
	@echo "  curl https://connect.$(DOMAIN)/"
	@echo "  curl https://test123.$(DOMAIN)/"

# --------------------------------------------------------------------------
# Maintenance targets
# --------------------------------------------------------------------------

logs:
	cd $(INSTALL_DIR) && docker compose logs -f server

restart:
	cd $(INSTALL_DIR) && docker compose restart

update:
	@echo "Pulling latest and rebuilding..."
	cd $(INSTALL_DIR) && git pull && docker compose up -d --build

ssl-renew:
	certbot renew --dry-run

# --------------------------------------------------------------------------
# Cleanup
# --------------------------------------------------------------------------

clean:
	@echo "Stopping containers..."
	-cd $(INSTALL_DIR) && docker compose down
	@echo "Done. Repo and config files left in place."

# --------------------------------------------------------------------------
# Help
# --------------------------------------------------------------------------

help:
	@echo "ProxyHub Server Setup (Ubuntu 22.04)"
	@echo ""
	@echo "Full setup (run as root):"
	@echo "  make all DOMAIN=proxyhub.cloud CLOUDFLARE_API_TOKEN=xxx EMAIL=you@email.com"
	@echo ""
	@echo "Individual steps:"
	@echo "  make system    - Update system, install nginx/certbot"
	@echo "  make docker    - Install Docker (skips if already installed)"
	@echo "  make ssl       - Request wildcard SSL cert via Cloudflare DNS"
	@echo "  make nginx     - Configure Nginx reverse proxy"
	@echo "  make firewall  - Configure UFW firewall rules"
	@echo "  make deploy    - Clone/pull the ProxyHub repo"
	@echo "  make env       - Generate .env file"
	@echo "  make start     - Build and start Docker containers"
	@echo "  make verify    - Check running services"
	@echo ""
	@echo "Maintenance:"
	@echo "  make logs      - Tail server logs"
	@echo "  make restart   - Restart containers"
	@echo "  make update    - Pull latest code and rebuild"
	@echo "  make ssl-renew - Test SSL auto-renewal"
	@echo "  make clean     - Stop containers"
	@echo ""
	@echo "Configuration variables:"
	@echo "  DOMAIN                     (default: proxyhub.cloud)"
	@echo "  EMAIL                      (default: admin@DOMAIN)"
	@echo "  CLOUDFLARE_API_TOKEN       (required for ssl)"
	@echo "  REPO_URL                   (default: https://github.com/cube-root/proxyhub.git)"
	@echo "  INSTALL_DIR                (default: /var/www/proxyhub)"
	@echo "  SERVER_PORT                (default: 4000)"
	@echo "  CONNECTION_TIMEOUT_MINUTES (default: 30)"
