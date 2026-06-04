"use server";

import { prisma } from "@/lib/prisma";

export type ReviewState = { ok: boolean; error?: string };

// Public review submission via a one-time token. No auth required, but the
// token must match an outstanding review request.
export async function submitReview(
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const token = String(formData.get("token") || "");
  const review = await prisma.review.findUnique({ where: { token } });
  if (!review) return { ok: false, error: "This review link is no longer valid." };

  const authorName = String(formData.get("authorName") || "").trim();
  const business = String(formData.get("business") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const ratingRaw = parseInt(String(formData.get("rating") || "5"), 10);
  const rating = Math.min(5, Math.max(1, Number.isNaN(ratingRaw) ? 5 : ratingRaw));
  if (!authorName || !body) return { ok: false, error: "Please add your name and a few words." };

  await prisma.review.update({
    where: { token },
    data: {
      authorName,
      business: business || null,
      body,
      rating,
      status: "Submitted",
      submittedAt: new Date(),
    },
  });
  return { ok: true };
}
