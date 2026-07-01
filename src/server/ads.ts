"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { generateAdCampaign, type AdPlatform } from "@/lib/adwriter";

type Result = { ok: boolean; error?: string; info?: string };
const fail = (error: string): Result => ({ ok: false, error });

const PLATFORMS: AdPlatform[] = ["Google", "Meta", "Both"];

/** Generate ad assets for a customer and save the campaign. Admin + staff. */
export async function generateCampaign(_prev: Result, formData: FormData): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE");
  const businessName = String(formData.get("businessName") || "").trim();
  const clientId = String(formData.get("clientId") || "").trim() || null;
  const platform = String(formData.get("platform") || "Both").trim() as AdPlatform;
  const offer = String(formData.get("offer") || "").trim();
  const objective = String(formData.get("objective") || "").trim() || null;
  const audience = String(formData.get("audience") || "").trim() || null;
  const keyPoints = String(formData.get("keyPoints") || "").trim() || null;
  const cta = String(formData.get("cta") || "").trim() || null;

  if (!businessName) return fail("Enter the business name.");
  if (!offer) return fail("Describe what you're advertising (the product, service, or offer).");
  if (!PLATFORMS.includes(platform)) return fail("Choose a platform.");

  // Pull the client's brand voice if this campaign is tied to a client.
  let brandVoice = null;
  let resolvedBusiness = businessName;
  if (clientId) {
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      include: { brandVoiceProfile: true },
    });
    if (!client || client.role !== "CLIENT") return fail("Invalid client.");
    brandVoice = client.brandVoiceProfile;
    if (!businessName) resolvedBusiness = client.name;
  }

  let content;
  try {
    content = await generateAdCampaign({
      businessName: resolvedBusiness,
      platform,
      offer,
      objective: objective || undefined,
      audience: audience || undefined,
      keyPoints: keyPoints || undefined,
      cta: cta || undefined,
      brandVoice,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't generate the ads.");
  }

  const campaign = await prisma.adCampaign.create({
    data: {
      clientId,
      businessName: resolvedBusiness,
      platform,
      objective,
      audience,
      budget: String(formData.get("budget") || "").trim() || null,
      content: JSON.stringify(content),
      createdById: user.id,
    },
  });
  await audit({
    actorId: user.id,
    action: "create",
    entityType: "AdCampaign",
    entityId: campaign.id,
    summary: `Generated ${platform} ads for ${resolvedBusiness}`,
  });
  revalidatePath("/admin/ad-writer");
  revalidatePath("/staff/ad-writer");
  return { ok: true, info: "Ads generated." };
}

export async function deleteCampaign(id: string): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE");
  const c = await prisma.adCampaign.findUnique({ where: { id } });
  if (!c) return fail("Campaign not found.");
  if (user.role !== "ADMIN" && c.createdById !== user.id) {
    return fail("You can only delete campaigns you created.");
  }
  await prisma.adCampaign.delete({ where: { id } });
  await audit({
    actorId: user.id,
    action: "delete",
    entityType: "AdCampaign",
    entityId: id,
    summary: `Deleted ad campaign for ${c.businessName}`,
  });
  revalidatePath("/admin/ad-writer");
  revalidatePath("/staff/ad-writer");
  return { ok: true };
}

/** Cycle a campaign's status (Draft -> Ready -> Launched -> Draft). */
export async function setCampaignStatus(id: string, status: string): Promise<Result> {
  const user = await requireRoleAction("ADMIN", "EMPLOYEE");
  const c = await prisma.adCampaign.findUnique({ where: { id } });
  if (!c) return fail("Campaign not found.");
  const allowed = ["Draft", "Ready", "Launched"];
  if (!allowed.includes(status)) return fail("Invalid status.");
  await prisma.adCampaign.update({ where: { id }, data: { status } });
  revalidatePath("/admin/ad-writer");
  revalidatePath("/staff/ad-writer");
  return { ok: true };
}
