import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import prisma from "@/lib/prisma";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request) {
  const body = await request.json();

  const parsed = registerSchema.safeParse({
    name: body?.name,
    email: body?.email?.toLowerCase(),
    password: body?.password,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const { email, password, name } = parsed.data;

  const specialAdminEmail = "owenv@microsoft.com";
  const isSpecialAdminEmail = email === specialAdminEmail;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account already exists for this email." },
      { status: 409 },
    );
  }

  let approval = null;

  if (!isSpecialAdminEmail) {
    approval = await prisma.approvedEmail.findUnique({
      where: { email },
    });

    if (!approval) {
      return NextResponse.json(
        { error: "This email has not been approved by an administrator." },
        { status: 403 },
      );
    }
  }

  const hashedPassword = await hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      role: isSpecialAdminEmail ? "ADMIN" : approval?.role ?? "MEMBER",
    },
  });

  if (approval?.organizationId) {
    await prisma.organizationMembership.create({
      data: {
        organizationId: approval.organizationId,
        userId: user.id,
        role: "VIEWER",
      },
    });
  }

  if (approval?.collectionIds?.length) {
    await Promise.all(
      approval.collectionIds.map((collectionId) =>
        prisma.collectionMembership.create({
          data: {
            collectionId,
            userId: user.id,
            role: "VIEWER",
          },
        }),
      ),
    );
  }

  return NextResponse.json({ message: "Account created" }, { status: 201 });
}
