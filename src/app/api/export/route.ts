import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/authz";

// Admin-only CSV export of clients / projects / payments (simple backup).
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const type = new URL(req.url).searchParams.get("type") || "clients";
  let rows: Record<string, unknown>[] = [];

  if (type === "clients") {
    const clients = await prisma.user.findMany({
      where: { role: "CLIENT" },
      include: { monthlyPlan: true },
    });
    rows = clients.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone ?? "",
      active: c.active,
      monthlyPlan: c.monthlyPlan?.active ? "active" : "none",
      renewalDate: c.monthlyPlan?.renewalDate?.toISOString().slice(0, 10) ?? "",
      createdAt: c.createdAt.toISOString(),
    }));
  } else if (type === "projects") {
    const projects = await prisma.project.findMany({
      include: { client: true, assignee: true },
    });
    rows = projects.map((p) => ({
      id: p.id,
      title: p.title,
      type: p.type,
      status: p.status,
      client: p.client.name,
      assignee: p.assignee?.name ?? "",
      quotedPrice: p.quotedPrice ?? "",
      dueDate: p.dueDate?.toISOString().slice(0, 10) ?? "",
      createdAt: p.createdAt.toISOString(),
    }));
  } else if (type === "payments") {
    const payments = await prisma.payment.findMany({ include: { client: true } });
    rows = payments.map((p) => ({
      id: p.id,
      client: p.client.name,
      description: p.description,
      amount: p.amount ?? "",
      status: p.status,
      stripeUrl: p.stripeUrl,
      paidAt: p.paidAt?.toISOString() ?? "",
      createdAt: p.createdAt.toISOString(),
    }));
  } else {
    return new NextResponse("Unknown export type", { status: 400 });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rowancopy-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
