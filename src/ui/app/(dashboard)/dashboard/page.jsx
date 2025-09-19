import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardView from "@/components/dashboard/dashboard-view";

function serializeCollections(collections) {
  return collections.map((collection) => ({
    ...collection,
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

  const collections = await prisma.collection.findMany({
    where: {
      memberships: {
        some: {
          userId: session.user.id,
        },
      },
    },
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
    />
  );
}
