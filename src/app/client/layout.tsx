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
  const [unread, mailboxCount, account] = await Promise.all([
    getUnreadThreadCount(user.id),
    prisma.mailbox.count({ where: { ownerId: user.id, active: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { mailAdmin: true } }),
  ]);

  const nav: NavItem[] = [
    { href: "/client", label: "My projects" },
    { href: "/client/request", label: "New request" },
    { href: "/client/messages", label: "Messages", badge: unread || undefined },
    // Once a client has a mailbox, surface their inbox; otherwise just the request page.
    ...(mailboxCount > 0 ? [{ href: "/client/mail", label: "Mail" }] : []),
    // Customers with the mailbox-management switch on get a team-mail admin area.
    ...(account?.mailAdmin ? [{ href: "/client/team-email", label: "Team email" }] : []),
    { href: "/client/email", label: "Email account" },
    { href: "/client/profile", label: "My profile" },
  ];

  return (
    <PortalShell user={user} nav={nav}>
      {children}
    </PortalShell>
  );
}
