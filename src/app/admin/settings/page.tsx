import { requireAdmin } from "@/lib/authz";
import { getSignature } from "@/lib/signature";
import { PageHeader } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { updateSignature } from "../actions";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const sig = await getSignature();
  const emailMode = process.env.RESEND_API_KEY ? "Resend (live email)" : "Console log (no API key set)";

  return (
    <>
      <PageHeader title="Signature & settings" description="The company email signature is appended to every email automatically." />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-3 text-lg font-600 text-navy">Company email signature</h2>
          <ActionForm action={updateSignature} submitText="Save signature" successText="Saved">
            <div>
              <label className="label" htmlFor="text">Plain-text signature</label>
              <textarea id="text" name="text" rows={6} className="input font-mono text-sm" defaultValue={sig.text} required />
            </div>
            <div>
              <label className="label" htmlFor="html">HTML signature (optional — auto-generated if blank)</label>
              <textarea id="html" name="html" rows={6} className="input font-mono text-xs" defaultValue={sig.html} />
            </div>
          </ActionForm>
        </section>

        <section className="space-y-6">
          <div className="card p-6">
            <h2 className="mb-2 text-lg font-600 text-navy">Signature preview</h2>
            <div className="rounded-lg border border-navy-100 p-4" dangerouslySetInnerHTML={{ __html: sig.html }} />
          </div>
          <div className="card p-6">
            <h2 className="mb-2 text-lg font-600 text-navy">Email delivery</h2>
            <p className="text-sm text-navy-600">
              Current mode: <strong className="text-navy">{emailMode}</strong>
            </p>
            <p className="mt-2 text-xs text-navy-500">
              Set <code className="rounded bg-navy-50 px-1">RESEND_API_KEY</code> in the environment to send real email.
              Without it, every email is logged to the server console and recorded in the sent history.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
