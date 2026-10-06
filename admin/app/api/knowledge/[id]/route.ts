import { NextResponse } from "next/server";
import { canAccessTinaAdmin, requireApiUser, writeAuditEvent } from "@/lib/authz";
import { createServiceClient } from "@/lib/supabase/service";

type Params = { params: { id: string } };

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canAccessTinaAdmin(auth.profile)) {
    return NextResponse.json({ detail: "Not allowed to delete articles." }, { status: 403 });
  }

  const entryId = params.id?.trim();
  if (!entryId) {
    return NextResponse.json({ detail: "Article id required." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      { detail: "Delete is not configured. Set SUPABASE_SECRET_KEY." },
      { status: 503 },
    );
  }

  const { data: entry, error: loadError } = await service
    .from("knowledge_entries")
    .select("id, document_id, primary_question")
    .eq("id", entryId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ detail: "Could not load article." }, { status: 500 });
  }
  if (!entry) {
    return NextResponse.json({ detail: "knowledge entry not found" }, { status: 404 });
  }

  const documentId = (entry.document_id as string | null) || null;
  if (documentId) {
    const { error: docError } = await service.from("documents").delete().eq("id", documentId);
    if (docError) {
      return NextResponse.json(
        { detail: "Could not remove the article from Tina’s retrieval." },
        { status: 500 },
      );
    }
  }

  const { error: deleteError } = await service.from("knowledge_entries").delete().eq("id", entryId);
  if (deleteError) {
    return NextResponse.json({ detail: "Could not delete article." }, { status: 500 });
  }

  await writeAuditEvent({
    action: "knowledge_entry_deleted",
    actorUserId: auth.user.id,
    metadata: {
      entry_id: entryId,
      document_id: documentId,
      primary_question: entry.primary_question || "",
    },
  });

  return NextResponse.json({
    status: "deleted",
    id: entryId,
    document_id: documentId,
  });
}
