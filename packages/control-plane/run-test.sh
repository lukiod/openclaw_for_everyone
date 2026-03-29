#!/usr/bin/env bash
set -e

# Start the server
bash /mnt/c/Users/mohak/Desktop/openclaw_for_everyone/packages/control-plane/start-dev.sh > /tmp/cp.log 2>&1 &
SERVER_PID=$!

# Wait until healthz responds (up to 20s)
echo "Waiting for server..."
for i in $(seq 1 20); do
  sleep 1
  STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/healthz 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "Server ready (${i}s)"
    break
  fi
done

echo ""
echo "=== GET /healthz ==="
curl -s http://localhost:3000/healthz
echo ""

echo ""
echo "=== POST /api/auth/register ==="
REGISTER=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}')
echo "$REGISTER"
echo ""

TOKEN=$(echo "$REGISTER" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])' 2>/dev/null || true)

echo "=== GET /api/auth/me ==="
curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== GET /api/tenant/status ==="
curl -s http://localhost:3000/api/tenant/status -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== POST /api/auth/login ==="
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}'
echo ""

kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
echo ""
echo "All done."
