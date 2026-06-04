"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  // Decide where to send the user based on role.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.active) {
    return { error: "This account has been deactivated. Contact Rowan Copy." };
  }
  const redirectTo = "/portal";

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    // signIn throws a redirect on success — re-throw so Next handles it.
    throw err;
  }

  return {};
}
