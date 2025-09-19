import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

const approvalSchema = z.object({
  email: z.string().email("Valid email required"),
  organizationId: z.string().min(1, "Organization is required"),
  collectionIds: z.array(z.string()).default([]),
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
});

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const approvals = await prisma.approvedEmail.findMany({
    include: { organization: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ approvals }, { status: 200 });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = approvalSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const { email, organizationId, collectionIds, role } = parsed.data;

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: session.user.id,
      organizationId,
      role: {
        in: ["ADMIN", "OWNER"],
      },
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "You do not have permission to manage this organization." },
      { status: 403 },
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const normalizedCollections = Array.from(new Set(collectionIds));

  await prisma.approvedEmail.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      organizationId,
      collectionIds: normalizedCollections,
      role,
    },
    update: {
      organizationId,
      collectionIds: normalizedCollections,
      role,
    },
  });

  return NextResponse.json({ message: "Approval saved" }, { status: 201 });
}
