import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardHeader from "@/components/dashboard/header";
import { canAccessAdmin, canViewAllContent } from "@/lib/rbac";

async function getSidebarData(user) {
  const canSeeAll = canViewAllContent(user.role);

  const organizationWhere = canSeeAll
    ? {}
    : {
        OR: [
          {
            memberships: {
              some: {
                userId: user.id,
              },
            },
          },
          {
            collections: {
              some: {
                memberships: {
                  some: {
                    userId: user.id,
                  },
                },
              },
            },
          },
        ],
      };

  const collectionWhere = canSeeAll
    ? {}
    : {
        OR: [
          {
            memberships: {
              some: {
                userId: user.id,
              },
            },
          },
          {
            organization: {
              memberships: {
                some: {
                  userId: user.id,
                  role: {
                    in: ["ADMIN", "OWNER"],
                  },
                },
              },
            },
          },
        ],
      };

  const organizations = await prisma.organization.findMany({
    where: organizationWhere,
    include: {
      collections: {
        where: collectionWhere,
        orderBy: {
          name: "asc",
        },
        include: {
          contents: {
            orderBy: {
              createdAt: "desc",
            },
            take: 5,
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    collections: organization.collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      contents: collection.contents,
    })),
  }));
}

export default async function DashboardLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const sidebarData = await getSidebarData(session.user);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <DashboardSidebar
          isAdmin={canAccessAdmin(session.user.role)}
          organizations={sidebarData}
        />
        <div className="flex flex-1 flex-col">
          <DashboardHeader user={session.user} />
          <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
        </div>
      </div>
    </div>
  );
}
