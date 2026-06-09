import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Automation engine
//
// Every hands-off behavior in the app runs through here, gated by an
// admin-toggleable setting (Admin → Signature & settings → Automations).
// Missing settings default to ON, so the studio is fully automated out of the
// box and nothing needs seeding.
// ---------------------------------------------------------------------------

const appUrl = process.env.APP_URL || "http://localhost:3000";

export const AUTOMATIONS = [
  {
    key: "inquiryAutoReply",
    label: "Inquiry auto-reply",
    description:
      "Instantly email anyone who submits the contact form a confirmation that their request landed.",
  },
  {
    key: "inquiryAdminAlert",
    label: "New-inquiry alerts",
    description:
      "Email every admin the moment a new inquiry or client request comes in.",
  },
  {
    key: "statusClientUpdates",
    label: "Project status updates to clients",
    description:
      "Email the client automatically when their quote is sent, work starts, or a draft is delivered.",
  },
  {
    key: "testimonialOnClose",
    label: "Testimonial request on close",
    description:
      "When a project is closed, automatically email the client a review request (once per project).",
  },
  {
    key: "welcomeEmail",
    label: "Client welcome email",
    description:
      "When an inquiry is converted and a new client account is created, email them their login details.",
  },
  {
    key: "scheduledReminders",
    label: "Scheduled reminders",
    description:
      "Due-soon reminders to assignees, overdue alerts to admins, and monthly-plan renewal reminders to clients (via the scheduled run).",
  },
  {
    key: "dailyDigest",
    label: "Admin daily digest",
    description:
      "Include the open-inquiries / due-soon summary email to admins in the scheduled run.",
  },
] as const;

export type AutomationKey = (typeof AUTOMATIONS)[number]["key"];

const SETTING_PREFIX = "automation.";

export async function isAutomationEnabled(key: AutomationKey): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: SETTING_PREFIX + key },
  });
  // Default ON when unset.
  return setting ? setting.value === "on" : true;
}

export async function setAutomationEnabled(key: AutomationKey, enabled: boolean) {
  await prisma.appSetting.upsert({
    where: { key: SETTING_PREFIX + key },
    create: { key: SETTING_PREFIX + key, value: enabled ? "on" : "off" },
    update: { value: enabled ? "on" : "off" },
  });
}

export async function getAutomationStates(): Promise<
  { key: AutomationKey; label: string; description: string; enabled: boolean }[]
> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { startsWith: SETTING_PREFIX } },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));
  return AUTOMATIONS.map((a) => ({
    ...a,
    enabled: (map.get(SETTING_PREFIX + a.key) ?? "on") === "on",
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function activeAdmins() {
  return prisma.user.findMany({ where: { role: "ADMIN", active: true } });
}

/**
 * Dedupe guard for scheduled reminders: true if an email with this subject was
 * already sent to this recipient in the last `days` days. Keeps daily cron runs
 * from re-nagging people about the same project/renewal.
 */
async function alreadySentRecently(
  to: string,
  subject: string,
  days: number,
): Promise<boolean> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const existing = await prisma.emailLog.findFirst({
    where: {
      subject,
      to: { contains: to },
      direction: "outbound",
      createdAt: { gte: since },
    },
  });
  return !!existing;
}

// ---------------------------------------------------------------------------
// Event automations (fired from server actions)
// ---------------------------------------------------------------------------

/** New inquiry (public contact form or client portal). */
export async function onInquiryCreated(inquiry: {
  id: string;
  name: string;
  email: string;
  business?: string | null;
  serviceType: string;
  message: string;
  source: string;
}) {
  // 1. Auto-reply to the person who asked.
  if (inquiry.source === "public" && (await isAutomationEnabled("inquiryAutoReply"))) {
    await sendEmail({
      to: [inquiry.email],
      subject: "Got your request — Rowan Copy",
      text: `Hi ${inquiry.name},\n\nThanks for reaching out about ${inquiry.serviceType.toLowerCase()}. Your request just landed in my inbox, and I'll get back to you with a quote and any questions — usually within one business day.\n\nIn the meantime, feel free to reply to this email with anything you'd like to add.\n\nTalk soon,`,
    });
  }

  // 2. Alert the admins.
  if (await isAutomationEnabled("inquiryAdminAlert")) {
    const admins = await activeAdmins();
    if (admins.length) {
      await sendEmail({
        to: admins.map((a) => a.email),
        subject: `New inquiry: ${inquiry.name}${inquiry.business ? ` (${inquiry.business})` : ""} — ${inquiry.serviceType}`,
        text: `A new request just came in${inquiry.source !== "public" ? ` via the ${inquiry.source}` : " from the website"}.\n\nFrom: ${inquiry.name} <${inquiry.email}>\nService: ${inquiry.serviceType}\n\n${inquiry.message}\n\nReview it: ${appUrl}/admin/inquiries`,
        appendSignature: false,
      });
    }
  }
}

/** A client account was auto-created while converting an inquiry. */
export async function onClientAccountCreated(client: {
  name: string;
  email: string;
  tempPassword: string;
}) {
  if (!(await isAutomationEnabled("welcomeEmail"))) return;
  await sendEmail({
    to: [client.email],
    subject: "Your Rowan Copy client portal is ready",
    text: `Hi ${client.name},\n\nI've set up your client portal — it's where you'll see your project's progress, review drafts, and message me directly.\n\nLog in here: ${appUrl}/login\nEmail: ${client.email}\nTemporary password: ${client.tempPassword}\n\nPlease change your password after your first login (My Profile → Change password).\n\nLooking forward to working together,`,
  });
}

/** Project status changed (admin or staff). */
export async function onProjectStatusChanged(projectId: string, newStatus: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true, assignee: true },
  });
  if (!project) return;
  const client = project.client;
  const portalLink = `${appUrl}/client/projects/${project.id}`;

  if (await isAutomationEnabled("statusClientUpdates")) {
    if (newStatus === "In Progress") {
      await sendEmail({
        to: [client.email],
        subject: `Work has started: ${project.title}`,
        text: `Hi ${client.name},\n\nGood news — writing is underway on "${project.title}". You can follow progress anytime in your portal:\n\n${portalLink}\n\nIf you haven't filled in the project brief yet, now's the perfect time; it makes the first draft sharper.`,
      });
    } else if (newStatus === "Draft Delivered") {
      await sendEmail({
        to: [client.email],
        subject: `Your draft is ready: ${project.title}`,
        text: `Hi ${client.name},\n\nThe draft for "${project.title}" is ready for your review. Read it in your portal, then approve it or request changes — whichever fits.\n\n${portalLink}\n\nThanks!`,
      });
    } else if (newStatus === "Closed") {
      await sendEmail({
        to: [client.email],
        subject: `All wrapped up: ${project.title}`,
        text: `Hi ${client.name},\n\n"${project.title}" is officially closed. Everything we delivered stays available in your portal whenever you need it.\n\n${portalLink}\n\nIt was a pleasure — come back anytime.`,
      });
    }
  }

  // Auto testimonial request on close (once per project).
  if (newStatus === "Closed" && (await isAutomationEnabled("testimonialOnClose"))) {
    const existing = await prisma.review.findFirst({ where: { projectId } });
    if (!existing) {
      const token = crypto.randomBytes(16).toString("hex");
      await prisma.review.create({
        data: {
          clientId: project.clientId,
          projectId,
          authorName: client.name,
          status: "Requested",
          token,
        },
      });
      await sendEmail({
        to: [client.email],
        subject: "How did we do? A quick favor from Rowan Copy",
        text: `Hi ${client.name},\n\nNow that "${project.title}" is wrapped up, would you mind leaving a short review? It takes a minute and helps a lot.\n\n${appUrl}/review/${token}\n\nThank you!`,
      });
      await audit({
        action: "create",
        entityType: "Review",
        entityId: projectId,
        summary: `Auto-sent testimonial request for "${project.title}" on close`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Scheduled automations (fired by /api/automations/run on a cron)
// ---------------------------------------------------------------------------

export async function runScheduledAutomations() {
  const results = {
    dueSoonReminders: 0,
    overdueAlerts: 0,
    renewalReminders: 0,
    digestSent: false,
  };

  const now = Date.now();
  const in48h = new Date(now + 48 * 60 * 60 * 1000);
  const in5d = new Date(now + 5 * 24 * 60 * 60 * 1000);
  const ACTIVE = ["Quote Sent", "Accepted", "In Progress", "Draft Delivered", "Revisions"];

  if (await isAutomationEnabled("scheduledReminders")) {
    // 1. Due-soon reminders to assignees (deduped per project per 2 days).
    const dueSoon = await prisma.project.findMany({
      where: {
        status: { in: ACTIVE },
        dueDate: { not: null, gte: new Date(now), lte: in48h },
        assigneeId: { not: null },
      },
      include: { assignee: true, client: true },
    });
    for (const p of dueSoon) {
      if (!p.assignee?.active) continue;
      const subject = `Due soon: ${p.title}`;
      if (await alreadySentRecently(p.assignee.email, subject, 2)) continue;
      const base = p.assignee.role === "ADMIN" ? "/admin" : "/staff";
      await sendEmail({
        to: [p.assignee.email],
        subject,
        text: `Heads up — "${p.title}" for ${p.client.name} is due ${p.dueDate?.toLocaleDateString("en-US")}.\n\n${appUrl}${base}/projects/${p.id}`,
        appendSignature: false,
      });
      results.dueSoonReminders++;
    }

    // 2. Overdue alert to admins (one combined email, deduped daily).
    const overdue = await prisma.project.findMany({
      where: { status: { in: ACTIVE }, dueDate: { not: null, lt: new Date(now) } },
      include: { client: true, assignee: true },
      orderBy: { dueDate: "asc" },
    });
    if (overdue.length) {
      const admins = await activeAdmins();
      const subject = `Overdue projects: ${overdue.length}`;
      if (admins.length && !(await alreadySentRecently(admins[0].email, subject, 1))) {
        await sendEmail({
          to: admins.map((a) => a.email),
          subject,
          text:
            `These projects are past their due date:\n\n` +
            overdue
              .map(
                (p) =>
                  `  • ${p.title} — ${p.client.name} — ${p.assignee?.name ?? "Unassigned"} — was due ${p.dueDate?.toLocaleDateString("en-US")}`,
              )
              .join("\n") +
            `\n\n${appUrl}/admin/projects`,
          appendSignature: false,
        });
        results.overdueAlerts = overdue.length;
      }
    }

    // 3. Monthly-plan renewal reminders to clients (deduped per renewal window).
    const renewals = await prisma.monthlyPlan.findMany({
      where: { active: true, renewalDate: { not: null, gte: new Date(now), lte: in5d } },
      include: { client: true },
    });
    for (const plan of renewals) {
      if (!plan.client.active) continue;
      const dateLabel = plan.renewalDate!.toLocaleDateString("en-US");
      const subject = `Your Rowan Copy plan renews ${dateLabel}`;
      if (await alreadySentRecently(plan.client.email, subject, 6)) continue;
      await sendEmail({
        to: [plan.client.email],
        subject,
        text: `Hi ${plan.client.name},\n\nA quick heads up: your $30/month hosting + upkeep plan renews on ${dateLabel}. No action needed — this is just so it's never a surprise.\n\nNeed a content update before then? It's included: ${appUrl}/client`,
      });
      results.renewalReminders++;
    }
  }

  // 4. Admin daily digest (deduped daily).
  if (await isAutomationEnabled("dailyDigest")) {
    const admins = await activeAdmins();
    if (admins.length) {
      const today = new Date().toLocaleDateString("en-US");
      const subject = `Rowan Copy — daily digest (${today})`;
      if (!(await alreadySentRecently(admins[0].email, subject, 1))) {
        const [inquiries, dueSoonAll] = await Promise.all([
          prisma.inquiry.findMany({
            where: { status: { in: ["New", "Reviewed"] } },
            orderBy: { createdAt: "desc" },
          }),
          prisma.project.findMany({
            where: { status: { in: ACTIVE }, dueDate: { not: null, lte: in5d } },
            orderBy: { dueDate: "asc" },
            include: { client: true, assignee: true },
          }),
        ]);
        const lines = [
          `Open inquiries: ${inquiries.length}`,
          ...inquiries
            .slice(0, 10)
            .map((i) => `  • ${i.name}${i.business ? ` (${i.business})` : ""} — ${i.serviceType}`),
          "",
          `Projects due in the next 5 days: ${dueSoonAll.length}`,
          ...dueSoonAll.map(
            (p) =>
              `  • ${p.title} — ${p.client.name} — ${p.assignee?.name ?? "Unassigned"} — due ${p.dueDate?.toLocaleDateString("en-US")}`,
          ),
          "",
          `${appUrl}/admin`,
        ];
        await sendEmail({
          to: admins.map((a) => a.email),
          subject,
          text: lines.join("\n"),
          appendSignature: false,
        });
        results.digestSent = true;
      }
    }
  }

  return results;
}
