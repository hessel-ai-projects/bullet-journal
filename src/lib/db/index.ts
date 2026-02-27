import { drizzle } from 'drizzle-orm/neon-serverless';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { WebSocket } from 'ws';
import * as schema from './schema';

// Required for Neon serverless to work in Node.js
neonConfig.webSocketConstructor = WebSocket;

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

// Create connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create Drizzle client with schema
export const db = drizzle(pool, { schema });

// Export schema for use in queries
export * from './schema';
