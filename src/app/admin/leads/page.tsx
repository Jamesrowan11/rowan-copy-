import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/portal/ui";
import { LeadsManager } from "@/components/leads/LeadsManager";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  await requireAdmin();
  const demos = await prisma.demo.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <>
      <PageHeader
        title="Lead generator"
        description="Research a business, auto-build a sample site, deploy it live, and draft outreach."
      />
      <LeadsManager
        basePath="/admin"
        demos={demos.map((d) => ({
          id: d.id,
          businessName: d.businessName,
          city: d.city,
          industry: d.industry,
          email: d.email,
          status: d.status,
          liveUrl: d.liveUrl,
          emailSubject: d.emailSubject,
          emailBody: d.emailBody,
          foundExistingSite: d.foundExistingSite,
          currentWebsite: d.currentWebsite,
          researchSummary: d.researchSummary,
          score: d.score,
          tier: d.tier,
          lastEditInstruction: d.lastEditInstruction,
          lastEditedAt: d.lastEditedAt ? d.lastEditedAt.toISOString() : null,
          customDomain: d.customDomain,
          customDomainStatus: d.customDomainStatus,
          lastDnsCheck: d.lastDnsCheck,
          convertedProjectId: d.convertedProjectId,
          createdAt: d.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
