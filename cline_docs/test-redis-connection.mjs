// test-redis-connection.js
import { redisConnection } from './lib/redis.ts';

async function testRedisConnection() {
  try {
    // Test the connection with a ping
    const pingResult = await redisConnection.ping();
    console.log('Redis connection test result:', pingResult);
    
    // Get some basic info about the Redis server
    const info = await redisConnection.info();
    console.log('Redis server info:', info);
    
    // List existing keys (if any)
    const keys = await redisConnection.keys('*');
    console.log('Existing keys:', keys);
    
    console.log('Redis connection test completed successfully!');
  } catch (error) {
    console.error('Redis connection test failed:', error);
  } finally {
    // Close the connection
    process.exit(0);
  }
}

testRedisConnection();
