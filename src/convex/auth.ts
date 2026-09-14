// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation

import { convexAuth } from "@convex-dev/auth/server";
import type { AuthProviderConfig } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { emailOtp } from "./auth/emailOtp";

// Email + password (sign-up and sign-in flows).
const passwordProvider = Password({
  validatePasswordRequirements: (password: string) => {
    if (password.length < 8) {
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    }
  },
});

const providers: AuthProviderConfig[] = [emailOtp, Anonymous, passwordProvider];

// Google OAuth — only enabled when its credentials exist.
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
});