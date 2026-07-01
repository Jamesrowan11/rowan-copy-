"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCampaign, setCampaignStatus } from "@/server/ads";
import type { AdContent } from "@/lib/adwriter";

type CampaignProps = {
  id: string;
  businessName: string;
  platform: string;
  objective?: string | null;
  audience?: string | null;
  budget?: string | null;
  status: string;
  clientName?: string | null;
  created: string;
  content: string | null;
  canDelete: boolean;
};

const NEXT_STATUS: Record<string, string> = { Draft: "Ready", Ready: "Launched", Launched: "Draft" };
const STATUS_CLS: Record<string, string> = {
  Draft: "bg-navy-100 text-navy-600",
  Ready: "bg-amber-100 text-amber-700",
  Launched: "bg-emerald-100 text-emerald-700",
};

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-copper hover:underline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked — ignore */
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

function AssetList({ title, items, limit }: { title: string; items: string[]; limit?: number }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-600 uppercase tracking-wide text-navy-400">{title}</h4>
        <CopyButton text={items.join("\n")} label="Copy all" />
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start justify-between gap-2 rounded bg-navy-50/60 px-2 py-1 text-sm text-navy-700">
            <span>
              {it}
              {limit && (
                <span className={`ml-2 text-[10px] ${it.length > limit ? "text-red-500" : "text-navy-300"}`}>
                  {it.length}/{limit}
                </span>
              )}
            </span>
            <CopyButton text={it} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CampaignCard(props: CampaignProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  let content: AdContent = {};
  try {
    content = props.content ? (JSON.parse(props.content) as AdContent) : {};
  } catch {
    content = {};
  }

  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="card p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-600 text-navy">{props.businessName}</h3>
            <span className={`badge ${STATUS_CLS[props.status] ?? "bg-navy-100 text-navy-600"}`}>{props.status}</span>
            <span className="badge bg-navy-100 text-navy-600">{props.platform}</span>
          </div>
          <p className="text-xs text-navy-400">
            {props.clientName ? `${props.clientName} · ` : ""}
            {props.objective ? `${props.objective} · ` : ""}
            {props.budget ? `${props.budget} · ` : ""}
            {props.audience ? `${props.audience} · ` : ""}
            {props.created}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-navy-500 hover:underline"
            disabled={pending}
            onClick={() => run(() => setCampaignStatus(props.id, NEXT_STATUS[props.status] ?? "Draft"))}
          >
            Mark {NEXT_STATUS[props.status] ?? "Draft"}
          </button>
          {props.canDelete && (
            <button
              type="button"
              className="text-xs text-red-500 hover:underline"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`Delete the ad campaign for ${props.businessName}?`)) {
                  run(() => deleteCampaign(props.id));
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {content.google && (
        <div className="mt-2 border-t border-navy-100 pt-3">
          <h3 className="text-sm font-700 text-navy">Google Ads</h3>
          <AssetList title="Headlines" items={content.google.headlines} limit={30} />
          <AssetList title="Descriptions" items={content.google.descriptions} limit={90} />
          <AssetList title="Keywords" items={content.google.keywords} />
          {content.google.notes && <p className="mt-2 text-xs italic text-navy-400">{content.google.notes}</p>}
        </div>
      )}

      {content.meta && (
        <div className="mt-4 border-t border-navy-100 pt-3">
          <h3 className="text-sm font-700 text-navy">Meta Ads (Facebook / Instagram)</h3>
          <AssetList title="Primary text" items={content.meta.primaryTexts} />
          <AssetList title="Headlines" items={content.meta.headlines} limit={40} />
          <AssetList title="Descriptions" items={content.meta.descriptions} limit={30} />
          <AssetList title="Creative ideas" items={content.meta.creativeIdeas ?? []} />
          {content.meta.notes && <p className="mt-2 text-xs italic text-navy-400">{content.meta.notes}</p>}
        </div>
      )}
    </div>
  );
}
