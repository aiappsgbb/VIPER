import prisma from "@/lib/prisma";
import {
  canManageCollections,
  canManageOrganizations,
  canViewAllContent,
} from "@/lib/rbac";

export async function getManageableOrganizationIds(user) {
  if (!user?.id) {
    return [];
  }

  if (canViewAllContent(user.role)) {
    const organizations = await prisma.organization.findMany({
      select: { id: true },
    });
    return organizations.map((organization) => organization.id);
  }

  if (!canManageOrganizations(user.role)) {
    return [];
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: user.id,
      role: { in: ["ADMIN", "OWNER"] },
    },
    select: { organizationId: true },
  });

  return memberships.map((membership) => membership.organizationId);
}

export async function userCanManageOrganization(user, organizationId) {
  if (!organizationId) {
    return false;
  }

  if (canViewAllContent(user.role)) {
    return true;
  }

  if (!canManageOrganizations(user.role)) {
    return false;
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userId: user.id,
      organizationId,
      role: { in: ["ADMIN", "OWNER"] },
    },
  });

  return Boolean(membership);
}

export async function userCanManageCollection(user, collectionId) {
  if (!collectionId) {
    return false;
  }

  if (canViewAllContent(user.role)) {
    return true;
  }

  if (!canManageCollections(user.role)) {
    return false;
  }

  const [collectionMembership, organizationMembership] = await Promise.all([
    prisma.collectionMembership.findFirst({
      where: {
        userId: user.id,
        collectionId,
        role: { in: ["ADMIN", "OWNER"] },
      },
    }),
    prisma.collection.findUnique({
      where: { id: collectionId },
      select: {
        organization: {
          select: {
            memberships: {
              where: {
                userId: user.id,
                role: { in: ["ADMIN", "OWNER"] },
              },
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);

  if (collectionMembership) {
    return true;
  }

  return Boolean(organizationMembership?.organization?.memberships?.length);
}

export function buildCollectionAccessWhere(user, collectionId) {
  const where = { id: collectionId };

  if (canViewAllContent(user.role)) {
    return where;
  }

  const publicCollectionClause = {
    visibility: "PUBLIC",
    organization: {
      memberships: {
        some: {
          userId: user.id,
        },
      },
    },
  };

  where.OR = [
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
            role: { in: ["ADMIN", "OWNER"] },
          },
        },
      },
    },
    publicCollectionClause,
  ];

  return where;
}

export function buildContentAccessWhere(user, contentId) {
  const where = { id: contentId };

  if (canViewAllContent(user.role)) {
    return where;
  }

  const publicCollectionClause = {
    collection: {
      visibility: "PUBLIC",
      organization: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
  };

  where.OR = [
    {
      collection: {
        memberships: {
          some: {
            userId: user.id,
          },
        },
      },
    },
    {
      organization: {
        memberships: {
          some: {
            userId: user.id,
            role: { in: ["ADMIN", "OWNER"] },
          },
        },
      },
    },
    publicCollectionClause,
  ];

  return where;
}
