import { requireAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/portal/ui";
import { MailView } from "@/components/mail/MailView";

export const dynamic = "force-dynamic";

function norm(raw: Record<string, string | string[] | undefined>) {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

export default async function AdminMailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAdmin();
  const sp = norm(await searchParams);
  return (
    <>
      <PageHeader title="Mail" description="Your inbox and shared mailboxes — read and send from the portal." />
      <MailView user={user} basePath="/admin/mail" searchParams={sp} />
    </>
  );
}
