import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Instance sans provider (edge-safe) : lit le JWT et applique `authorized`.
export const { auth: middleware } = NextAuth(authConfig);

// Ne protège que le back-office. Le reste du site reste public.
export const config = {
  matcher: ["/admin/:path*"],
};
