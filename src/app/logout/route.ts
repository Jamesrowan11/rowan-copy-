import { signOut } from "@/auth";
import { NextResponse } from "next/server";

// GET /logout — clears the session and returns to the login page.
export async function GET() {
  await signOut({ redirect: false });
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL("/login", appUrl));
}
