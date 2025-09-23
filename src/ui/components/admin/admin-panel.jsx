"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getRoleLabel } from "@/lib/rbac";

const STATUS_TONE_CLASSES = {
  success: "text-emerald-600",
  error: "text-red-600",
  info: "text-slate-500",
};

const MEMBERSHIP_ROLE_OPTIONS = [
  { value: "VIEWER", label: "Viewer" },
  { value: "EDITOR", label: "Editor" },
  { value: "ADMIN", label: "Admin" },
  { value: "OWNER", label: "Owner" },
];

function getStatusToneClass(tone) {
  return STATUS_TONE_CLASSES[tone] ?? STATUS_TONE_CLASSES.info;
}

function SectionMessage({ message, tone = "info" }) {
  if (!message) {
    return null;
  }

  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-red-200 bg-red-50 text-red-700",
    info: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${styles[tone] ?? styles.info}`}>
      {message}
    </div>
  );
}

function EmptyState({ message }) {
  return <p className="text-sm text-slate-500">{message}</p>;
}

export default function AdminPanel({
  organizations,
  approvals,
  users,
  permissions,
  roleOptions,
}) {
  const router = useRouter();

  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDescription, setNewOrgDescription] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [organizationMessage, setOrganizationMessage] = useState("");
  const [organizationMessageTone, setOrganizationMessageTone] = useState("info");
  const [organizationError, setOrganizationError] = useState("");

  const [organizationDrafts, setOrganizationDrafts] = useState(() =>
    organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      description: organization.description ?? "",
    })),
  );
  useEffect(() => {
    setOrganizationDrafts(
      organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        description: organization.description ?? "",
      })),
    );
  }, [organizations]);
  const [savingOrganizations, setSavingOrganizations] = useState({});

  const collectionSummaries = useMemo(
    () =>
      organizations.flatMap((organization) =>
        organization.collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          description: collection.description ?? "",
          organizationId: organization.id,
          organizationName: organization.name,
          visibility: collection.visibility ?? "PRIVATE",
        })),
      ),
    [organizations],
  );

  const collectionOptions = useMemo(
    () =>
      collectionSummaries.map((collection) => ({
        id: collection.id,
        label: `${collection.organizationName} • ${collection.name}`,
      })),
    [collectionSummaries],
  );

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        id: user.id,
        label: user.name ? `${user.name} (${user.email})` : user.email,
      })),
    [users],
  );

  const [collectionDrafts, setCollectionDrafts] = useState(() =>
    collectionSummaries.map((collection) => ({
      id: collection.id,
      name: collection.name,
      description: collection.description ?? "",
      visibility: collection.visibility ?? "PRIVATE",
    })),
  );
  useEffect(() => {
    setCollectionDrafts(
      collectionSummaries.map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description ?? "",
        visibility: collection.visibility ?? "PRIVATE",
      })),
    );
  }, [collectionSummaries]);
  const [savingCollections, setSavingCollections] = useState({});
  const [collectionMessage, setCollectionMessage] = useState("");
  const [collectionMessageTone, setCollectionMessageTone] = useState("info");
  const [collectionError, setCollectionError] = useState("");
  const [newCollectionOrgId, setNewCollectionOrgId] = useState(organizations[0]?.id ?? "");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [newCollectionVisibility, setNewCollectionVisibility] = useState("PRIVATE");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);

  useEffect(() => {
    if (!organizations.length) {
      setNewCollectionOrgId("");
    } else if (!organizations.some((organization) => organization.id === newCollectionOrgId)) {
      setNewCollectionOrgId(organizations[0].id);
    }
  }, [organizations, newCollectionOrgId]);

  const [userStatuses, setUserStatuses] = useState({});
  const [updatingUsers, setUpdatingUsers] = useState({});
  const [userRoleDrafts, setUserRoleDrafts] = useState(() =>
    users.reduce((accumulator, user) => ({ ...accumulator, [user.id]: user.role }), {}),
  );
  useEffect(() => {
    setUserRoleDrafts(
      users.reduce((accumulator, user) => ({ ...accumulator, [user.id]: user.role }), {}),
    );
  }, [users]);

  const clearUserStatus = (userId) => {
    setUserStatuses((current) => {
      if (!current[userId]) {
        return current;
      }

      const next = { ...current };
      delete next[userId];
      return next;
    });
  };

  const setUserStatus = (userId, status) => {
    setUserStatuses((current) => ({ ...current, [userId]: status }));
  };

  const [approvalEmail, setApprovalEmail] = useState("");
  const [approvalOrgId, setApprovalOrgId] = useState("");
  const [approvalCollections, setApprovalCollections] = useState([]);
  const [approvalRole, setApprovalRole] = useState(roleOptions[0]?.value ?? "USER");
  const [approvalError, setApprovalError] = useState("");
  const [approvalSuccess, setApprovalSuccess] = useState("");
  const [isSavingApproval, setIsSavingApproval] = useState(false);

  const [organizationMemberOrgId, setOrganizationMemberOrgId] = useState(
    organizations[0]?.id ?? "",
  );
  const [organizationMemberUserId, setOrganizationMemberUserId] = useState(
    users[0]?.id ?? "",
  );
  const [organizationMemberRole, setOrganizationMemberRole] = useState(
    MEMBERSHIP_ROLE_OPTIONS[0]?.value ?? "VIEWER",
  );
  const [organizationMemberMessage, setOrganizationMemberMessage] = useState("");
  const [organizationMemberTone, setOrganizationMemberTone] = useState("info");
  const [isAddingOrganizationMember, setIsAddingOrganizationMember] = useState(false);

  const [collectionMemberCollectionId, setCollectionMemberCollectionId] = useState(
    collectionSummaries[0]?.id ?? "",
  );
  const [collectionMemberUserId, setCollectionMemberUserId] = useState(users[0]?.id ?? "");
  const [collectionMemberRole, setCollectionMemberRole] = useState(
    MEMBERSHIP_ROLE_OPTIONS[0]?.value ?? "VIEWER",
  );
  const [collectionMemberMessage, setCollectionMemberMessage] = useState("");
  const [collectionMemberTone, setCollectionMemberTone] = useState("info");
  const [isAddingCollectionMember, setIsAddingCollectionMember] = useState(false);

  useEffect(() => {
    if (!organizations.length) {
      setApprovalOrgId("");
      setApprovalCollections([]);
    } else if (
      approvalOrgId &&
      !organizations.some((organization) => organization.id === approvalOrgId)
    ) {
      setApprovalOrgId(organizations[0].id);
      setApprovalCollections([]);
    }
  }, [organizations, approvalOrgId]);

  useEffect(() => {
    if (roleOptions.length) {
      setApprovalRole((current) =>
        roleOptions.some((option) => option.value === current)
          ? current
          : roleOptions[0].value,
      );
    } else {
      setApprovalRole("USER");
    }
  }, [roleOptions]);

  useEffect(() => {
    if (!organizations.length) {
      if (organizationMemberOrgId !== "") {
        setOrganizationMemberOrgId("");
      }
      return;
    }

    if (!organizationMemberOrgId) {
      setOrganizationMemberOrgId(organizations[0].id);
      return;
    }

    if (!organizations.some((organization) => organization.id === organizationMemberOrgId)) {
      setOrganizationMemberOrgId(organizations[0].id);
    }
  }, [organizations, organizationMemberOrgId]);

  useEffect(() => {
    if (!users.length) {
      if (organizationMemberUserId !== "") {
        setOrganizationMemberUserId("");
      }
      return;
    }

    if (!organizationMemberUserId) {
      setOrganizationMemberUserId(users[0].id);
      return;
    }

    if (!users.some((user) => user.id === organizationMemberUserId)) {
      setOrganizationMemberUserId(users[0].id);
    }
  }, [users, organizationMemberUserId]);

  useEffect(() => {
    if (!collectionSummaries.length) {
      if (collectionMemberCollectionId !== "") {
        setCollectionMemberCollectionId("");
      }
      return;
    }

    if (!collectionMemberCollectionId) {
      setCollectionMemberCollectionId(collectionSummaries[0].id);
      return;
    }

    if (
      !collectionSummaries.some(
        (collection) => collection.id === collectionMemberCollectionId,
      )
    ) {
      setCollectionMemberCollectionId(collectionSummaries[0].id);
    }
  }, [collectionSummaries, collectionMemberCollectionId]);

  useEffect(() => {
    if (!users.length) {
      if (collectionMemberUserId !== "") {
        setCollectionMemberUserId("");
      }
      return;
    }

    if (!collectionMemberUserId) {
      setCollectionMemberUserId(users[0].id);
      return;
    }

    if (!users.some((user) => user.id === collectionMemberUserId)) {
      setCollectionMemberUserId(users[0].id);
    }
  }, [users, collectionMemberUserId]);

  const collectionsByOrganization = useMemo(() => {
    const lookup = new Map();
    organizations.forEach((organization) => {
      lookup.set(organization.id, organization.collections);
    });
    return lookup;
  }, [organizations]);

  const handleCreateOrganization = async (event) => {
    event.preventDefault();
    setOrganizationError("");
    setOrganizationMessage("");

    if (!newOrgName.trim()) {
      setOrganizationError("Enter a name for the organization.");
      return;
    }

    setIsCreatingOrg(true);

    try {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOrgName.trim(),
          description: newOrgDescription.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to create organization");
      }

      setOrganizationMessage("Organization created successfully.");
      setOrganizationMessageTone("success");
      setNewOrgName("");
      setNewOrgDescription("");
      router.refresh();
    } catch (createError) {
      setOrganizationError(createError.message ?? "Unable to create organization");
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const handleUpdateOrganization = async (organizationId) => {
    setOrganizationMessage("");
    setOrganizationError("");
    setSavingOrganizations((current) => ({ ...current, [organizationId]: true }));

    const draft = organizationDrafts.find((organization) => organization.id === organizationId);
    if (!draft) {
      setOrganizationError("Organization details not found.");
      setSavingOrganizations((current) => ({ ...current, [organizationId]: false }));
      return;
    }

    try {
      const response = await fetch(`/api/admin/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to update organization");
      }

      setOrganizationMessage("Organization updated.");
      setOrganizationMessageTone("success");
      router.refresh();
    } catch (updateError) {
      setOrganizationError(updateError.message ?? "Unable to update organization");
    } finally {
      setSavingOrganizations((current) => ({ ...current, [organizationId]: false }));
    }
  };

  const handleCreateCollection = async (event) => {
    event.preventDefault();
    setCollectionError("");
    setCollectionMessage("");

    if (!newCollectionOrgId) {
      setCollectionError("Choose an organization for the collection.");
      return;
    }

    if (!newCollectionName.trim()) {
      setCollectionError("Enter a collection name.");
      return;
    }

    setIsCreatingCollection(true);

    try {
      const response = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: newCollectionOrgId,
          name: newCollectionName.trim(),
          description: newCollectionDescription.trim() || null,
          visibility: newCollectionVisibility,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to create collection");
      }

      setCollectionMessage("Collection created successfully.");
      setCollectionMessageTone("success");
      setNewCollectionName("");
      setNewCollectionDescription("");
      setNewCollectionVisibility("PRIVATE");
      router.refresh();
    } catch (createError) {
      setCollectionError(createError.message ?? "Unable to create collection");
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handleUpdateCollection = async (collectionId) => {
    setCollectionMessage("");
    setCollectionError("");
    setSavingCollections((current) => ({ ...current, [collectionId]: true }));

    const draft = collectionDrafts.find((collection) => collection.id === collectionId);
    if (!draft) {
      setCollectionError("Collection details not found.");
      setSavingCollections((current) => ({ ...current, [collectionId]: false }));
      return;
    }

    try {
      const response = await fetch(`/api/admin/collections/${collectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
          visibility: draft.visibility,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to update collection");
      }

      setCollectionMessage("Collection updated.");
      setCollectionMessageTone("success");
      router.refresh();
    } catch (updateError) {
      setCollectionError(updateError.message ?? "Unable to update collection");
    } finally {
      setSavingCollections((current) => ({ ...current, [collectionId]: false }));
    }
  };

  const handleUserRoleChange = async (userId, role) => {
    setUserRoleDrafts((current) => ({ ...current, [userId]: role }));
    const previousRole = users.find((user) => user.id === userId)?.role ?? role;

    if (role === previousRole) {
      setUserStatus(userId, { message: "User already has this role.", tone: "info" });
      return;
    }

    clearUserStatus(userId);
    setUpdatingUsers((current) => ({ ...current, [userId]: true }));

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to update role");
      }

      setUserStatus(userId, { message: "Role updated.", tone: "success" });
      router.refresh();
    } catch (updateError) {
      setUserStatus(userId, {
        message: updateError.message ?? "Unable to update role",
        tone: "error",
      });
      setUserRoleDrafts((current) => ({ ...current, [userId]: previousRole }));
    } finally {
      setUpdatingUsers((current) => ({ ...current, [userId]: false }));
    }
  };

  const handleAddOrganizationMember = async (event) => {
    event.preventDefault();
    setOrganizationMemberMessage("");
    setOrganizationMemberTone("info");

    if (!organizationMemberOrgId) {
      setOrganizationMemberMessage("Select an organization to add the user to.");
      setOrganizationMemberTone("error");
      return;
    }

    if (!organizationMemberUserId) {
      setOrganizationMemberMessage("Select a user to add.");
      setOrganizationMemberTone("error");
      return;
    }

    setIsAddingOrganizationMember(true);

    try {
      const response = await fetch(
        `/api/admin/organizations/${organizationMemberOrgId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: organizationMemberUserId,
            role: organizationMemberRole,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to add user to the organization");
      }

      setOrganizationMemberMessage("Membership saved.");
      setOrganizationMemberTone("success");
      router.refresh();
    } catch (memberError) {
      setOrganizationMemberMessage(
        memberError.message ?? "Unable to add user to the organization.",
      );
      setOrganizationMemberTone("error");
    } finally {
      setIsAddingOrganizationMember(false);
    }
  };

  const handleAddCollectionMember = async (event) => {
    event.preventDefault();
    setCollectionMemberMessage("");
    setCollectionMemberTone("info");

    if (!collectionMemberCollectionId) {
      setCollectionMemberMessage("Select a collection to add the user to.");
      setCollectionMemberTone("error");
      return;
    }

    if (!collectionMemberUserId) {
      setCollectionMemberMessage("Select a user to add.");
      setCollectionMemberTone("error");
      return;
    }

    setIsAddingCollectionMember(true);

    try {
      const response = await fetch(
        `/api/admin/collections/${collectionMemberCollectionId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: collectionMemberUserId,
            role: collectionMemberRole,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to add user to the collection");
      }

      setCollectionMemberMessage("Membership saved.");
      setCollectionMemberTone("success");
      router.refresh();
    } catch (memberError) {
      setCollectionMemberMessage(
        memberError.message ?? "Unable to add user to the collection.",
      );
      setCollectionMemberTone("error");
    } finally {
      setIsAddingCollectionMember(false);
    }
  };

  const toggleApprovalCollection = (collectionId) => {
    setApprovalCollections((current) =>
      current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [...current, collectionId],
    );
  };

  const handleApprovalSubmit = async (event) => {
    event.preventDefault();
    setApprovalError("");
    setApprovalSuccess("");

    if (!approvalEmail.trim()) {
      setApprovalError("Enter an email address to approve.");
      return;
    }

    if (!approvalOrgId && approvalCollections.length) {
      setApprovalError("Select an organization when assigning collections.");
      return;
    }

    setIsSavingApproval(true);

    try {
      const response = await fetch("/api/admin/approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: approvalEmail.toLowerCase(),
          organizationId: approvalOrgId || null,
          collectionIds: approvalOrgId ? approvalCollections : [],
          role: approvalRole,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to add approval");
      }

      setApprovalSuccess("Approval saved. Share the register link with the invitee.");
      setApprovalEmail("");
      setApprovalCollections([]);
      router.refresh();
    } catch (saveError) {
      setApprovalError(saveError.message ?? "Unable to add approval");
    } finally {
      setIsSavingApproval(false);
    }
  };

  const handleApprovalDelete = async (approvalId) => {
    setApprovalError("");
    setApprovalSuccess("");

    try {
      const response = await fetch(`/api/admin/approved/${approvalId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to remove approval");
      }

      router.refresh();
    } catch (deleteError) {
      setApprovalError(deleteError.message ?? "Unable to remove approval");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Administration</h1>
          <p className="text-sm text-slate-500">
            Manage organizations, collections, user access, and invitations.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link className="flex items-center gap-2" href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>Manage your organizations and keep details current.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {permissions.canManageOrganizations ? (
            <form className="space-y-3" onSubmit={handleCreateOrganization}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-600" htmlFor="new-organization-name">
                    Organization name
                  </label>
                  <Input
                    id="new-organization-name"
                    onChange={(event) => setNewOrgName(event.target.value)}
                    placeholder="Contoso"
                    value={newOrgName}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600" htmlFor="new-organization-description">
                    Description (optional)
                  </label>
                  <Textarea
                    id="new-organization-description"
                    onChange={(event) => setNewOrgDescription(event.target.value)}
                    placeholder="Describe the organization so teammates know its purpose."
                    value={newOrgDescription}
                  />
                </div>
              </div>
              {organizationError ? <p className="text-sm text-red-600">{organizationError}</p> : null}
              <Button disabled={isCreatingOrg} type="submit">
                {isCreatingOrg ? "Creating…" : "Create organization"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              You have read-only access to organizations. Contact a platform administrator to make changes.
            </p>
          )}
          <SectionMessage message={organizationMessage} tone={organizationMessageTone} />
          <div className="space-y-4">
            {organizationDrafts.length === 0 ? (
              <EmptyState message="No organizations available yet." />
            ) : (
              organizationDrafts.map((draft) => {
                const isSaving = Boolean(savingOrganizations[draft.id]);
                return (
                  <div className="space-y-3 rounded-md border border-slate-200 p-4" key={draft.id}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium text-slate-600" htmlFor={`org-name-${draft.id}`}>
                          Name
                        </label>
                        <Input
                          disabled={!permissions.canManageOrganizations}
                          id={`org-name-${draft.id}`}
                          onChange={(event) =>
                            setOrganizationDrafts((current) =>
                              current.map((organization) =>
                                organization.id === draft.id
                                  ? { ...organization, name: event.target.value }
                                  : organization,
                              ),
                            )
                          }
                          value={draft.name}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600">Collections</p>
                        <p className="text-sm text-slate-500">
                          {organizations
                            .find((organization) => organization.id === draft.id)
                            ?.collections?.length || 0}{" "}
                          collection(s)
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600" htmlFor={`org-description-${draft.id}`}>
                        Description
                      </label>
                      <Textarea
                        disabled={!permissions.canManageOrganizations}
                        id={`org-description-${draft.id}`}
                        onChange={(event) =>
                          setOrganizationDrafts((current) =>
                            current.map((organization) =>
                              organization.id === draft.id
                                ? { ...organization, description: event.target.value }
                                : organization,
                            ),
                          )
                        }
                        placeholder="Add context for collaborators."
                        value={draft.description}
                      />
                    </div>
                    {permissions.canManageOrganizations ? (
                      <div className="flex justify-end">
                        <Button
                          disabled={isSaving}
                          onClick={() => handleUpdateOrganization(draft.id)}
                          type="button"
                          variant="outline"
                        >
                          {isSaving ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Collections</CardTitle>
          <CardDescription>Create or update collections within your organizations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {permissions.canManageCollections && permissions.canCreateCollections ? (
            <form className="space-y-3" onSubmit={handleCreateCollection}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-1">
                  <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-organization">
                    Organization
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    id="new-collection-organization"
                    onChange={(event) => setNewCollectionOrgId(event.target.value)}
                    value={newCollectionOrgId}
                  >
                    <option value="">Select an organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-name">
                    Collection name
                  </label>
                  <Input
                    id="new-collection-name"
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    placeholder="Quarterly reviews"
                    value={newCollectionName}
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-visibility">
                    Visibility
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    id="new-collection-visibility"
                    onChange={(event) => setNewCollectionVisibility(event.target.value)}
                    value={newCollectionVisibility}
                  >
                    <option value="PRIVATE">Private (only invited members)</option>
                    <option value="PUBLIC">Public (anyone in the organization)</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-600" htmlFor="new-collection-description">
                    Description (optional)
                  </label>
                  <Textarea
                    id="new-collection-description"
                    onChange={(event) => setNewCollectionDescription(event.target.value)}
                    placeholder="Explain how teammates should use this collection."
                    value={newCollectionDescription}
                  />
                </div>
              </div>
              {collectionError ? <p className="text-sm text-red-600">{collectionError}</p> : null}
              <Button disabled={isCreatingCollection} type="submit">
                {isCreatingCollection ? "Creating…" : "Create collection"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              You have read-only access to collections. Contact a platform administrator to make changes.
            </p>
          )}
          <SectionMessage message={collectionMessage} tone={collectionMessageTone} />
          <div className="space-y-4">
            {collectionSummaries.length === 0 ? (
              <EmptyState message="No collections configured yet." />
            ) : (
              collectionSummaries.map((collection, index) => {
                const draft = collectionDrafts[index];
                const isSaving = Boolean(savingCollections[collection.id]);
                return (
                  <div className="space-y-3 rounded-md border border-slate-200 p-4" key={collection.id}>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="text-sm font-medium text-slate-600" htmlFor={`collection-name-${collection.id}`}>
                          Name
                        </label>
                        <Input
                          disabled={!permissions.canManageCollections}
                          id={`collection-name-${collection.id}`}
                          onChange={(event) =>
                            setCollectionDrafts((current) =>
                              current.map((item) =>
                                item.id === collection.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          value={draft?.name ?? ""}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600">Organization</p>
                        <p className="text-sm text-slate-500">{collection.organizationName}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-600" htmlFor={`collection-visibility-${collection.id}`}>
                          Visibility
                        </label>
                        <select
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                          disabled={!permissions.canManageCollections}
                          id={`collection-visibility-${collection.id}`}
                          onChange={(event) =>
                            setCollectionDrafts((current) =>
                              current.map((item) =>
                                item.id === collection.id
                                  ? { ...item, visibility: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          value={draft?.visibility ?? "PRIVATE"}
                        >
                          <option value="PRIVATE">Private (only invited members)</option>
                          <option value="PUBLIC">Public (anyone in the organization)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600" htmlFor={`collection-description-${collection.id}`}>
                        Description
                      </label>
                      <Textarea
                        disabled={!permissions.canManageCollections}
                        id={`collection-description-${collection.id}`}
                        onChange={(event) =>
                          setCollectionDrafts((current) =>
                            current.map((item) =>
                              item.id === collection.id
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="Add context for collaborators."
                        value={draft?.description ?? ""}
                      />
                    </div>
                    {permissions.canManageCollections ? (
                      <div className="flex justify-end">
                        <Button
                          disabled={isSaving}
                          onClick={() => handleUpdateCollection(collection.id)}
                          type="button"
                          variant="outline"
                        >
                          {isSaving ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
      </CardContent>
    </Card>

      {permissions.canManageOrganizations || permissions.canManageCollections ? (
        <Card>
          <CardHeader>
            <CardTitle>Memberships</CardTitle>
            <CardDescription>
              Assign existing users to organizations or collections without changing their platform role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {permissions.canManageOrganizations ? (
              organizations.length && users.length ? (
                <form className="space-y-3" onSubmit={handleAddOrganizationMember}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label
                        className="text-sm font-medium text-slate-600"
                        htmlFor="organization-member-organization"
                      >
                        Organization
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        disabled={isAddingOrganizationMember}
                        id="organization-member-organization"
                        onChange={(event) => setOrganizationMemberOrgId(event.target.value)}
                        value={organizationMemberOrgId}
                      >
                        {organizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className="text-sm font-medium text-slate-600"
                        htmlFor="organization-member-user"
                      >
                        User
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        disabled={isAddingOrganizationMember}
                        id="organization-member-user"
                        onChange={(event) => setOrganizationMemberUserId(event.target.value)}
                        value={organizationMemberUserId}
                      >
                        {userOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className="text-sm font-medium text-slate-600"
                        htmlFor="organization-member-role"
                      >
                        Role
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        disabled={isAddingOrganizationMember}
                        id="organization-member-role"
                        onChange={(event) => setOrganizationMemberRole(event.target.value)}
                        value={organizationMemberRole}
                      >
                        {MEMBERSHIP_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <SectionMessage
                    message={organizationMemberMessage}
                    tone={organizationMemberTone}
                  />
                  <Button disabled={isAddingOrganizationMember} type="submit">
                    {isAddingOrganizationMember ? "Adding…" : "Add to organization"}
                  </Button>
                </form>
              ) : (
                <EmptyState
                  message={
                    !organizations.length
                      ? "Create an organization before assigning members."
                      : "Invite users before assigning organization memberships."
                  }
                />
              )
            ) : null}

            {permissions.canManageCollections ? (
              collectionSummaries.length && users.length ? (
                <form className="space-y-3" onSubmit={handleAddCollectionMember}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label
                        className="text-sm font-medium text-slate-600"
                        htmlFor="collection-member-collection"
                      >
                        Collection
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        disabled={isAddingCollectionMember}
                        id="collection-member-collection"
                        onChange={(event) => setCollectionMemberCollectionId(event.target.value)}
                        value={collectionMemberCollectionId}
                      >
                        {collectionOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className="text-sm font-medium text-slate-600"
                        htmlFor="collection-member-user"
                      >
                        User
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        disabled={isAddingCollectionMember}
                        id="collection-member-user"
                        onChange={(event) => setCollectionMemberUserId(event.target.value)}
                        value={collectionMemberUserId}
                      >
                        {userOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className="text-sm font-medium text-slate-600"
                        htmlFor="collection-member-role"
                      >
                        Role
                      </label>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                        disabled={isAddingCollectionMember}
                        id="collection-member-role"
                        onChange={(event) => setCollectionMemberRole(event.target.value)}
                        value={collectionMemberRole}
                      >
                        {MEMBERSHIP_ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <SectionMessage
                    message={collectionMemberMessage}
                    tone={collectionMemberTone}
                  />
                  <Button disabled={isAddingCollectionMember} type="submit">
                    {isAddingCollectionMember ? "Adding…" : "Add to collection"}
                  </Button>
                </form>
              ) : (
                <EmptyState
                  message={
                    !collectionSummaries.length
                      ? "Create a collection before assigning members."
                      : "Invite users before assigning collection memberships."
                  }
                />
              )
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Review the people who have access and update their platform role.</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <EmptyState message="No users found." />
          ) : (
            <ScrollArea className="max-h-96">
              <div className="divide-y divide-slate-200">
                {users.map((user) => {
                  const status = userStatuses[user.id] ?? null;
                  const isUpdating = Boolean(updatingUsers[user.id]);
                  const availableRoles = roleOptions.length
                    ? roleOptions
                    : [{ value: user.role, label: getRoleLabel(user.role) }];

                  return (
                    <div className="space-y-3 p-4" key={user.id}>
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                        <div>
                          <p className="font-medium text-slate-800">{user.name ?? user.email}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                          <p className="text-xs text-slate-400">Joined {new Date(user.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 md:items-end md:text-right">
                          {permissions.canManageUsers && roleOptions.length ? (
                            <div className="flex flex-col gap-1 md:items-end">
                              <label className="text-xs font-medium text-slate-600" htmlFor={`user-role-${user.id}`}>
                                Role
                              </label>
                              <select
                                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 md:w-56"
                                disabled={isUpdating}
                                id={`user-role-${user.id}`}
                                onChange={(event) => handleUserRoleChange(user.id, event.target.value)}
                                value={userRoleDrafts[user.id] ?? user.role}
                              >
                                {availableRoles.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Role: {getRoleLabel(user.role)}</p>
                          )}
                          {status?.message ? (
                            <p aria-live="polite" className={`text-xs ${getStatusToneClass(status.tone)}`}>
                              {status.message}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {user.organizations.length ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Organizations</p>
                          <ul className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {user.organizations.map((membership) => (
                              <li
                                className="rounded-full bg-slate-100 px-2 py-1"
                                key={`${user.id}-org-${membership.id}`}
                              >
                                {membership.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {user.collections.length ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Collections</p>
                          <ul className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            {user.collections.map((membership) => (
                              <li
                                className="rounded-full bg-slate-100 px-2 py-1"
                                key={`${user.id}-collection-${membership.id}`}
                              >
                                {membership.organization?.name ? `${membership.organization.name} • ` : ""}
                                {membership.name}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approved emails</CardTitle>
          <CardDescription>Manage who can register for access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {permissions.canManageApprovals ? (
            <form className="space-y-3" onSubmit={handleApprovalSubmit}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-600" htmlFor="approval-email">
                    Email address
                  </label>
                  <Input
                    id="approval-email"
                    onChange={(event) => setApprovalEmail(event.target.value)}
                    placeholder="user@company.com"
                    type="email"
                    value={approvalEmail}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600" htmlFor="approval-role">
                    Role
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    id="approval-role"
                    onChange={(event) => setApprovalRole(event.target.value)}
                    value={approvalRole}
                  >
                    {roleOptions.length ? (
                      roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))
                    ) : (
                      <option value="USER">User</option>
                    )}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-600" htmlFor="approval-organization">
                    Organization (optional)
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    id="approval-organization"
                    onChange={(event) => {
                      setApprovalOrgId(event.target.value);
                      setApprovalCollections([]);
                    }}
                    value={approvalOrgId}
                  >
                    <option value="">No organization</option>
                    {organizations.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Collections</p>
                  <div className="mt-1 space-y-1 rounded-md border border-slate-200 p-2">
                    {approvalOrgId && collectionsByOrganization.get(approvalOrgId)?.length ? (
                      collectionsByOrganization.get(approvalOrgId).map((collection) => {
                        const isSelected = approvalCollections.includes(collection.id);
                        return (
                          <button
                            className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs transition ${
                              isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-100"
                            }`}
                            key={collection.id}
                            onClick={(event) => {
                              event.preventDefault();
                              toggleApprovalCollection(collection.id);
                            }}
                            type="button"
                          >
                            <span>{collection.name}</span>
                            {isSelected ? <span className="text-[10px] uppercase">selected</span> : null}
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500">Collections will appear once one is created.</p>
                    )}
                  </div>
                </div>
              </div>
              {approvalError ? <p className="text-sm text-red-600">{approvalError}</p> : null}
              {approvalSuccess ? <p className="text-sm text-emerald-600">{approvalSuccess}</p> : null}
              <Button disabled={isSavingApproval} type="submit">
                {isSavingApproval ? "Saving…" : "Add approval"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              You have read-only access to approvals. Contact a platform administrator to make changes.
            </p>
          )}
          <ScrollArea className="max-h-80">
            <div className="divide-y divide-slate-200">
              {approvals.length === 0 ? (
                <EmptyState message="No approvals yet." />
              ) : (
                approvals.map((approval) => (
                  <div className="flex items-center justify-between gap-3 p-4" key={approval.id}>
                    <div>
                      <p className="font-medium text-slate-800">{approval.email}</p>
                      <p className="text-sm text-slate-500">
                        {approval.organization?.name ?? "Unknown organization"}
                      </p>
                      <p className="text-xs text-slate-400">
                        Added {new Date(approval.createdAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-slate-400">Role: {getRoleLabel(approval.role)}</p>
                    </div>
                    {permissions.canManageApprovals ? (
                      <Button onClick={() => handleApprovalDelete(approval.id)} size="sm" variant="outline">
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
