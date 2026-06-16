import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { MailboxSettingsCard } from "@/components/mail/MailboxSettingsCard";

export const dynamic = "force-dynamic";

export default async function StaffMailSettings() {
  const user = await requireRole("EMPLOYEE");
  // Employees manage their own mailboxes (admins set these up and assign them).
  const mailboxes = await prisma.mailbox.findMany({
    where: { ownerId: user.id },
    orderBy: { address: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Mail settings"
        description="Connect your mailbox and set your signature."
        action={<Link href="/staff/mail" className="btn-outline btn-sm">← Back to mail</Link>}
      />
      {mailboxes.length === 0 ? (
        <EmptyState>
          No mailbox is assigned to you yet. Ask an admin to add your{" "}
          <strong>@rowancopy.com</strong> address, then connect it here.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {mailboxes.map((mb) => (
            <MailboxSettingsCard key={mb.id} mailbox={mb} isAdmin={false} ownerName={user.name} />
          ))}
        </div>
      )}
    </>
  );
}
