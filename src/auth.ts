import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db, allowedUsers, profiles } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';

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
        return false;
      }

      const allowed = await db.query.allowedUsers.findFirst({
        where: sql`LOWER(${allowedUsers.email}) = LOWER(${user.email})`,
      });

      if (!allowed) {
        console.log(`Sign-in rejected: ${user.email} not in whitelist`);
        return false;
      }

      // User is whitelisted, allow sign in
      return true;
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
