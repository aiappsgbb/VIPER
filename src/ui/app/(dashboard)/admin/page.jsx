import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import AdminPanel from "@/components/admin/admin-panel";

function serializeOrganization(organization) {
  return {
    id: organization.id,
    name: organization.name,
    collections: organization.collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
    })),
  };
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const organizations = await prisma.organization.findMany({
    where: {
      memberships: {
        some: {
          userId: session.user.id,
          role: {
            in: ["ADMIN", "OWNER"],
          },
        },
      },
    },
    include: {
      collections: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const approvals = await prisma.approvedEmail.findMany({
    where: {
      OR: organizations.map((organization) => ({ organizationId: organization.id })),
    },
    include: {
      organization: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const safeOrganizations = organizations.map(serializeOrganization);
  const safeApprovals = approvals.map((approval) => ({
    ...approval,
    createdAt: approval.createdAt.toISOString(),
    organization: approval.organization
      ? {
          id: approval.organization.id,
          name: approval.organization.name,
        }
      : null,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <AdminPanel approvals={safeApprovals} organizations={safeOrganizations} />
    </div>
  );
}
