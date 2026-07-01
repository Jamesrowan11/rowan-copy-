import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { AdWorkbench } from "@/components/ads/AdWorkbench";

export const dynamic = "force-dynamic";

export default async function StaffAdWriterPage() {
  const user = await requireRole("EMPLOYEE");
  const [clients, campaigns] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.adCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
  ]);

  return <AdWorkbench clients={clients} campaigns={campaigns} isAdmin={false} userId={user.id} />;
}
