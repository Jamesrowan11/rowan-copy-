import { requireRole } from "@/lib/authz";
import { ProfilePanel } from "@/components/portal/ProfilePanel";

export default async function StaffProfilePage() {
  const me = await requireRole("EMPLOYEE");
  return <ProfilePanel user={{ name: me.name, email: me.email, phone: me.phone }} />;
}
