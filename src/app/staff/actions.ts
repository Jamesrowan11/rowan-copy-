"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { onProjectStatusChanged } from "@/lib/automations";
import { PROJECT_STATUSES } from "@/lib/constants";

type Result = { ok: boolean; error?: string };

// Employee-scoped status update: only on a project assigned to them, and they
// cannot cancel (that's admin-only). Verified server-side on the data.
export async function updateProjectStatusStaff(
  projectId: string,
  status: string,
): Promise<Result> {
  const me = await requireRoleAction("EMPLOYEE");
  if (status === "Cancelled" || !(PROJECT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status." };
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.assigneeId !== me.id) {
    return { ok: false, error: "Not found." };
  }
  if (project.status === "Cancelled") {
    return { ok: false, error: "This project was cancelled." };
  }
  await prisma.project.update({ where: { id: projectId }, data: { status } });
  await audit({
    actorId: me.id,
    action: "update",
    entityType: "Project",
    entityId: projectId,
    summary: `Status → ${status} for "${project.title}"`,
  });
  // Automations: client status emails, testimonial request on close.
  await onProjectStatusChanged(projectId, status);
  revalidatePath(`/staff/projects/${projectId}`);
  revalidatePath("/staff");
  return { ok: true };
}
