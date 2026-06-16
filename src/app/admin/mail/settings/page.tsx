import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authz";

// Admins manage all mailboxes (including their own) on the Mailboxes page.
export default async function AdminMailSettingsRedirect() {
  await requireAdmin();
  redirect("/admin/mailboxes");
}
