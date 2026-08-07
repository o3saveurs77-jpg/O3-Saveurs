import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      role?: string;
      /** Date (ms) de la dernière relecture du rôle — lue par le middleware. */
      roleCheckedAt?: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    /** Date (ms) de la dernière relecture du rôle auprès d'Auth0 — voir `auth.ts`. */
    roleCheckedAt?: number;
  }
}
