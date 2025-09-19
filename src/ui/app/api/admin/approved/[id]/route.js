import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export async function DELETE(_request, { params }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const approval = await prisma.approvedEmail.findUnique({
    where: { id: params.id },
  });

  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: session.user.id,
      organizationId: approval.organizationId ?? undefined,
      role: {
        in: ["ADMIN", "OWNER"],
      },
    },
  });

  if (!membership && approval.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await prisma.approvedEmail.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ message: "Approval removed" }, { status: 200 });
}
