"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { SERVICE_TYPES } from "@/lib/constants";

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  business: z.string().trim().max(160).optional(),
  email: z.string().trim().email("Please enter a valid email."),
  phone: z.string().trim().max(40).optional(),
  serviceType: z.string().trim().min(1, "Please choose what you need."),
  budget: z.string().trim().max(80).optional(),
  message: z.string().trim().min(1, "Please tell me a bit about the project.").max(5000),
});

export type ContactState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitInquiry(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    business: formData.get("business") || undefined,
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    serviceType: formData.get("serviceType"),
    budget: formData.get("budget") || undefined,
    message: formData.get("message"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const data = parsed.data;
  const serviceType = (SERVICE_TYPES as readonly string[]).includes(
    data.serviceType,
  )
    ? data.serviceType
    : "Other";

  const inquiry = await prisma.inquiry.create({
    data: {
      name: data.name,
      business: data.business || null,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      serviceType,
      budget: data.budget || null,
      message: data.message,
      source: "public",
      status: "New",
    },
  });

  await audit({
    action: "create",
    entityType: "Inquiry",
    entityId: inquiry.id,
    summary: `New public inquiry from ${data.name} (${serviceType})`,
  });

  return { ok: true };
}
