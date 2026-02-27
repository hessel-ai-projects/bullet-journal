import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

// Create Neon HTTP client (works in edge runtime)
const sql = neon(process.env.DATABASE_URL);

// Create Drizzle client with schema
export const db = drizzle(sql, { schema });

// Export schema for use in queries
export * from './schema';
