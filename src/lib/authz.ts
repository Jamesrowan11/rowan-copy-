import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
};

/**
 * Returns the current authenticated + active user (re-fetched from the DB so a
 * deactivated account is rejected immediately), or null. All access control is
 * enforced here on the data itself, never in the UI alone.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !user.active) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role as Role,
    active: user.active,
  };
}

/** Require any logged-in user; redirect to login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require a user with one of the given roles; redirect otherwise. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/portal");
  }
  return user;
}

export const requireAdmin = () => requireRole("ADMIN");
export const requireStaff = () => requireRole("ADMIN", "EMPLOYEE");

/** Throwing variants for use inside server actions / API routes. */
export class AccessError extends Error {
  status: number;
  constructor(message = "Forbidden", status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireUserAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AccessError("Not authenticated", 401);
  return user;
}

export async function requireRoleAction(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUserAction();
  if (!roles.includes(user.role)) throw new AccessError("Forbidden", 403);
  return user;
}

export function isStaff(role: Role): boolean {
  return role === "ADMIN" || role === "EMPLOYEE";
}
