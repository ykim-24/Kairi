#!/usr/bin/env bash
set -e

# Start backend + frontend + smee webhook proxy together
# Backend:  http://localhost:5100
# Frontend: http://localhost:5173/dashboard/ (with API proxy to backend)
# Smee:     forwards GitHub webhooks to localhost:5100/webhook

# Load all env vars from .env
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID $SMEE_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID $SMEE_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Start database services (postgres, qdrant, neo4j)
echo "Starting database services..."
docker compose up -d postgres qdrant neo4j

# Wait for postgres to be ready
echo "Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U kairi -q 2>/dev/null; do
  sleep 1
done
echo "Databases ready."

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "Installing backend dependencies..."
  npm install
fi
if [ ! -d dashboard-ui/node_modules ]; then
  echo "Installing frontend dependencies..."
  cd dashboard-ui && npm install && cd ..
fi

# Start smee webhook proxy
if [ -n "$SMEE_URL" ]; then
  echo "Starting smee proxy → localhost:5100/webhook"
  npx smee-client -u "$SMEE_URL" -t http://localhost:5100/webhook -p 3000 &
  SMEE_PID=$!
else
  echo "No SMEE_URL found in .env, skipping webhook proxy"
  SMEE_PID=""
fi

# Start backend
echo "Starting backend on :3000..."
npx tsx watch src/index.ts &
BACKEND_PID=$!

# Start frontend dev server
echo "Starting frontend on :5173..."
cd dashboard-ui && npx vite --host &
FRONTEND_PID=$!
cd ..

echo ""
echo "Dashboard: http://localhost:5173/dashboard/"
echo "Backend:   http://localhost:5100"
echo "Webhooks:  $SMEE_URL → localhost:5100/webhook"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

wait
