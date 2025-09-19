import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { Roles, canManageApprovals, canViewAllContent } from "@/lib/rbac";
import { getManageableOrganizationIds, userCanManageOrganization } from "@/lib/access";

const approvalSchema = z.object({
  email: z.string().email("Valid email required"),
  organizationId: z.string().min(1, "Organization is required"),
  collectionIds: z.array(z.string()).default([]),
  role: z
    .enum([
      Roles.USER,
      Roles.COLLECTION_ADMIN,
      Roles.ORGANIZATION_ADMIN,
      Roles.SUPER_USER,
      Roles.ADMIN,
    ])
    .default(Roles.USER),
});

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !canManageApprovals(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const organizationIds = await getManageableOrganizationIds(session.user);

  if (!organizationIds.length) {
    return NextResponse.json({ approvals: [] }, { status: 200 });
  }

  const approvals = await prisma.approvedEmail.findMany({
    where: { organizationId: { in: organizationIds } },
    include: { organization: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ approvals }, { status: 200 });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !canManageApprovals(session.user.role)) {
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

  const organizationIds = await getManageableOrganizationIds(session.user);

  if (!organizationIds.includes(organizationId)) {
    return NextResponse.json(
      { error: "You do not have permission to manage this organization." },
      { status: 403 },
    );
  }

  if (!canViewAllContent(session.user.role)) {
    const canManage = await userCanManageOrganization(session.user, organizationId);
    if (!canManage) {
      return NextResponse.json(
        { error: "You do not have permission to manage this organization." },
        { status: 403 },
      );
    }
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const normalizedCollections = Array.from(new Set(collectionIds));

  if (normalizedCollections.length) {
    const collections = await prisma.collection.findMany({
      where: {
        id: { in: normalizedCollections },
        organizationId,
      },
      select: { id: true },
    });

    if (collections.length !== normalizedCollections.length) {
      return NextResponse.json(
        { error: "One or more collections do not belong to the selected organization." },
        { status: 400 },
      );
    }
  }

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
