import { requireRole } from "@/lib/authz";
import { ProfilePanel } from "@/components/portal/ProfilePanel";

export default async function ClientProfilePage() {
  const me = await requireRole("CLIENT");
  return <ProfilePanel user={{ name: me.name, email: me.email, phone: me.phone }} />;
}
