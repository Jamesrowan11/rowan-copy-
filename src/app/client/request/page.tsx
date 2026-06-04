import { requireRole } from "@/lib/authz";
import { PageHeader } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { submitClientInquiry } from "../actions";
import { SERVICE_TYPES } from "@/lib/constants";

export default async function ClientRequestPage() {
  await requireRole("CLIENT");
  return (
    <>
      <PageHeader title="New request" description="Tell us what you need and we'll send a quote." />
      <div className="max-w-2xl">
        <section className="card p-6">
          <ActionForm action={submitClientInquiry} submitText="Send request" successText="Sent! We'll be in touch soon." resetOnSuccess>
            <div>
              <label className="label" htmlFor="serviceType">What do you need?</label>
              <select id="serviceType" name="serviceType" className="input" defaultValue={SERVICE_TYPES[0]}>
                {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="budget">Budget (optional)</label>
              <input id="budget" name="budget" className="input" placeholder="e.g. $300–$500" />
            </div>
            <div>
              <label className="label" htmlFor="message">Details</label>
              <textarea id="message" name="message" rows={5} className="input" placeholder="What are you trying to get written, and by when?" required />
            </div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
