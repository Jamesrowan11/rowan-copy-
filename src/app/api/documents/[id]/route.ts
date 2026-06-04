import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/authz";
import { readUpload } from "@/lib/uploads";

// Secure download. Access is enforced on the data: a client may only download
// their own documents; staff may download any. Guessing another id returns 404.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const isStaff = user.role === "ADMIN" || user.role === "EMPLOYEE";
  // Clients can only access their own documents. Return 404 (not 403) so an
  // attacker can't tell whether the id exists.
  if (!isStaff && doc.clientId !== user.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readUpload(doc.storedName);
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.originalName.replace(/"/g, "")}"`,
      "Content-Length": String(doc.size),
    },
  });
}
