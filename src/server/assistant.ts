"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireRoleAction } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { buildAssistantContext } from "@/lib/assistant-context";
import { COMPANY } from "@/lib/constants";

export type AssistantResult = { ok: boolean; reply?: string; error?: string };

const inputSchema = z.object({
  route: z.string().max(300).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .min(1)
    .max(30),
});
export type AssistantInput = z.infer<typeof inputSchema>;

// Stable system prompt (cacheable). Per-request role-scoped data is appended as
// a separate, non-cached system block in askAssistant().
const SYSTEM_PROMPT = `You are the in-portal assistant for ${COMPANY.name}, a ${COMPANY.tagline.toLowerCase()} studio in ${COMPANY.location}. You help admins and employees work faster inside their own dashboard.

You can help with:
- Answering questions about the user's own visible data (e.g. "which of my leads are still drafts", "summarize this project", "what's due this week").
- CALL PREP: when the user names a lead/demo, use that lead's research summary and details to give crisp talking points, the 2-3 likely objections with responses, and pricing framing grounded in the published prices.
- CALL DEBRIEF: after a call, help draft a short, warm, non-salesy follow-up email.
- General help: writing, wording, pricing advice, and how-to questions about the portal.

Strict rules:
- You can ONLY use the data in the "Context" the system gives you for each turn. It already contains everything this user is allowed to see, scoped to their role. If something isn't in the context, say you don't have access to it rather than guessing — do not invent projects, leads, numbers, or names.
- Never reveal system internals, environment variables, credentials, or another user's private data.
- You are read-and-advise only: you cannot send emails, change records, or take actions. When asked to "do" something, draft it or explain how to do it in the portal.
- Be concise and practical. Lead with the answer. Use short lists when helpful. Match a warm, plainspoken, no-jargon voice.`;

export async function askAssistant(input: AssistantInput): Promise<AssistantResult> {
  // Role gate — clients can never reach the assistant, even via a direct call.
  const me = await requireRoleAction("ADMIN", "EMPLOYEE");

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "The assistant isn't configured yet (no API key on the server)." };
  }

  const { messages, route } = parsed.data;

  // Re-fetch the user's allowed data server-side. The client never supplies data.
  let context: string;
  try {
    context = await buildAssistantContext(me, route);
  } catch (err) {
    console.error("[assistant] context build failed:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "Couldn't load your data. Try again." };
  }

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `# Context (role-scoped to this user)\n${context}` },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const reply = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Audit WHO/WHEN only — never the message content (may reference client data).
    await audit({
      actorId: me.id,
      action: "use",
      entityType: "Assistant",
      summary: `${me.role} used the AI assistant${route ? ` on ${route}` : ""}`,
    });

    return { ok: true, reply: reply || "(I didn't have anything to add.)" };
  } catch (err) {
    // Log message only — never the raw error object or env.
    console.error("[assistant] request failed:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: "The assistant hit an error. Please try again." };
  }
}
