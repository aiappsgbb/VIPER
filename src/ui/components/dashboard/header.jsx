import VideoUploadPanel from "@/components/dashboard/video-upload-panel";
import SignOutButton from "@/components/dashboard/sign-out-button";
import { getRoleLabel } from "@/lib/rbac";

export default function DashboardHeader({
  user,
  uploadCollections = [],
  defaultCollectionId = null,
  canCreateCollections = false,
  canManageCollections = false,
  managementOrganizations = [],
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur-xl">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Signed in as</p>
        <p className="text-lg font-semibold text-slate-900">{user?.name ?? user?.email}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <VideoUploadPanel
          asDialog
          canCreateCollections={canCreateCollections}
          canManageCollections={canManageCollections}
          collections={uploadCollections}
          defaultCollectionId={defaultCollectionId}
          managementOrganizations={managementOrganizations}
        />
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {getRoleLabel(user?.role)}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
