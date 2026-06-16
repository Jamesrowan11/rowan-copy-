import Link from "next/link";
import type { SessionUser } from "@/lib/authz";
import {
  mailboxesForUser,
  getMailboxForUser,
  mailboxIsConfigured,
  listFolders,
  listMessages,
  getMessage,
} from "@/lib/mail";
import { EmptyState } from "@/components/portal/ui";
import { ComposeForm } from "./ComposeForm";
import { MessageActions } from "./MessageActions";

type SP = Record<string, string | undefined>;

const PAGE_SIZE = 25;

function fmt(dateIso: string | null): string {
  if (!dateIso) return "";
  return new Date(dateIso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function MailView({
  user,
  basePath,
  searchParams,
}: {
  user: SessionUser;
  basePath: string;
  searchParams: SP;
}) {
  const mailboxes = await mailboxesForUser(user);

  if (mailboxes.length === 0) {
    return (
      <EmptyState>
        No mailbox is connected to your account yet.{" "}
        <Link href={`${basePath}/settings`} className="link">Connect a mailbox →</Link>
      </EmptyState>
    );
  }

  const selectedId = searchParams.mailbox || mailboxes[0].id;
  const mb = (await getMailboxForUser(selectedId, user)) || mailboxes[0];
  const folder = searchParams.folder || "INBOX";
  const settingsHref = `${basePath}/settings`;

  if (!mailboxIsConfigured(mb)) {
    return (
      <div className="space-y-4">
        <MailboxSwitcher mailboxes={mailboxes} selectedId={mb.id} basePath={basePath} folder={folder} />
        <EmptyState>
          <strong>{mb.address}</strong> isn&apos;t connected yet — its password is
          missing.{" "}
          <Link href={settingsHref} className="link">Connect it in Mail settings →</Link>
        </EmptyState>
      </div>
    );
  }

  // Load folders (best-effort). A failure here usually means bad credentials.
  let folders: { path: string; name: string; specialUse?: string }[] = [];
  let connError: string | null = null;
  try {
    folders = await listFolders(mb);
  } catch (e) {
    connError = e instanceof Error ? e.message : "Could not connect to the mailbox.";
  }

  if (connError) {
    return (
      <div className="space-y-4">
        <MailboxSwitcher mailboxes={mailboxes} selectedId={mb.id} basePath={basePath} folder={folder} />
        <div className="card border-red-200 p-6">
          <h2 className="text-lg font-600 text-red-700">Couldn&apos;t connect to {mb.address}</h2>
          <p className="mt-2 text-sm text-navy-600">{connError}</p>
          <Link href={settingsHref} className="btn-outline btn-sm mt-4">Check mailbox settings</Link>
        </div>
      </div>
    );
  }

  const composing = searchParams.compose === "1" || searchParams.reply === "1";
  const listHref = `${basePath}?mailbox=${mb.id}&folder=${encodeURIComponent(folder)}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
      {/* Sidebar */}
      <aside className="space-y-4">
        <Link href={`${basePath}?mailbox=${mb.id}&folder=${encodeURIComponent(folder)}&compose=1`} className="btn-primary w-full">
          Compose
        </Link>
        <MailboxSwitcher mailboxes={mailboxes} selectedId={mb.id} basePath={basePath} folder="INBOX" />
        <nav className="space-y-1">
          {folders.map((f) => {
            const active = f.path === folder;
            return (
              <Link
                key={f.path}
                href={`${basePath}?mailbox=${mb.id}&folder=${encodeURIComponent(f.path)}`}
                className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-navy text-white" : "text-navy-600 hover:bg-navy-50"}`}
              >
                {f.specialUse ? specialName(f.specialUse) : f.name}
              </Link>
            );
          })}
        </nav>
        <Link href={settingsHref} className="block px-3 text-xs text-navy-400 hover:text-navy">
          Mail settings
        </Link>
      </aside>

      {/* Main pane */}
      <section className="min-w-0">
        {composing ? (
          await renderCompose(mb, folder, basePath, searchParams, listHref)
        ) : searchParams.uid ? (
          await renderMessage(mb, folder, parseInt(searchParams.uid, 10), basePath, listHref)
        ) : (
          await renderList(mb, folder, basePath, searchParams)
        )}
      </section>
    </div>
  );
}

