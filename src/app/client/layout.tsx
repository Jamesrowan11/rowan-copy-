import { requireRole } from "@/lib/authz";
import { getUnreadThreadCount } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { PortalShell, type NavItem } from "@/components/portal/PortalShell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("CLIENT");
  const [unread, mailboxCount] = await Promise.all([
    getUnreadThreadCount(user.id),
    prisma.mailbox.count({ where: { ownerId: user.id, active: true } }),
  ]);

  const nav: NavItem[] = [
    { href: "/client", label: "My projects" },
    { href: "/client/request", label: "New request" },
    { href: "/client/messages", label: "Messages", badge: unread || undefined },
    // Once a client has a mailbox, surface their inbox; otherwise just the request page.
    ...(mailboxCount > 0 ? [{ href: "/client/mail", label: "Mail" }] : []),
    { href: "/client/email", label: "Email account" },
    { href: "/client/profile", label: "My profile" },
  ];

  return (
    <PortalShell user={user} nav={nav}>
      {children}
    </PortalShell>
  );
}
