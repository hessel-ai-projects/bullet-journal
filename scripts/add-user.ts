import { db, allowedUsers } from '@/lib/db';
import { eq } from 'drizzle-orm';

async function addAllowedUser() {
  const email = 'hessel.amann@gmail.com';
  
  // Check if already exists
  const existing = await db.query.allowedUsers.findFirst({
    where: eq(allowedUsers.email, email),
  });
  
  if (existing) {
    console.log('User already whitelisted:', email);
    return;
  }
  
  await db.insert(allowedUsers).values({ email });
  console.log('Added to whitelist:', email);
}

addAllowedUser().catch(console.error);
