import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { MailboxSettingsCard } from "@/components/mail/MailboxSettingsCard";

export const dynamic = "force-dynamic";

export default async function ClientMailSettings() {
  const user = await requireRole("CLIENT");
  const mailboxes = await prisma.mailbox.findMany({
    where: { ownerId: user.id },
    orderBy: { address: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Mail settings"
        description="Manage your mailbox password and signature."
        action={<Link href="/client/mail" className="btn-outline btn-sm">← Back to mail</Link>}
      />
      {mailboxes.length === 0 ? (
        <EmptyState>
          No mailbox is assigned to you yet.{" "}
          <Link href="/client/email" className="text-copper hover:underline">Request an email account →</Link>
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
