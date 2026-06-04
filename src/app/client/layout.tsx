import { requireRole } from "@/lib/authz";
import { getUnreadThreadCount } from "@/lib/messages";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("CLIENT");
  const unread = await getUnreadThreadCount(user.id);

  const nav: NavItem[] = [
    { href: "/client", label: "My projects" },
    { href: "/client/request", label: "New request" },
    { href: "/client/messages", label: "Messages", badge: unread || undefined },
    { href: "/client/profile", label: "My profile" },
  ];

  return (
    <PortalShell user={user} nav={nav}>
      {children}
    </PortalShell>
  );
}
