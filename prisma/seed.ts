/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  DEFAULT_SIGNATURE_TEXT,
} from "../src/lib/constants";

const prisma = new PrismaClient();

function sigHtml(text: string): string {
  const [company, ...rest] = text.split("\n");
  return `<!-- rowan-copy-signature -->
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f1;font-family:Helvetica,Arial,sans-serif;color:#14233f;font-size:14px;line-height:1.5">
  <div style="font-weight:700;color:#14233f;font-size:15px">${company}</div>
  ${rest.map((l, i) => `<div style="color:${i === 0 ? "#48648c" : "#14233f"}">${l}</div>`).join("\n  ")}
</div>`;
}

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  console.log("Seeding Rowan Copy database…");

  // --- Clean (dev only) — delete in FK-safe order -------------------------
  await prisma.demo.deleteMany();
  await prisma.mailbox.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.message.deleteMany();
  await prisma.threadParticipant.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.quoteLineItem.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.brief.deleteMany();
  await prisma.brandVoiceProfile.deleteMany();
  await prisma.review.deleteMany();
  await prisma.projectNote.deleteMany();
  await prisma.clientNote.deleteMany();
  await prisma.employeeNote.deleteMany();
  await prisma.document.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.monthlyPlan.deleteMany();
  await prisma.template.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.inboundEmail.deleteMany();
  await prisma.signature.deleteMany();
  await prisma.user.deleteMany();

  // --- Signature ----------------------------------------------------------
  await prisma.signature.create({
    data: {
      text: DEFAULT_SIGNATURE_TEXT,
      html: sigHtml(DEFAULT_SIGNATURE_TEXT),
    },
  });

  // --- Users --------------------------------------------------------------
  const password = await hash("Password123!");

  const admin = await prisma.user.create({
    data: {
      name: "Landen Rowan",
      email: "admin@rowancopy.com",
      phone: "410-555-0100",
      role: "ADMIN",
      passwordHash: password,
    },
  });

  const employee = await prisma.user.create({
    data: {
      name: "Mara Ellis",
      email: "employee@rowancopy.com",
      phone: "410-555-0142",
      role: "EMPLOYEE",
      passwordHash: password,
    },
  });

  const employee2 = await prisma.user.create({
    data: {
      name: "Devon Pratt",
      email: "devon@rowancopy.com",
      phone: "410-555-0188",
      role: "EMPLOYEE",
      passwordHash: password,
    },
  });

  const client = await prisma.user.create({
    data: {
      name: "Jamie Cho",
      email: "client@example.com",
      phone: "443-555-0117",
      role: "CLIENT",
      passwordHash: password,
    },
  });

  const client2 = await prisma.user.create({
    data: {
      name: "Theo Marsh",
      email: "theo@brightpathdental.com",
      phone: "240-555-0190",
      role: "CLIENT",
      passwordHash: password,
    },
  });

  // --- Monthly plans ------------------------------------------------------
  await prisma.monthlyPlan.create({
    data: {
      clientId: client.id,
      active: true,
      renewalDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
    },
  });

  // --- Brand voice profile ------------------------------------------------
  await prisma.brandVoiceProfile.create({
    data: {
      clientId: client.id,
      tone: "Warm, confident, plainspoken. Talks to neighbors, not 'consumers.'",
      bannedCliches:
        "in today's fast-paced world; we go above and beyond; one-stop shop; passionate about",
      keyTerms: "family-owned; licensed in Maryland; same-day estimates",
      notes: "Avoid exclamation points. Sentence case headings.",
    },
  });

  // --- Projects -----------------------------------------------------------
  const proj1 = await prisma.project.create({
    data: {
      title: "Hillside Plumbing — full website copy",
      type: "Website copy",
      scope:
        "Four pages: Home, Services, About, Contact. Goal is to sound trustworthy and local. Replace the contractor-speak on the current site.",
      status: "In Progress",
      quotedPrice: 500,
      revisionRoundsIncluded: 2,
      revisionRoundsUsed: 0,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
      clientId: client.id,
      assigneeId: employee.id,
    },
  });

  const proj2 = await prisma.project.create({
    data: {
      title: "Bright Path Dental — privacy policy + terms",
      type: "Policy & agreement package",
      scope:
        "Privacy policy and terms of service for a new dental practice website. Plain language, HIPAA-aware tone (not legal advice).",
      status: "Draft Delivered",
      quotedPrice: 350,
      revisionRoundsIncluded: 1,
      revisionRoundsUsed: 0,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
      clientId: client2.id,
      assigneeId: employee2.id,
    },
  });

  const proj3 = await prisma.project.create({
    data: {
      title: "Hillside Plumbing — 30 social captions",
      type: "Social media caption batch",
      scope: "30 captions for Instagram/Facebook, one month of content.",
      status: "Closed",
      quotedPrice: 250,
      revisionRoundsIncluded: 1,
      revisionRoundsUsed: 1,
      dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
      clientId: client.id,
      assigneeId: employee.id,
    },
  });

  const proj4 = await prisma.project.create({
    data: {
      title: "Bright Path Dental — launch email",
      type: "Marketing/business email",
      scope: "One announcement email for the practice opening.",
      status: "Cancelled",
      quotedPrice: 75,
      revisionRoundsIncluded: 1,
      cancelledReason: "Client postponed the launch to next quarter.",
      cancelledAt: new Date(),
      clientId: client2.id,
      assigneeId: employee2.id,
    },
  });

  // --- Brief on a project -------------------------------------------------
  await prisma.brief.create({
    data: {
      projectId: proj1.id,
      audience: "Homeowners in Howard County, 35–65, who need a plumber they can trust.",
      goal: "Get visitors to call for an estimate.",
      tone: "Friendly, no-nonsense, local.",
      avoid: "Buzzwords, fake urgency, 'world-class'.",
      competitors: "Big franchise plumbers with call centers.",
      mustInclude: "Licensed & insured, family-owned since 2009, same-day estimates.",
      links: "Current site: example.com (placeholder)",
      submittedAt: new Date(),
    },
  });

  // --- Project notes (internal) ------------------------------------------
  await prisma.projectNote.create({
    data: {
      projectId: proj1.id,
      authorId: employee.id,
      body: "Client wants to avoid sounding like a franchise. Leaning into the family-owned angle on the homepage.",
    },
  });
  await prisma.projectNote.create({
    data: {
      projectId: proj1.id,
      authorId: admin.id,
      body: "Good. Make sure the Services page lists emergency calls clearly.",
    },
  });

  // --- Client / employee internal notes ----------------------------------
  await prisma.clientNote.create({
    data: {
      clientUserId: client.id,
      authorId: admin.id,
      body: "Pays promptly. Prefers email over phone. Great to work with.",
    },
  });
  await prisma.employeeNote.create({
    data: {
      employeeUserId: employee.id,
      authorId: admin.id,
      body: "Strong with service-business copy. Give her the local clients.",
    },
  });

  // --- Payments -----------------------------------------------------------
  await prisma.payment.create({
    data: {
      clientId: client.id,
      projectId: proj1.id,
      description: "Website copy — full 4-page site (50% deposit)",
      amount: 250,
      stripeUrl: "https://buy.stripe.com/test_deposit_hillside",
      status: "Paid",
      paidAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    },
  });
  await prisma.payment.create({
    data: {
      clientId: client2.id,
      projectId: proj2.id,
      description: "Privacy policy + terms package",
      amount: 350,
      stripeUrl: "https://buy.stripe.com/test_brightpath_policy",
      status: "Sent",
    },
  });

  // --- Quote / proposal ---------------------------------------------------
  const quote = await prisma.quote.create({
    data: {
      clientId: client2.id,
      projectId: proj2.id,
      title: "Bright Path Dental — policy package",
      notes: "Includes privacy policy and terms of service. Not legal advice.",
      status: "Accepted",
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6),
      acceptedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
      lineItems: {
        create: [
          { label: "Privacy policy", quantity: 1, unitPrice: 200 },
          { label: "Terms of service", quantity: 1, unitPrice: 150 },
        ],
      },
    },
  });
  void quote;

  // --- Inquiries ----------------------------------------------------------
  await prisma.inquiry.create({
    data: {
      name: "Priya Nair",
      business: "Cedar Lane Yoga",
      email: "priya@cedarlaneyoga.com",
      phone: "301-555-0166",
      serviceType: "Website copy",
      budget: "$300–$500",
      message:
        "We just rebuilt our site and the words are all placeholder text. Need real copy for 3 pages before we launch next month.",
      status: "New",
      source: "public",
    },
  });
  await prisma.inquiry.create({
    data: {
      name: "Marcus Webb",
      business: "Webb & Sons Landscaping",
      email: "marcus@webblandscaping.com",
      serviceType: "Social media caption batch",
      message: "Looking for a month of captions. Do you do recurring?",
      status: "Reviewed",
      source: "public",
    },
  });

  // --- Announcement -------------------------------------------------------
  await prisma.announcement.create({
    data: {
      authorId: admin.id,
      title: "Welcome to the new portal",
      body: "This is where we'll track every project, share drafts, and talk to clients. Keep internal notes internal — clients never see them.",
    },
  });

  // --- Templates ----------------------------------------------------------
  await prisma.template.createMany({
    data: [
      {
        authorId: admin.id,
        category: "caption",
        title: "Caption — behind the scenes",
        body: "Ever wonder what goes on before we open? [Specific detail]. It's the unglamorous part nobody sees — and it's exactly why [benefit].",
      },
      {
        authorId: admin.id,
        category: "email",
        title: "Email — win-back",
        body: "Subject: We saved your spot\n\nHi [Name], it's been a while. Here's what's new at [Business], and a little something to get you back in the door: [offer].",
      },
      {
        authorId: admin.id,
        category: "policy",
        title: "Privacy policy — intro paragraph",
        body: "[Business] respects your privacy. This policy explains what we collect, why, and what you can do about it — in plain English. (Starting point only; confirm legally sensitive wording with your attorney.)",
      },
    ],
  });

  // --- Reviews ------------------------------------------------------------
  await prisma.review.create({
    data: {
      clientId: client.id,
      projectId: proj3.id,
      authorName: "Jamie Cho",
      business: "Hillside Plumbing",
      rating: 5,
      body: "Landen rewrote our whole site and our captions. We finally sound like us. Calls went up the first week.",
      status: "Featured",
      featured: true,
      submittedAt: new Date(),
    },
  });

  // --- Messaging threads --------------------------------------------------
  const thread = await prisma.thread.create({
    data: {
      subject: "Hillside Plumbing — homepage draft",
      participants: {
        create: [
          { userId: admin.id, lastReadAt: new Date() },
          { userId: employee.id, lastReadAt: new Date() },
          { userId: client.id },
        ],
      },
      messages: {
        create: [
          {
            senderId: employee.id,
            body: "Hi Jamie! First draft of the homepage is in your Deliverables. Take a look and tell me if the family-owned angle feels right.",
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
          },
          {
            senderId: client.id,
            body: "Just read it — love it. Can we make the estimate button more obvious?",
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
          },
        ],
      },
    },
  });
  void thread;

  // --- Mailboxes (unconfigured — owners add the password in the portal) ---
  // Demo only: connection settings are placeholders; on a real Plesk server use
  // the actual mail host and each mailbox's password (set from Mail settings).
  await prisma.mailbox.create({
    data: {
      address: "info@rowancopy.com",
      displayName: "Rowan Copy",
      shared: true,
      imapHost: "rowancopy.com",
      smtpHost: "rowancopy.com",
      username: "info@rowancopy.com",
      signatureText: DEFAULT_SIGNATURE_TEXT,
    },
  });
  await prisma.mailbox.create({
    data: {
      address: "mara@rowancopy.com",
      displayName: "Mara Ellis — Rowan Copy",
      ownerId: employee.id,
      imapHost: "rowancopy.com",
      smtpHost: "rowancopy.com",
      username: "mara@rowancopy.com",
      signatureText: "Mara Ellis\nRowan Copy\nmara@rowancopy.com",
    },
  });

  // --- Sample sent email (EmailLog) --------------------------------------
  await prisma.emailLog.create({
    data: {
      senderUserId: admin.id,
      to: "client@example.com",
      subject: "Your Hillside Plumbing draft is ready",
      body: `Hi Jamie,\n\nThe first draft of your homepage is ready to review in the portal under Deliverables. Take a look and send any changes my way.\n\nThanks,\n\n-- \n${DEFAULT_SIGNATURE_TEXT}`,
      status: "logged",
      direction: "outbound",
    },
  });

  // --- An unmatched inbound email ----------------------------------------
  await prisma.inboundEmail.create({
    data: {
      fromEmail: "newlead@somebakery.com",
      subject: "Do you write menus?",
      body: "Hi — saw your site. We need menu descriptions for a new bakery. Is that something you do?",
      matched: false,
    },
  });

  console.log("Seed complete.");
  console.log("\nDemo accounts (password: Password123!):");
  console.log("  ADMIN     admin@rowancopy.com");
  console.log("  EMPLOYEE  employee@rowancopy.com");
  console.log("  CLIENT    client@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
