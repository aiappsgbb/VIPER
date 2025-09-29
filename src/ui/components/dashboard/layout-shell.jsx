"use client";

import { useMemo, useState } from "react";

import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardHeader from "@/components/dashboard/header";
import { DashboardThemeProvider, useDashboardTheme } from "@/components/dashboard/theme-context";

function DashboardLayoutContent({ children, headerProps = {}, isAdmin = false, organizations = [] }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { theme } = useDashboardTheme();

  const containerStyle = useMemo(
    () => ({
      "--dashboard-background": theme.backgroundColor,
      "--dashboard-surface": theme.surfaceColor,
      "--dashboard-primary": theme.primaryColor,
      "--dashboard-accent": theme.accentColor,
      "--dashboard-text": theme.textColor,
      "--dashboard-muted": theme.mutedTextColor,
      backgroundColor: theme.backgroundColor,
      color: theme.textColor,
    }),
    [theme.backgroundColor, theme.surfaceColor, theme.primaryColor, theme.accentColor, theme.textColor, theme.mutedTextColor],
  );

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((previous) => !previous);
  };

  return (
    <div className="min-h-screen bg-[color:var(--dashboard-background)] transition-colors" style={containerStyle}>
      <div className="flex min-h-screen">
        {!isSidebarCollapsed ? (
          <DashboardSidebar isAdmin={isAdmin} organizations={organizations} />
        ) : null}
        <div className="flex flex-1 flex-col text-[color:var(--dashboard-text)]">
          <DashboardHeader
            {...headerProps}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={handleToggleSidebar}
          />
          <main className="flex-1 overflow-y-auto bg-[color:var(--dashboard-surface)] transition-colors">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayoutShell(props) {
  return (
    <DashboardThemeProvider>
      <DashboardLayoutContent {...props} />
    </DashboardThemeProvider>
  );
}