function MailboxSwitcher({
  mailboxes,
  selectedId,
  basePath,
  folder,
}: {
  mailboxes: { id: string; address: string; shared: boolean }[];
  selectedId: string;
  basePath: string;
  folder: string;
}) {
  if (mailboxes.length === 1) {
    return (
      <div className="rounded-lg border border-navy-100 px-3 py-2 text-sm font-600 text-navy">
        {mailboxes[0].address}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {mailboxes.map((m) => (
        <Link
          key={m.id}
          href={`${basePath}?mailbox=${m.id}&folder=${encodeURIComponent(folder)}`}
          className={`block truncate rounded-lg px-3 py-1.5 text-sm ${m.id === selectedId ? "bg-navy-100 font-600 text-navy" : "text-navy-600 hover:bg-navy-50"}`}
        >
          {m.address}{m.shared ? " (shared)" : ""}
        </Link>
      ))}
    </div>
  );
}

function specialName(use: string): string {
  const map: Record<string, string> = {
    "\\Inbox": "Inbox",
    "\\Sent": "Sent",
    "\\Drafts": "Drafts",
    "\\Junk": "Junk",
    "\\Trash": "Trash",
    "\\Archive": "Archive",
  };
  return map[use] || use.replace("\\", "");
}

async function renderList(
  mb: Awaited<ReturnType<typeof getMailboxForUser>> & object,
  folder: string,
  basePath: string,
  searchParams: SP,
) {
  const page = Math.max(0, parseInt(searchParams.page || "0", 10) || 0);
  let data: Awaited<ReturnType<typeof listMessages>>;
  try {
    data = await listMessages(mb, folder, page, PAGE_SIZE);
  } catch (e) {
    return (
      <div className="card border-red-200 p-6 text-sm text-red-700">
        Couldn&apos;t load this folder: {e instanceof Error ? e.message : "error"}
      </div>
    );
  }

  if (data.messages.length === 0) {
    return <EmptyState>No messages in this folder.</EmptyState>;
  }

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const mkHref = (uid: number) =>
    `${basePath}?mailbox=${mb.id}&folder=${encodeURIComponent(folder)}&uid=${uid}`;

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-card">
        <ul className="divide-y divide-navy-100">
          {data.messages.map((m) => (
            <li key={m.uid}>
              <Link href={mkHref(m.uid)} className="flex items-center gap-3 px-4 py-3 hover:bg-navy-50/50">
                {!m.seen && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                <span className={`w-40 shrink-0 truncate text-sm ${m.seen ? "text-navy-600" : "font-700 text-navy"}`}>
                  {m.fromName}
                </span>
                <span className={`min-w-0 flex-1 truncate text-sm ${m.seen ? "text-navy-600" : "font-600 text-navy"}`}>
                  {m.subject}
                  {m.hasAttachments && <span className="ml-2 text-navy-400" aria-label="has attachment">📎</span>}
                </span>
                <span className="shrink-0 text-xs text-navy-400">{fmt(m.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-navy-400">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 0 && (
              <Link href={`${basePath}?mailbox=${mb.id}&folder=${encodeURIComponent(folder)}&page=${page - 1}`} className="btn-outline btn-sm">Newer</Link>
            )}
            {page + 1 < totalPages && (
              <Link href={`${basePath}?mailbox=${mb.id}&folder=${encodeURIComponent(folder)}&page=${page + 1}`} className="btn-outline btn-sm">Older</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

async function renderMessage(
  mb: Awaited<ReturnType<typeof getMailboxForUser>> & object,
  folder: string,
  uid: number,
  basePath: string,
  listHref: string,
) {
  let msg: Awaited<ReturnType<typeof getMessage>>;
  try {
    msg = await getMessage(mb, folder, uid, true);
  } catch (e) {
    return (
      <div className="card border-red-200 p-6 text-sm text-red-700">
        Couldn&apos;t open this message: {e instanceof Error ? e.message : "error"}
      </div>
    );
  }
  if (!msg) return <EmptyState>Message not found.</EmptyState>;

  const replyDefaults = encodeURIComponent(JSON.stringify({ uid }));
  const replyHref = `${basePath}?mailbox=${mb.id}&folder=${encodeURIComponent(folder)}&uid=${uid}&reply=1&r=${replyDefaults}`;

  return (
    <article className="card p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Link href={listHref} className="text-sm text-navy-500 hover:text-navy">← Back</Link>
        <div className="flex items-center gap-2">
          <Link href={replyHref} className="btn-primary btn-sm">Reply</Link>
          <MessageActions mailboxId={mb.id} folder={folder} uid={uid} seen listHref={listHref} />
        </div>
      </div>

      <h1 className="text-xl font-700 text-navy">{msg.subject}</h1>
      <div className="mt-2 border-b border-navy-100 pb-3 text-sm text-navy-500">
        <p><span className="font-600 text-navy-700">{msg.fromName}</span> &lt;{msg.from}&gt;</p>
        <p>To: {msg.to}{msg.cc ? ` · Cc: ${msg.cc}` : ""}</p>
        <p className="text-xs">{fmt(msg.date)}</p>
      </div>

      <div className="prose-narrow mt-4 whitespace-pre-wrap text-sm text-navy-700">
        {msg.text || "(no text content)"}
      </div>

      {msg.attachments.length > 0 && (
        <div className="mt-5 border-t border-navy-100 pt-4">
          <p className="mb-2 text-xs font-600 uppercase tracking-wide text-navy-400">Attachments</p>
          <ul className="flex flex-wrap gap-2">
            {msg.attachments.map((a) => (
              <li key={a.index}>
                <a
                  href={`/api/mail/${mb.id}/attachment?folder=${encodeURIComponent(folder)}&uid=${uid}&index=${a.index}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-navy-200 px-3 py-1.5 text-sm text-navy-700 hover:bg-navy-50"
                >
                  📎 {a.filename}
                  <span className="text-xs text-navy-400">{(a.size / 1024).toFixed(0)} KB</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

async function renderCompose(
  mb: Awaited<ReturnType<typeof getMailboxForUser>> & object,
  folder: string,
  basePath: string,
  searchParams: SP,
  listHref: string,
) {
  let defaults: { to?: string; subject?: string; body?: string; inReplyTo?: string; references?: string } = {};
  let title = "New message";

  if (searchParams.reply === "1" && searchParams.uid) {
    const uid = parseInt(searchParams.uid, 10);
    try {
      const orig = await getMessage(mb, folder, uid, false);
      if (orig) {
        title = "Reply";
        const quoted = orig.text
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n");
        defaults = {
          to: orig.from,
          subject: orig.subject.startsWith("Re:") ? orig.subject : `Re: ${orig.subject}`,
          body: `\n\nOn ${fmt(orig.date)}, ${orig.fromName} wrote:\n${quoted}`,
          inReplyTo: orig.messageId || "",
          references: [orig.references, orig.messageId].filter(Boolean).join(" "),
        };
      }
    } catch {
      /* fall back to a blank reply */
    }
  }

  return (
    <ComposeForm
      mailboxId={mb.id}
      fromAddress={`${mb.displayName} <${mb.address}>`}
      backHref={listHref}
      title={title}
      defaults={defaults}
    />
  );
}
