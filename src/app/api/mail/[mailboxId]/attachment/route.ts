import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { getMailboxForUser, getAttachment } from "@/lib/mail";

// Download an attachment from a message. Access is enforced on the mailbox:
// a user can only reach mailboxes they own or shared ones. Unknown ids 404.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ mailboxId: string }> },
) {
  const { mailboxId } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const mb = await getMailboxForUser(mailboxId, user);
  if (!mb) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const folder = url.searchParams.get("folder") || "INBOX";
  const uid = parseInt(url.searchParams.get("uid") || "", 10);
  const index = parseInt(url.searchParams.get("index") || "", 10);
  if (Number.isNaN(uid) || Number.isNaN(index)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  try {
    const att = await getAttachment(mb, folder, uid, index);
    if (!att) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(att.content), {
      headers: {
        "Content-Type": att.contentType,
        "Content-Disposition": `attachment; filename="${att.filename.replace(/"/g, "")}"`,
      },
    });
  } catch {
    return new NextResponse("Could not fetch attachment", { status: 502 });
  }
}
