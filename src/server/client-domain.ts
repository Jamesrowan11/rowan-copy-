"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import {
  pleskAddDns,
  pleskDeleteDns,
  pleskListDns,
  isDnsType,
  DNS_TYPES,
  type DnsType,
} from "@/lib/plesk-dns";

type Result = { ok: boolean; error?: string; info?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

function pleskMsg(err: unknown): string {
  const e = (err || {}) as { stderr?: string; message?: string };
  const s = String(e.stderr || e.message || "").trim();
  const first = s.split("\n").find((l) => l.trim()) || "";
  if (/ENOENT|not found|command not found/i.test(s)) {
    return "the server isn't set up for domain management yet (plesk CLI/sudo rule missing).";
  }
  return first.slice(0, 200) || "the command failed.";
}

/**
 * Resolve the signed-in client's OWN domain. The domain ALWAYS comes from the
 * database (their assigned mailDomain) — never from client input — so a client
 * can only ever manage their own zone.
 */
async function clientDomain(): Promise<{ id: string; domain: string } | null> {
  const u = await requireRoleAction("CLIENT");
  const me = await prisma.user.findUnique({
    where: { id: u.id },
    select: { id: true, mailDomain: true },
  });
  if (!me?.mailDomain) return null;
  return { id: me.id, domain: me.mailDomain };
}

/** Add a DNS record to the client's own domain. */
export async function addClientDnsRecord(_prev: Result, formData: FormData): Promise<Result> {
  const ctx = await clientDomain();
  if (!ctx) return fail("No domain is set up for your account.");
  const type = String(formData.get("type") || "").trim().toUpperCase();
  const host = String(formData.get("host") || "").trim();
  const value = String(formData.get("value") || "").trim();
  if (!isDnsType(type)) return fail("Choose a supported record type (A, AAAA, CNAME, TXT).");
  if (!value) return fail("Enter the record value.");

  try {
    await pleskAddDns(ctx.domain, type as DnsType, host, value);
  } catch (err) {
    return fail(`Couldn't add the record: ${pleskMsg(err)}`);
  }
  await audit({
    actorId: ctx.id,
    action: "create",
    entityType: "DnsRecord",
    summary: `Client added ${type} record ${host || "@"} on ${ctx.domain}`,
  });
  revalidatePath("/client/domain");
  return { ok: true, info: "Record added. DNS changes can take up to an hour to take effect." };
}

/** Delete one of the client's own DNS records by id (safe record types only). */
export async function deleteClientDnsRecord(id: string): Promise<Result> {
  const ctx = await clientDomain();
  if (!ctx) return fail("No domain is set up for your account.");
  if (!/^\d+$/.test(String(id))) return fail("This record can't be removed here.");

  // Defense in depth: only allow removing the same safe types clients can add —
  // never MX/NS/SOA — even if a crafted request slips past the UI.
  const records = await pleskListDns(ctx.domain);
  const target = records.find((r) => r.id === String(id));
  if (!target) return fail("Record not found.");
  if (!DNS_TYPES.includes(target.type as DnsType)) {
    return fail(`${target.type} records can't be changed here — contact Rowan Copy.`);
  }

  try {
    await pleskDeleteDns(ctx.domain, String(id));
  } catch (err) {
    return fail(`Couldn't remove the record: ${pleskMsg(err)}`);
  }
  await audit({
    actorId: ctx.id,
    action: "delete",
    entityType: "DnsRecord",
    summary: `Client deleted ${target.type} record on ${ctx.domain}`,
  });
  revalidatePath("/client/domain");
  return OK;
}
