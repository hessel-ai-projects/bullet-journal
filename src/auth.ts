import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db, allowedUsers, users, profiles } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/not-authorized',
  },
  callbacks: {
    signIn: async ({ user, account, profile }) => {
      // Check if user is in allowed_users whitelist
      if (!user.email) {
        console.log('Sign-in rejected: No email provided');
        return false;
      }

      try {
        const normalizedEmail = user.email.toLowerCase().trim();
        console.log(`Checking whitelist for: ${normalizedEmail}`);

        // Get all allowed users and check manually (for debugging)
        const allAllowed = await db.query.allowedUsers.findMany();
        console.log('All allowed emails:', allAllowed.map(u => u.email));

        const allowed = allAllowed.find(u => 
          u.email.toLowerCase().trim() === normalizedEmail
        );

        if (!allowed) {
          console.log(`Sign-in rejected: ${normalizedEmail} not in whitelist`);
          return false;
        }

        console.log(`Sign-in allowed: ${normalizedEmail}`);
        return true;
      } catch (error) {
        console.error('Database error during sign-in check:', error);
        return false;
      }
    },
    session: async ({ session, token, user }) => {
      // Add user.id to session
      if (session.user) {
        session.user.id = token.sub ?? user.id;
      }
      return session;
    },
    jwt: async ({ token, user, account, profile }) => {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
  events: {
    signIn: async ({ user, account, profile, isNewUser }) => {
      // Create or update profile in our database
      if (user.email && user.id) {
        const existingProfile = await db.query.profiles.findFirst({
          where: eq(profiles.id, user.id),
        });

        if (!existingProfile) {
          // Create new profile
          await db.insert(profiles).values({
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.image,
          });
        } else {
          // Update existing profile
          await db.update(profiles)
            .set({
              name: user.name,
              avatarUrl: user.image,
              updatedAt: new Date(),
            })
            .where(eq(profiles.id, user.id));
        }
      }
    },
  },
});
