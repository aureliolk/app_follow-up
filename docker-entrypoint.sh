#!/bin/sh

# Log environment check
echo "Checking environment variables..."
echo "REDIS_HOST: $REDIS_HOST"
echo "REDIS_PORT: $REDIS_PORT"
echo "DATABASE_URL: $DATABASE_URL" # Log DB URL too if needed
echo "REDIS connection will be attempted at $REDIS_HOST:$REDIS_PORT"

# Wait for Redis to be ready
echo "Waiting for Redis to be ready..."
until nc -z $REDIS_HOST $REDIS_PORT; do
  echo "Redis is unavailable - sleeping"
  sleep 1
done
echo "Redis is up - continuing"

# Apply Prisma migrations (optional but recommended)
# echo "Running Prisma migrations..."
# npx prisma migrate deploy
# echo "Prisma migrations applied."

# Change to the root directory where pnpm commands should be run
cd /app

# Start Next.js app in background
echo "Starting Next.js app..."
pnpm --filter next-app start &

# Start workers using pnpm scripts in background
echo "Starting Message Processor worker..."
pnpm --filter workers run start:message &

echo "Starting Sequence Step Processor worker..."
pnpm --filter workers run start:sequence &

# Keep container running by waiting for all background processes
# This is generally more robust than tail -f /dev/null
echo "Entrypoint finished launching processes. Waiting..."
wait

