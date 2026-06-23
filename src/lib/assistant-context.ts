import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/authz";
import { SERVICES } from "@/lib/constants";

// Builds the data context the AI assistant is allowed to see for THIS user.
//
// SECURITY SPINE: every query here is scoped exactly like the pages the user can
// already open. An EMPLOYEE only ever sees their own assigned projects, the demos
// the leads page shows them, company announcements, and their own/shared mailbox
// addresses. An ADMIN sees admin-scoped data. We NEVER select passwordHash,
// mailbox passwords (passwordEnc), internal client/employee notes, env, or any
// other user's mailbox contents. Field selection is allow-list, not exclude.

function clip(s: string | null | undefined, max = 400): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function money(v: number | null | undefined): string {
  return v == null ? "—" : `$${v.toLocaleString("en-US")}`;
}

function date(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

const PRICING = SERVICES.map((s) => `- ${s.name}: ${s.startingPrice} — ${s.blurb}`).join(
  "\n",
);

export async function buildAssistantContext(
  me: SessionUser,
  route?: string,
): Promise<string> {
  const out: string[] = [];
  out.push("## Who you're helping");
  out.push(`Name: ${me.name}`);
  out.push(`Role: ${me.role}`);
  if (route) out.push(`Currently viewing: ${route}`);
  out.push("");

  out.push("## Rowan Copy published pricing (for pricing framing)");
  out.push(PRICING);
  out.push("");

  if (me.role === "ADMIN") {
    await adminContext(out);
  } else {
    await employeeContext(out, me);
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Employee scope — mirrors the staff pages exactly.
// ---------------------------------------------------------------------------

async function employeeContext(out: string[], me: SessionUser) {
  // Assigned projects only (same filter as /staff and /staff/projects/[id]).
  const projects = await prisma.project.findMany({
    where: { assigneeId: me.id, NOT: { status: "Cancelled" } },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
    take: 40,
    select: {
      title: true,
      type: true,
      status: true,
      dueDate: true,
      quotedPrice: true,
      revisionRoundsIncluded: true,
      revisionRoundsUsed: true,
      scope: true,
      client: { select: { name: true } },
    },
  });
  out.push(`## Your assigned projects (${projects.length})`);
  if (projects.length === 0) out.push("(none)");
  for (const p of projects) {
    out.push(
      `- "${p.title}" — ${p.type} — status ${p.status} — client ${p.client.name} — due ${date(p.dueDate)} — ${money(p.quotedPrice)} — revisions ${p.revisionRoundsUsed}/${p.revisionRoundsIncluded}\n  Scope: ${clip(p.scope)}`,
    );
  }
  out.push("");

  await demosSection(out);
  await announcementsSection(out);
  await mailboxesSection(out, me);
}

// ---------------------------------------------------------------------------
// Admin scope.
// ---------------------------------------------------------------------------

async function adminContext(out: string[]) {
  const [openInquiries, projects, plansActive, team] = await Promise.all([
    prisma.inquiry.findMany({
      where: { status: { in: ["New", "Reviewed"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { name: true, business: true, serviceType: true, budget: true, message: true, status: true },
    }),
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        title: true,
        type: true,
        status: true,
        dueDate: true,
        quotedPrice: true,
        client: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.monthlyPlan.count({ where: { active: true } }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { name: true, role: true, active: true },
    }),
  ]);

  out.push(`## Open inquiries (${openInquiries.length})`);
  if (openInquiries.length === 0) out.push("(none)");
  for (const i of openInquiries) {
    out.push(
      `- ${i.name}${i.business ? ` (${i.business})` : ""} — ${i.serviceType} — budget ${i.budget || "n/a"} — ${i.status}\n  ${clip(i.message, 200)}`,
    );
  }
  out.push("");

  out.push(`## Projects (${projects.length})`);
  for (const p of projects) {
    out.push(
      `- "${p.title}" — ${p.type} — ${p.status} — client ${p.client.name} — assignee ${p.assignee?.name ?? "unassigned"} — due ${date(p.dueDate)} — ${money(p.quotedPrice)}`,
    );
  }
  out.push("");

  out.push(`## Team (${team.length})`);
  for (const u of team) {
    out.push(`- ${u.name} — ${u.role}${u.active ? "" : " (inactive)"}`);
  }
  out.push(`Active monthly-plan clients: ${plansActive}`);
  out.push("");

  await demosSection(out);
  await announcementsSection(out);
}

// ---------------------------------------------------------------------------
// Shared sections (same data both roles can already see in the UI).
// ---------------------------------------------------------------------------

async function demosSection(out: string[]) {
  // The leads page shows all demos to both admin and staff (take 100); mirror it.
  const demos = await prisma.demo.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      businessName: true,
      city: true,
      industry: true,
      email: true,
      currentWebsite: true,
      status: true,
      liveUrl: true,
      researchSummary: true,
      emailSubject: true,
      emailBody: true,
      convertedProjectId: true,
    },
  });
  out.push(`## Lead-generator demos (${demos.length})`);
  if (demos.length === 0) out.push("(none)");
  for (const d of demos) {
    out.push(
      `- ${d.businessName} — ${d.city} — ${d.industry} — status ${d.convertedProjectId ? "Converted" : d.status}${d.liveUrl ? ` — live: ${d.liveUrl}` : ""}${d.email ? ` — contact: ${d.email}` : ""}`,
    );
    if (d.researchSummary) out.push(`  Research: ${clip(d.researchSummary, 500)}`);
    if (d.emailSubject) out.push(`  Draft email subject: ${clip(d.emailSubject, 150)}`);
    if (d.emailBody) out.push(`  Draft email body: ${clip(d.emailBody, 600)}`);
  }
  out.push("");
}

async function announcementsSection(out: string[]) {
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true, body: true, author: { select: { name: true } } },
  });
  out.push(`## Company announcements (${announcements.length})`);
  if (announcements.length === 0) out.push("(none)");
  for (const a of announcements) {
    out.push(`- ${a.title} (${a.author.name}): ${clip(a.body, 300)}`);
  }
  out.push("");
}

async function mailboxesSection(out: string[], me: SessionUser) {
  // Same access rule as the webmail (own + shared). Addresses/signature only —
  // NEVER the password or the inbox contents.
  const mailboxes = await prisma.mailbox.findMany({
    where: { active: true, OR: [{ ownerId: me.id }, { shared: true }] },
    orderBy: [{ shared: "asc" }, { address: "asc" }],
    select: { address: true, displayName: true, shared: true, signatureText: true },
  });
  if (mailboxes.length === 0) return;
  out.push(`## Your mailboxes (${mailboxes.length})`);
  for (const m of mailboxes) {
    out.push(
      `- ${m.address}${m.shared ? " (shared)" : ""} — display "${m.displayName}"${m.signatureText ? ` — signature: ${clip(m.signatureText, 200)}` : ""}`,
    );
  }
  out.push(
    "(You can see mailbox addresses and signatures only — not the inbox messages.)",
  );
  out.push("");
}
