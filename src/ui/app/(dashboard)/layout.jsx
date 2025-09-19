import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardHeader from "@/components/dashboard/header";

async function getSidebarData(userId) {
  const organizations = await prisma.organization.findMany({
    where: {
      memberships: {
        some: {
          userId,
        },
      },
    },
    include: {
      collections: {
        where: {
          memberships: {
            some: {
              userId,
            },
          },
        },
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

  const sidebarData = await getSidebarData(session.user.id);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        <DashboardSidebar
          isAdmin={session.user.role === "ADMIN"}
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
