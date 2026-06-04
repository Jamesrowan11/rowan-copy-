import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import {
  PageHeader,
  StatusBadge,
  Money,
  fmtDate,
  fmtDateTime,
} from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { DocumentUpload } from "@/components/portal/DocumentUpload";
import { PaymentForm } from "@/components/portal/PaymentForm";
import {
  updateUser,
  setUserPassword,
  toggleUserActive,
  deleteUser,
  addClientNote,
  deleteClientNote,
  addEmployeeNote,
  deleteEmployeeNote,
  saveBrandVoice,
  saveMonthlyPlan,
  deleteDocument,
  markPaymentPaid,
  deletePayment,
} from "../../actions";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      brandVoiceProfile: true,
      monthlyPlan: true,
      clientNotesAbout: { include: { author: true }, orderBy: { createdAt: "desc" } },
      employeeNotesAbout: { include: { author: true }, orderBy: { createdAt: "desc" } },
      projectsAsClient: { orderBy: { updatedAt: "desc" } },
      projectsAsAssignee: { include: { client: true }, orderBy: { updatedAt: "desc" } },
      clientDocuments: { orderBy: { createdAt: "desc" } },
      paymentsAsClient: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!user) notFound();
  const role = user.role as Role;

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/users" className="text-sm text-navy-500 hover:text-navy">← All users</Link>
      </div>
      <PageHeader
        title={user.name}
        description={`${ROLE_LABELS[role]} · ${user.email}`}
        action={user.active
          ? <span className="badge bg-emerald-100 text-emerald-700">Active</span>
          : <span className="badge bg-red-100 text-red-700">Inactive</span>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit info */}
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-600 text-navy">Account info</h2>
          <ActionForm action={updateUser} hidden={{ id: user.id }} submitText="Save" successText="Saved">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" className="input" defaultValue={user.name} required />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="input" defaultValue={user.email} required />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" name="phone" className="input" defaultValue={user.phone ?? ""} />
            </div>
          </ActionForm>

          <div className="mt-5 border-t border-navy-100 pt-4">
            <h3 className="mb-2 text-sm font-600 text-navy">Set / reset password</h3>
            <ActionForm action={setUserPassword} hidden={{ id: user.id }} submitText="Set password" successText="Password set" resetOnSuccess>
              <input name="password" type="text" className="input" minLength={8} placeholder="New password (8+ chars)" required />
            </ActionForm>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-navy-100 pt-4">
            {user.id !== admin.id && (
              <ConfirmButton
                action={toggleUserActive.bind(null, user.id)}
                confirm={user.active ? "Deactivate this account? They won't be able to log in." : "Reactivate this account?"}
                className={user.active ? "btn-outline btn-sm" : "btn-navy btn-sm"}
              >
                {user.active ? "Deactivate" : "Activate"}
              </ConfirmButton>
            )}
            {user.id !== admin.id && (
              <ConfirmButton
                action={deleteUser.bind(null, user.id)}
                confirm="Delete this user permanently? Deactivate is usually safer."
                className="btn-danger btn-sm"
              >
                Delete
              </ConfirmButton>
            )}
          </div>
        </section>

        {/* Role-specific: CLIENT */}
        {role === "CLIENT" && (
          <>
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-600 text-navy">Monthly plan ($30/mo)</h2>
              <ActionForm action={saveMonthlyPlan} hidden={{ clientId: user.id }} submitText="Save plan" successText="Saved">
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  <input type="checkbox" name="active" defaultChecked={user.monthlyPlan?.active ?? false} className="rounded" />
                  Active hosting + upkeep plan
                </label>
                <div>
                  <label className="label" htmlFor="renewalDate">Renewal date</label>
                  <input id="renewalDate" name="renewalDate" type="date" className="input"
                    defaultValue={user.monthlyPlan?.renewalDate ? user.monthlyPlan.renewalDate.toISOString().slice(0, 10) : ""} />
                </div>
              </ActionForm>
            </section>

            <section className="card p-5">
              <h2 className="mb-3 text-lg font-600 text-navy">Brand voice profile</h2>
              <ActionForm action={saveBrandVoice} hidden={{ clientId: user.id }} submitText="Save profile" successText="Saved">
                <div>
                  <label className="label" htmlFor="tone">Tone</label>
                  <input id="tone" name="tone" className="input" defaultValue={user.brandVoiceProfile?.tone ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="keyTerms">Key terms</label>
                  <input id="keyTerms" name="keyTerms" className="input" defaultValue={user.brandVoiceProfile?.keyTerms ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="bannedCliches">Banned clichés</label>
                  <input id="bannedCliches" name="bannedCliches" className="input" defaultValue={user.brandVoiceProfile?.bannedCliches ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="notes">Notes</label>
                  <textarea id="notes" name="notes" rows={2} className="input" defaultValue={user.brandVoiceProfile?.notes ?? ""} />
                </div>
              </ActionForm>
            </section>

            <section className="card p-5 lg:col-span-2">
              <h2 className="mb-3 text-lg font-600 text-navy">Projects</h2>
              {user.projectsAsClient.length === 0 ? (
                <p className="text-sm text-navy-400">No projects yet.</p>
              ) : (
                <ul className="divide-y divide-navy-100">
                  {user.projectsAsClient.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                      <Link href={`/admin/projects/${p.id}`} className="text-sm font-600 text-navy hover:text-accent-hover">
                        {p.title}
                      </Link>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-5">
              <h2 className="mb-3 text-lg font-600 text-navy">Deliverables & documents</h2>
              <DocumentUpload clientId={user.id} />
              <ul className="mt-4 space-y-2">
                {user.clientDocuments.length === 0 && <li className="text-sm text-navy-400">No files.</li>}
                {user.clientDocuments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 p-2.5">
                    <a href={`/api/documents/${d.id}`} className="link truncate text-sm">{d.originalName}</a>
                    <ConfirmButton action={deleteDocument.bind(null, d.id)} confirm="Delete this file?" className="text-xs text-red-500 hover:underline">Delete</ConfirmButton>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5">
              <h2 className="mb-3 text-lg font-600 text-navy">Payments</h2>
              <PaymentForm clientId={user.id} />
              <ul className="mt-4 space-y-2">
                {user.paymentsAsClient.length === 0 && <li className="text-sm text-navy-400">No payments.</li>}
                {user.paymentsAsClient.map((p) => (
                  <li key={p.id} className="rounded-lg border border-navy-100 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-600 text-navy">{p.description}</p>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="text-xs text-navy-500"><Money value={p.amount} /> · <a href={p.stripeUrl} target="_blank" rel="noreferrer" className="link">link</a></p>
                    <div className="mt-2 flex gap-3">
                      {p.status !== "Paid" && (
                        <ConfirmButton action={markPaymentPaid.bind(null, p.id)} className="text-xs text-emerald-600 hover:underline">Mark paid</ConfirmButton>
                      )}
                      <ConfirmButton action={deletePayment.bind(null, p.id)} confirm="Delete payment?" className="text-xs text-red-500 hover:underline">Delete</ConfirmButton>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card p-5 lg:col-span-2">
              <h2 className="text-lg font-600 text-navy">Internal client notes</h2>
              <p className="mb-3 text-xs text-navy-500">Staff-only — never visible to the client.</p>
              <ActionForm action={addClientNote} hidden={{ clientUserId: user.id }} submitText="Add note" resetOnSuccess>
                <textarea name="body" rows={2} className="input" placeholder="Add an internal note about this client…" required />
              </ActionForm>
              <ul className="mt-4 space-y-3">
                {user.clientNotesAbout.length === 0 && <li className="text-sm text-navy-400">No notes.</li>}
                {user.clientNotesAbout.map((n) => (
                  <li key={n.id} className="rounded-lg border border-navy-100 bg-navy-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-600 text-navy-600">{n.author.name} · {fmtDateTime(n.createdAt)}</p>
                      <ConfirmButton action={deleteClientNote.bind(null, n.id)} confirm="Delete this note?" className="text-xs text-red-500 hover:underline">Delete</ConfirmButton>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">{n.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {/* Role-specific: EMPLOYEE / ADMIN */}
        {role !== "CLIENT" && (
          <>
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-600 text-navy">Assigned projects</h2>
              {user.projectsAsAssignee.length === 0 ? (
                <p className="text-sm text-navy-400">Nothing assigned.</p>
              ) : (
                <ul className="divide-y divide-navy-100">
                  {user.projectsAsAssignee.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                      <Link href={`/admin/projects/${p.id}`} className="text-sm font-600 text-navy hover:text-accent-hover">
                        {p.title} <span className="text-navy-400">· {p.client.name}</span>
                      </Link>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card p-5">
              <h2 className="text-lg font-600 text-navy">Employee notes</h2>
              <p className="mb-3 text-xs text-navy-500">Admin-only — never visible to this employee or others.</p>
              <ActionForm action={addEmployeeNote} hidden={{ employeeUserId: user.id }} submitText="Add note" resetOnSuccess>
                <textarea name="body" rows={2} className="input" placeholder="Private note about this team member…" required />
              </ActionForm>
              <ul className="mt-4 space-y-3">
                {user.employeeNotesAbout.length === 0 && <li className="text-sm text-navy-400">No notes.</li>}
                {user.employeeNotesAbout.map((n) => (
                  <li key={n.id} className="rounded-lg border border-navy-100 bg-navy-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-600 text-navy-600">{n.author.name} · {fmtDateTime(n.createdAt)}</p>
                      <ConfirmButton action={deleteEmployeeNote.bind(null, n.id)} confirm="Delete this note?" className="text-xs text-red-500 hover:underline">Delete</ConfirmButton>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">{n.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}
