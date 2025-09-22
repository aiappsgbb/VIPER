"use client";

import { useState } from "react";

import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardHeader from "@/components/dashboard/header";

export default function DashboardLayoutShell({
  children,
  headerProps = {},
  isAdmin = false,
  organizations = [],
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((previous) => !previous);
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        {!isSidebarCollapsed ? (
          <DashboardSidebar isAdmin={isAdmin} organizations={organizations} />
        ) : null}
        <div className="flex flex-1 flex-col">
          <DashboardHeader
            {...headerProps}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={handleToggleSidebar}
          />
          <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
        </div>
      </div>
    </div>
  );
}
