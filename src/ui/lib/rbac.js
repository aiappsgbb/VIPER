export const Roles = {
  ADMIN: "ADMIN",
  SUPER_USER: "SUPER_USER",
  ORGANIZATION_ADMIN: "ORGANIZATION_ADMIN",
  COLLECTION_ADMIN: "COLLECTION_ADMIN",
  USER: "USER",
};

const ROLE_DETAILS = {
  [Roles.ADMIN]: {
    label: "Admin",
    description: "Full platform access across every organization and collection.",
    permissions: {
      viewAllContent: true,
      accessAdmin: true,
      manageOrganizations: true,
      manageCollections: true,
      createCollections: true,
      manageUsers: true,
      manageApprovals: true,
      uploadContent: true,
    },
  },
  [Roles.SUPER_USER]: {
    label: "Super user",
    description: "Read access to every organization and collection with advanced tooling.",
    permissions: {
      viewAllContent: true,
      accessAdmin: true,
      manageOrganizations: false,
      manageCollections: false,
      createCollections: false,
      manageUsers: false,
      manageApprovals: false,
      uploadContent: true,
    },
  },
  [Roles.ORGANIZATION_ADMIN]: {
    label: "Organization admin",
    description: "Manage the organizations you administrate, including users and collections.",
    permissions: {
      viewAllContent: false,
      accessAdmin: true,
      manageOrganizations: true,
      manageCollections: true,
      createCollections: true,
      manageUsers: true,
      manageApprovals: true,
      uploadContent: true,
    },
  },
  [Roles.COLLECTION_ADMIN]: {
    label: "Collection admin",
    description: "Manage collections that you have been assigned to administer.",
    permissions: {
      viewAllContent: false,
      accessAdmin: false,
      manageOrganizations: false,
      manageCollections: true,
      createCollections: false,
      manageUsers: false,
      manageApprovals: false,
      uploadContent: true,
    },
  },
  [Roles.USER]: {
    label: "User",
    description: "Collaborate on assigned collections and run analyses.",
    permissions: {
      viewAllContent: false,
      accessAdmin: false,
      manageOrganizations: false,
      manageCollections: false,
      createCollections: false,
      manageUsers: false,
      manageApprovals: false,
      uploadContent: true,
    },
  },
};

export function getRoleDetails(role) {
  return ROLE_DETAILS[role] ?? ROLE_DETAILS[Roles.USER];
}

export function getRoleLabel(role) {
  return getRoleDetails(role).label;
}

export function getRoleDescription(role) {
  return getRoleDetails(role).description;
}

function hasPermission(role, permission) {
  const details = getRoleDetails(role);
  return Boolean(details.permissions?.[permission]);
}

export function canViewAllContent(role) {
  return hasPermission(role, "viewAllContent");
}

export function canAccessAdmin(role) {
  return hasPermission(role, "accessAdmin");
}

export function canManageOrganizations(role) {
  return hasPermission(role, "manageOrganizations");
}

export function canManageCollections(role) {
  return hasPermission(role, "manageCollections");
}

export function canCreateCollections(role) {
  return hasPermission(role, "createCollections");
}

export function canManageUsers(role) {
  return hasPermission(role, "manageUsers");
}

export function canManageApprovals(role) {
  return hasPermission(role, "manageApprovals");
}

export function canUploadContent(role) {
  return hasPermission(role, "uploadContent");
}

export function canDeleteContent(role) {
  return [
    Roles.ADMIN,
    Roles.SUPER_USER,
    Roles.ORGANIZATION_ADMIN,
    Roles.COLLECTION_ADMIN,
  ].includes(role);
}

export function canDeleteCollection(role) {
  return [
    Roles.ADMIN,
    Roles.SUPER_USER,
    Roles.ORGANIZATION_ADMIN,
    Roles.COLLECTION_ADMIN,
  ].includes(role);
}

export const ROLE_ORDER = [
  Roles.USER,
  Roles.COLLECTION_ADMIN,
  Roles.ORGANIZATION_ADMIN,
  Roles.SUPER_USER,
  Roles.ADMIN,
];

export function compareRolePriority(a, b) {
  return ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b);
}

export function getAssignableRoles(actorRole) {
  if (actorRole === Roles.ADMIN) {
    return [...ROLE_ORDER];
  }

  if (actorRole === Roles.ORGANIZATION_ADMIN) {
    return [Roles.USER, Roles.COLLECTION_ADMIN];
  }

  return [];
}

export function canAssignRole(actorRole, targetRole) {
  return getAssignableRoles(actorRole).includes(targetRole);
}

export function getRoleOptions(actorRole) {
  const assignable = getAssignableRoles(actorRole);
  if (assignable.length === 0) {
    return [];
  }

  return assignable.map((role) => ({
    value: role,
    label: getRoleLabel(role),
    description: getRoleDescription(role),
  }));
}
