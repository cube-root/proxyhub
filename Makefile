# ProxyHub Development Makefile

.PHONY: mock-api client server install dev clean help
.PHONY: docker-build docker-up docker-down docker-logs docker-restart

# Default target
help:
	@echo "ProxyHub Development Commands"
	@echo ""
	@echo "Local Development:"
	@echo "  make mock-api       - Start mock API server on port 3000"
	@echo "  make client         - Start ProxyHub client (connects to port 3000)"
	@echo "  make client-debug   - Start client with debug mode"
	@echo "  make server         - Start ProxyHub server"
	@echo "  make install        - Install dependencies for all packages"
	@echo "  make clean          - Clean node_modules"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build   - Build Docker image"
	@echo "  make docker-up      - Start server with Docker Compose"
	@echo "  make docker-down    - Stop Docker containers"
	@echo "  make docker-logs    - View Docker logs"
	@echo "  make docker-restart - Rebuild and restart containers"
	@echo ""

# Start mock API server using always-true
mock-api:
	npx always-true

# Start ProxyHub client pointing to mock API on port 3000
client:
	cd packages/client && npm run dev -- -p 3000

# Start ProxyHub client with debug mode
client-debug:
	cd packages/client && npm run dev -- -p 3000 -d

# Start ProxyHub server
server:
	cd packages/server && npm run dev

# Install dependencies
install:
	npm install
	cd packages/client && npm install
	cd packages/server && npm install

# Clean node_modules
clean:
	rm -rf node_modules
	rm -rf packages/client/node_modules
	rm -rf packages/server/node_modules

# Docker commands
docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-restart:
	docker compose up -d --build
