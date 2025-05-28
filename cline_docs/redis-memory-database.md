## Brief overview
This set of guidelines is specific to the Next.js project that uses Redis as a memory database for BullMQ job queues. It outlines the approach for initializing and working with the Redis memory database in the project.

## Redis configuration
- Use the Redis configuration from the .env file (host: 127.0.0.1, port: 6379)
- Redis is used primarily as a backing store for BullMQ job queues
- The project uses a RedisManager singleton pattern for connection management
- Redis connection is initialized in lib/redis.ts

## Queue management
- The project uses BullMQ for job queue management
- Main queues: sequence-steps (for sequence processing) and message-processing (for message handling)
- Queue initialization happens in lib/queues/queueService.ts
- Workers for processing jobs are defined in lib/workers/

## Development workflow
- Start Redis server before running the application
- Verify Redis connection is working before initializing queues
- Consider using redis-cli for debugging queue state
- Optional: Use redis-cli flushall to clear all data when needed (use with caution)

## AI integration
- The project uses AI services that rely on the memory database for context storage
- Conversation metadata is stored and retrieved for maintaining context between interactions
- Stage-based processing is used for complex AI workflows
