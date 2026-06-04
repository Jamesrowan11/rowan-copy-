import { requireAdmin } from "@/lib/authz";
import { ProfilePanel } from "@/components/portal/ProfilePanel";

export default async function AdminProfilePage() {
  const me = await requireAdmin();
  return <ProfilePanel user={{ name: me.name, email: me.email, phone: me.phone }} />;
}
