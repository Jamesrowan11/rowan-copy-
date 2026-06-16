import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { MailboxSettingsCard } from "@/components/mail/MailboxSettingsCard";
import { CreateMailboxForm } from "./CreateMailboxForm";

export const dynamic = "force-dynamic";

export default async function AdminMailboxesPage() {
  await requireAdmin();
  const [mailboxes, staff] = await Promise.all([
    prisma.mailbox.findMany({ orderBy: [{ shared: "asc" }, { address: "asc" }], include: { owner: true } }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "EMPLOYEE"] }, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Mailboxes"
        description="Connect Plesk mailboxes so staff can send and read email in the portal."
        action={<CreateMailboxForm staff={staff} />}
      />
      {mailboxes.length === 0 ? (
        <EmptyState>
          No mailboxes yet. Add each employee&apos;s <strong>@rowancopy.com</strong> address
          (and shared boxes like <strong>info@</strong>), then owners connect them from Mail settings.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {mailboxes.map((mb) => (
            <MailboxSettingsCard key={mb.id} mailbox={mb} isAdmin ownerName={mb.owner?.name} />
          ))}
        </div>
      )}
    </>
  );
}
