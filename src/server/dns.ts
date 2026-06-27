"use server";

import { revalidatePath } from "next/cache";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { pleskAddDns, pleskDeleteDns, isDnsType, type DnsType } from "@/lib/plesk-dns";

type Result = { ok: boolean; error?: string; info?: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

function pleskMsg(err: unknown): string {
  const e = (err || {}) as { stderr?: string; message?: string };
  const s = String(e.stderr || e.message || "").trim();
  const first = s.split("\n").find((l) => l.trim()) || "";
  if (/ENOENT|not found|command not found/i.test(s)) {
    return "the server isn't set up for portal provisioning yet (plesk CLI/sudo rule missing).";
  }
  return first.slice(0, 200) || "the command failed.";
}

/** Add a DNS record to a Plesk-hosted zone. Admin only, audited. */
export async function addDnsRecord(_prev: Result, formData: FormData): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const domain = String(formData.get("domain") || "").trim().toLowerCase();
  const type = String(formData.get("type") || "").trim().toUpperCase();
  const host = String(formData.get("host") || "").trim();
  const value = String(formData.get("value") || "").trim();
  if (!domain) return fail("Choose a domain.");
  if (!isDnsType(type)) return fail("Choose a supported record type (A, AAAA, CNAME, TXT).");
  if (!value) return fail("Enter the record value.");

  try {
    await pleskAddDns(domain, type as DnsType, host, value);
  } catch (err) {
    return fail(`Couldn't add the record: ${pleskMsg(err)}`);
  }
  await audit({
    actorId: admin.id,
    action: "create",
    entityType: "DnsRecord",
    summary: `Added ${type} record ${host || "@"} on ${domain}`,
  });
  revalidatePath("/admin/dns");
  return { ok: true, info: `Added ${type} record. DNS changes can take up to an hour to propagate.` };
}

/** Delete a DNS record by its Plesk id. Admin only, audited. */
export async function deleteDnsRecord(domain: string, id: string): Promise<Result> {
  const admin = await requireRoleAction("ADMIN");
  const d = String(domain || "").trim().toLowerCase();
  if (!d) return fail("Missing domain.");
  if (!/^\d+$/.test(String(id))) return fail("This record can't be removed from the portal (no id).");

  try {
    await pleskDeleteDns(d, String(id));
  } catch (err) {
    return fail(`Couldn't remove the record: ${pleskMsg(err)}`);
  }
  await audit({
    actorId: admin.id,
    action: "delete",
    entityType: "DnsRecord",
    summary: `Deleted DNS record id ${id} on ${d}`,
  });
  revalidatePath("/admin/dns");
  return OK;
}
