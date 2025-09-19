import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardView from "@/components/dashboard/dashboard-view";
import {
  canCreateCollections,
  canManageCollections,
  canViewAllContent,
} from "@/lib/rbac";

function serializeCollections(collections) {
  return collections.map((collection) => ({
    ...collection,
    description: collection.description ?? null,
    createdAt: collection.createdAt.toISOString(),
    updatedAt: collection.updatedAt.toISOString(),
    organization: collection.organization,
    contents: collection.contents.map((content) => ({
      ...content,
      createdAt: content.createdAt.toISOString(),
      updatedAt: content.updatedAt.toISOString(),
      analysisRequestedAt: content.analysisRequestedAt
        ? content.analysisRequestedAt.toISOString()
        : null,
      uploadedBy: content.uploadedBy
        ? {
            ...content.uploadedBy,
            createdAt: content.uploadedBy.createdAt.toISOString(),
            updatedAt: content.uploadedBy.updatedAt.toISOString(),
          }
        : null,
    })),
  }));
}

export default async function DashboardPage({ searchParams }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const canSeeAllContent = canViewAllContent(session.user.role);

  const collectionWhere = canSeeAllContent
    ? {}
    : {
        OR: [
          {
            memberships: {
              some: {
                userId: session.user.id,
              },
            },
          },
          {
            organization: {
              memberships: {
                some: {
                  userId: session.user.id,
                  role: {
                    in: ["ADMIN", "OWNER"],
                  },
                },
              },
            },
          },
        ],
      };

  const collections = await prisma.collection.findMany({
    where: collectionWhere,
    include: {
      organization: true,
      contents: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          uploadedBy: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const managementOrganizationsWhere = canSeeAllContent
    ? {}
    : {
        OR: [
          {
            memberships: {
              some: {
                userId: session.user.id,
              },
            },
          },
          {
            collections: {
              some: {
                memberships: {
                  some: {
                    userId: session.user.id,
                  },
                },
              },
            },
          },
        ],
      };

  const managementOrganizations = await prisma.organization.findMany({
    where: managementOrganizationsWhere,
    include: {
      collections: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const safeManagementOrganizations = managementOrganizations.map((organization) => ({
    id: organization.id,
    name: organization.name,
    description: organization.description ?? null,
    collections: organization.collections,
  }));

  const safeCollections = serializeCollections(collections);
  const allContents = safeCollections.flatMap((collection) =>
    collection.contents.map((content) => ({
      ...content,
      organization: collection.organization,
      collection: {
        id: collection.id,
        name: collection.name,
      },
    })),
  );

  const contentId = searchParams?.contentId;
  const selectedContent = allContents.find((content) => content.id === contentId) ?? allContents[0] ?? null;

  return (
    <DashboardView
      collections={safeCollections}
      selectedContent={selectedContent}
      managementOrganizations={safeManagementOrganizations}
      canManageCollections={canManageCollections(session.user.role)}
      canCreateCollections={canCreateCollections(session.user.role)}
    />
  );
}
