import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { TestMailboxButton } from "./TestMailboxButton";
import { updateMailboxSettings, setMailboxPassword, deleteMailbox } from "@/server/mail";
import type { Mailbox } from "@prisma/client";

export function MailboxSettingsCard({
  mailbox,
  isAdmin,
  ownerName,
}: {
  mailbox: Mailbox;
  isAdmin: boolean;
  ownerName?: string | null;
}) {
  const configured = !!mailbox.passwordEnc;
  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-600 text-navy">{mailbox.address}</h3>
          <p className="text-xs text-navy-400">
            {mailbox.shared ? "Shared mailbox" : `Owner: ${ownerName ?? "—"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {configured ? (
            <span className="badge bg-emerald-100 text-emerald-700">Password set</span>
          ) : (
            <span className="badge bg-amber-100 text-amber-700">Not connected</span>
          )}
          {isAdmin && (
            <ConfirmButton
              action={deleteMailbox.bind(null, mailbox.id)}
              confirm={`Delete mailbox ${mailbox.address}? This only removes it from the portal, not from the mail server.`}
              className="text-xs text-red-500 hover:underline"
            >
              Delete
            </ConfirmButton>
          )}
        </div>
      </div>

      {configured && (
        <div className="mb-4">
          <TestMailboxButton mailboxId={mailbox.id} />
        </div>
      )}

      {/* Password */}
      <div className="mb-5 border-t border-navy-100 pt-4">
        <h4 className="mb-2 text-sm font-600 text-navy">Mailbox password</h4>
        <ActionForm action={setMailboxPassword} hidden={{ id: mailbox.id }} submitText={configured ? "Update password" : "Connect mailbox"} successText="Saved & encrypted" resetOnSuccess>
          <input name="password" type="password" className="input" placeholder="Mailbox password" autoComplete="new-password" required />
          <p className="text-xs text-navy-400">Stored encrypted (AES-256-GCM). Used to send and read mail.</p>
        </ActionForm>
      </div>

      {/* Display name + signature (+ connection for admins) */}
      <div className="border-t border-navy-100 pt-4">
        <h4 className="mb-2 text-sm font-600 text-navy">Identity & signature</h4>
        <ActionForm action={updateMailboxSettings} hidden={{ id: mailbox.id }} submitText="Save" successText="Saved">
          <div>
            <label className="label" htmlFor={`dn-${mailbox.id}`}>Display name</label>
            <input id={`dn-${mailbox.id}`} name="displayName" className="input" defaultValue={mailbox.displayName} />
          </div>
          <div>
            <label className="label" htmlFor={`sig-${mailbox.id}`}>Signature (plain text)</label>
            <textarea id={`sig-${mailbox.id}`} name="signatureText" rows={4} className="input" defaultValue={mailbox.signatureText ?? ""}
              placeholder={"Your Name\nRowan Copy\ninfo@rowancopy.com"} />
          </div>
          <div>
            <label className="label" htmlFor={`sigh-${mailbox.id}`}>Signature (HTML, optional)</label>
            <textarea id={`sigh-${mailbox.id}`} name="signatureHtml" rows={3} className="input font-mono text-xs" defaultValue={mailbox.signatureHtml ?? ""} />
          </div>

          {isAdmin && (
            <details className="rounded-lg border border-navy-100 p-3">
              <summary className="cursor-pointer text-sm font-600 text-navy">Server connection (advanced)</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field id={`u-${mailbox.id}`} name="username" label="Username" value={mailbox.username} />
                <div />
                <Field id={`ih-${mailbox.id}`} name="imapHost" label="IMAP host" value={mailbox.imapHost} />
                <Field id={`ip-${mailbox.id}`} name="imapPort" label="IMAP port" value={String(mailbox.imapPort)} />
                <Field id={`sh-${mailbox.id}`} name="smtpHost" label="SMTP host" value={mailbox.smtpHost} />
                <Field id={`sp-${mailbox.id}`} name="smtpPort" label="SMTP port" value={String(mailbox.smtpPort)} />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-navy-600">
                <input type="checkbox" name="smtpSecure" defaultChecked={mailbox.smtpSecure} className="rounded" /> SMTP implicit TLS (port 465)
              </label>
              <input type="hidden" name="imapSecure" value="on" />
            </details>
          )}
        </ActionForm>
      </div>
    </div>
  );
}

function Field({ id, name, label, value }: { id: string; name: string; label: string; value: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} name={name} className="input" defaultValue={value} />
    </div>
  );
}
