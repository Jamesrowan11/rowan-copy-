import { requireAdmin } from "@/lib/authz";
import { getUnreadThreadCount } from "@/lib/messages";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const unread = await getUnreadThreadCount(user.id);

  const nav: NavItem[] = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/inquiries", label: "Inquiries" },
    { href: "/admin/projects", label: "Projects" },
    { href: "/admin/messages", label: "Messages", badge: unread || undefined },
    { href: "/admin/emails", label: "Compose email" },
    { href: "/admin/users", label: "Users & team" },
    { href: "/admin/plans", label: "Monthly plans" },
    { href: "/admin/announcements", label: "Announcements" },
    { href: "/admin/templates", label: "Templates" },
    { href: "/admin/reviews", label: "Reviews" },
    { href: "/admin/unmatched", label: "Unmatched inbox" },
    { href: "/admin/audit", label: "Audit log" },
    { href: "/admin/export", label: "Data export" },
    { href: "/admin/settings", label: "Signature & settings" },
    { href: "/admin/profile", label: "My profile" },
  ];

  return (
    <PortalShell user={user} nav={nav}>
      {children}
    </PortalShell>
  );
}
