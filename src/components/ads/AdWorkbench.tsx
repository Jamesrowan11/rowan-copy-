import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { AdGeneratorForm } from "./AdGeneratorForm";
import { CampaignCard } from "./CampaignCard";

type Campaign = {
  id: string;
  businessName: string;
  platform: string;
  objective: string | null;
  audience: string | null;
  budget: string | null;
  status: string;
  content: string | null;
  createdById: string;
  createdAt: Date;
  client: { name: string } | null;
};

export function AdWorkbench({
  clients,
  campaigns,
  isAdmin,
  userId,
}: {
  clients: { id: string; name: string }[];
  campaigns: Campaign[];
  isAdmin: boolean;
  userId: string;
}) {
  return (
    <>
      <PageHeader
        title="Ad writer"
        description="Generate ready-to-launch Google & Meta ad copy for your customers."
      />

      <div className="mb-8">
        <AdGeneratorForm clients={clients} />
      </div>

      <h2 className="mb-3 text-sm font-600 uppercase tracking-wide text-navy-400">
        Saved campaigns ({campaigns.length})
      </h2>
      {campaigns.length === 0 ? (
        <EmptyState>No campaigns yet. Fill in the form above and click <strong>Generate ads</strong>.</EmptyState>
      ) : (
        <div className="space-y-6">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              id={c.id}
              businessName={c.businessName}
              platform={c.platform}
              objective={c.objective}
              audience={c.audience}
              budget={c.budget}
              status={c.status}
              clientName={c.client?.name ?? null}
              created={fmtDateTime(c.createdAt)}
              content={c.content}
              canDelete={isAdmin || c.createdById === userId}
            />
          ))}
        </div>
      )}
    </>
  );
}
