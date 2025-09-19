"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminPanel({ organizations, approvals }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const hasOrganizations = organizations.length > 0;
  const [selectedOrganization, setSelectedOrganization] = useState(organizations[0]?.id ?? "");
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [role, setRole] = useState("MEMBER");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const collectionsForOrganization = organizations.find((organization) => organization.id === selectedOrganization)?.collections ?? [];

  const toggleCollection = (collectionId) => {
    setSelectedCollections((current) =>
      current.includes(collectionId)
        ? current.filter((id) => id !== collectionId)
        : [...current, collectionId],
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!email) {
      setError("Enter an email address to approve.");
      return;
    }

    if (!selectedOrganization) {
      setError("Choose an organization.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          organizationId: selectedOrganization,
          collectionIds: selectedCollections,
          role,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Unable to add approval");
      }

      setSuccess("Approval added. Share the register link with the invitee.");
      setEmail("");
      setSelectedCollections([]);
      router.refresh();
    } catch (submitError) {
      setError(submitError.message ?? "Unable to add approval");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/admin/approved/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error ?? "Unable to remove approval");
      }

      router.refresh();
    } catch (deleteError) {
      setError(deleteError.message ?? "Unable to remove approval");
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Approve new users</CardTitle>
          <CardDescription>
            Add teammates by email and control the collections they'll see after registration.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {!hasOrganizations ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                You are not an administrator for any organizations yet. Contact the platform owner to be granted access.
              </p>
            ) : null}
            <fieldset className="space-y-4" disabled={!hasOrganizations}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600" htmlFor="email">
                Email address
              </label>
              <Input
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@company.com"
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600" htmlFor="organization">
                Organization
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                id="organization"
                onChange={(event) => {
                  setSelectedOrganization(event.target.value);
                  setSelectedCollections([]);
                }}
                value={selectedOrganization}
              >
                <option value="">Select an organization</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600">Collections</label>
              <div className="rounded-md border border-slate-200">
                {collectionsForOrganization.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">No collections configured for this organization.</p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto p-3">
                    {collectionsForOrganization.map((collection) => {
                      const isSelected = selectedCollections.includes(collection.id);
                      return (
                        <button
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                          key={collection.id}
                          onClick={(event) => {
                            event.preventDefault();
                            toggleCollection(collection.id);
                          }}
                          type="button"
                        >
                          <span>{collection.name}</span>
                          {isSelected ? <span className="text-xs uppercase">selected</span> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600" htmlFor="role">
                Role
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                id="role"
                onChange={(event) => setRole(event.target.value)}
                value={role}
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Administrator</option>
              </select>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
            </fieldset>
          </CardContent>
          <CardFooter className="flex items-center justify-end">
            <Button disabled={isSubmitting || !hasOrganizations} type="submit">
              {isSubmitting ? "Saving…" : "Add to approved list"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approved emails</CardTitle>
          <CardDescription>Manage who can register for access.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-80">
            <div className="divide-y divide-slate-200">
              {approvals.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No approvals yet.</p>
              ) : (
                approvals.map((approval) => (
                  <div className="flex items-center justify-between gap-3 p-4" key={approval.id}>
                    <div>
                      <p className="font-medium text-slate-800">{approval.email}</p>
                      <p className="text-sm text-slate-500">
                        {approval.organization?.name ?? "Any organization"}
                      </p>
                      <p className="text-xs text-slate-400">
                        Added {new Date(approval.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button onClick={() => handleDelete(approval.id)} size="sm" variant="outline">
                      Remove
                    </Button>
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
