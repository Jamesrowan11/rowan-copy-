import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import type { Role } from "@/lib/constants";

// Session security:
//  - 30 minutes of inactivity (sliding) — the JWT is re-issued on activity and
//    expires 30 min after the last request.
//  - 8 hours absolute maximum, regardless of activity.
const INACTIVITY_SECONDS = 30 * 60;
const ABSOLUTE_MAX_MS = 8 * 60 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    // Sliding inactivity window.
    maxAge: INACTIVITY_SECONDS,
    // Re-issue the token on every request so inactivity is measured from the
    // last request (not from login).
    updateAge: 0,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password || "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, stamp the absolute expiry.
      if (user) {
        token.role = (user as { role?: string }).role;
        token.uid = (user as { id?: string }).id;
        token.absoluteExp = Date.now() + ABSOLUTE_MAX_MS;
      }
      // Enforce the absolute maximum session length.
      if (
        typeof token.absoluteExp === "number" &&
        Date.now() > token.absoluteExp
      ) {
        return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as Role) ?? "CLIENT";
      }
      return session;
    },
  },
});
