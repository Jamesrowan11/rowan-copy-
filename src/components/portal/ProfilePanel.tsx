import { PageHeader } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { updateMyProfile, changeMyPassword } from "@/app/admin/actions";

export function ProfilePanel({
  user,
}: {
  user: { name: string; email: string; phone: string | null };
}) {
  return (
    <>
      <PageHeader title="My profile" description="Update your own contact info and password." />
      <div className="grid max-w-3xl gap-6 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-3 text-lg font-600 text-navy">Contact info</h2>
          <ActionForm action={updateMyProfile} submitText="Save" successText="Saved">
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
        </section>

        <section className="card p-6">
          <h2 className="mb-3 text-lg font-600 text-navy">Change password</h2>
          <ActionForm action={changeMyPassword} submitText="Update password" successText="Password updated" resetOnSuccess>
            <div>
              <label className="label" htmlFor="current">Current password</label>
              <input id="current" name="current" type="password" className="input" required autoComplete="current-password" />
            </div>
            <div>
              <label className="label" htmlFor="next">New password</label>
              <input id="next" name="next" type="password" className="input" required minLength={8} autoComplete="new-password" />
              <p className="mt-1 text-xs text-navy-400">At least 8 characters.</p>
            </div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
