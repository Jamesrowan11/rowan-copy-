import { requireRole } from "@/lib/authz";
import { getUnreadThreadCount } from "@/lib/messages";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("EMPLOYEE");
  const unread = await getUnreadThreadCount(user.id);

  const nav: NavItem[] = [
    { href: "/staff", label: "My projects" },
    { href: "/staff/mail", label: "Mail" },
    { href: "/staff/messages", label: "Messages", badge: unread || undefined },
    { href: "/staff/emails", label: "Compose email" },
    { href: "/staff/templates", label: "Templates" },
    { href: "/staff/profile", label: "My profile" },
  ];

  return (
    <PortalShell user={user} nav={nav}>
      {children}
    </PortalShell>
  );
}
