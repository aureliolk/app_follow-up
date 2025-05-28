import { NextResponse } from 'next/server';
import { redisConnection } from '@/lib/redis';

export async function GET() {
  try {
    // Test the connection with a ping
    const pingResult = await redisConnection.ping();
    
    // Get some basic info about the Redis server
    const info = await redisConnection.info();
    
    // List existing keys (if any)
    const keys = await redisConnection.keys('*');
    
    return NextResponse.json({
      status: 'success',
      pingResult,
      keysCount: keys.length,
      keys: keys.slice(0, 20), // Limit to first 20 keys to avoid large responses
      info: info.substring(0, 500) + '...' // Truncate info for readability
    });
  } catch (error) {
    console.error('Redis connection test failed:', error);
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
