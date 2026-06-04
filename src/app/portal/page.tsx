import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authz";

// Dispatch to the correct dashboard by role. This page never calls requireRole,
// so there is no redirect loop.
export default async function PortalIndex() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "EMPLOYEE") redirect("/staff");
  redirect("/client");
}
