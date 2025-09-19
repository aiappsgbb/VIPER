import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageCollections, canViewAllContent } from "@/lib/rbac";
import { userCanManageCollection } from "@/lib/access";

const updateCollectionSchema = z
  .object({
    name: z.string().trim().min(2, "Collection name is required").optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Description must be 2000 characters or fewer")
      .optional(),
  })
  .refine((data) => data.name != null || data.description != null, {
    message: "Provide a name or description to update.",
  });

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !canManageCollections(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collectionId = params?.collectionId;

  if (!collectionId) {
    return NextResponse.json({ error: "Collection id is required" }, { status: 400 });
  }

  if (!canViewAllContent(session.user.role)) {
    const allowed = await userCanManageCollection(session.user, collectionId);
    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission to manage this collection." },
        { status: 403 },
      );
    }
  }

  const body = await request.json().catch(() => ({}));
  const parsed = updateCollectionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const updates = {};

  if (parsed.data.name != null) {
    updates.name = parsed.data.name.trim();
  }

  if (parsed.data.description != null) {
    const trimmed = parsed.data.description.trim();
    updates.description = trimmed.length ? trimmed : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Provide a name or description to update." },
      { status: 400 },
    );
  }

  const collection = await prisma.collection.update({
    where: { id: collectionId },
    data: updates,
    include: { organization: true },
  });

  return NextResponse.json({ collection }, { status: 200 });
}
