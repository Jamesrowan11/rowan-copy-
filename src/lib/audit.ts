import { prisma } from "@/lib/prisma";

/** Record who created/edited/deleted a key record (admin-viewable audit log). */
export async function audit(params: {
  actorId?: string | null;
  action: string; // create | update | delete | login | send | ...
  entityType: string;
  entityId?: string | null;
  summary: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        summary: params.summary,
      },
    });
  } catch (err) {
    // Never let audit logging break the primary action.
    console.error("[audit] failed:", err);
  }
}
