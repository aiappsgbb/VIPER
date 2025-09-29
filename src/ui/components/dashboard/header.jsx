"use client";

import { useMemo } from "react";
import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import VideoUploadPanel from "@/components/dashboard/video-upload-panel";
import SignOutButton from "@/components/dashboard/sign-out-button";
import { getRoleLabel } from "@/lib/rbac";
import ThemeBuilder from "@/components/dashboard/theme-builder";
import { useDashboardTheme } from "@/components/dashboard/theme-context";

export default function DashboardHeader({
  user,
  uploadCollections = [],
  defaultCollectionId = null,
  canCreateCollections = false,
  canManageCollections = false,
  managementOrganizations = [],
  isSidebarCollapsed = false,
  onToggleSidebar,
}) {
  const toggleLabel = isSidebarCollapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar";
  const { theme } = useDashboardTheme();

  const headerStyle = useMemo(
    () => ({
      backgroundColor: theme.surfaceColor,
      borderColor: theme.primaryColor,
      color: theme.textColor,
    }),
    [theme.surfaceColor, theme.primaryColor, theme.textColor],
  );

  return (
    <header
      className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4 backdrop-blur-xl transition-colors"
      style={headerStyle}
    >
      <div className="flex items-center gap-3">
        {typeof onToggleSidebar === "function" ? (
          <Button
            aria-label={toggleLabel}
            aria-pressed={!isSidebarCollapsed}
            onClick={onToggleSidebar}
            size="icon"
            type="button"
            variant="ghost"
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            <span className="sr-only">{toggleLabel}</span>
          </Button>
        ) : null}
        {theme.logoDataUrl ? (
          <Image
            alt="Dashboard logo"
            src={theme.logoDataUrl}
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 rounded bg-white/70 object-contain p-1 shadow-sm"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded"
            style={{ backgroundColor: theme.primaryColor, color: theme.surfaceColor }}
          >
            <span className="text-sm font-semibold uppercase tracking-wide">VIPER</span>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.mutedTextColor }}>
            Signed in as
          </p>
          <p className="text-lg font-semibold" style={{ color: theme.textColor }}>
            {user?.name ?? user?.email}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ThemeBuilder />
        <VideoUploadPanel
          asDialog
          canCreateCollections={canCreateCollections}
          canManageCollections={canManageCollections}
          collections={uploadCollections}
          defaultCollectionId={defaultCollectionId}
          managementOrganizations={managementOrganizations}
        />
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{
            backgroundColor: theme.primaryColor,
            color: theme.surfaceColor,
          }}
        >
          {getRoleLabel(user?.role)}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
