"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useDashboardTheme } from "@/components/dashboard/theme-context";

export default function DashboardSidebar({ organizations, isAdmin }) {
  const searchParams = useSearchParams();
  const currentContentId = searchParams?.get("contentId");
  const pathname = usePathname();
  const { theme } = useDashboardTheme();

  return (
    <aside
      className="hidden w-72 flex-col border-r transition-colors lg:flex"
      style={{
        backgroundColor: theme.surfaceColor,
        borderColor: theme.primaryColor,
        color: theme.textColor,
      }}
    >
      <div
        className="flex items-center justify-between border-b px-6 py-5 transition-colors"
        style={{ borderColor: theme.primaryColor }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.mutedTextColor }}>
            Workspace
          </p>
          <h1 className="text-lg font-semibold" style={{ color: theme.textColor }}>
            VIPER
          </h1>
        </div>
        {isAdmin ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/admin">Admin</Link>
          </Button>
        ) : null}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-6 p-6">
          {organizations.length === 0 ? (
            <p className="text-sm" style={{ color: theme.mutedTextColor }}>
              You are not assigned to any collections yet. Contact your administrator to request access.
            </p>
          ) : (
            organizations.map((organization) => (
              <div key={organization.id} className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.mutedTextColor }}>
                    {organization.name}
                  </p>
                </div>
                <div className="space-y-2">
                  {organization.collections.length === 0 ? (
                    <p className="text-xs" style={{ color: theme.mutedTextColor }}>
                      No collections assigned
                    </p>
                  ) : (
                    organization.collections.map((collection) => (
                      <div key={collection.id} className="space-y-1">
                        <Link
                          aria-current={
                            pathname?.startsWith(`/dashboard/collections/${collection.id}`) ? "page" : undefined
                          }
                          className={clsx("block text-xs font-medium transition", {
                            "opacity-80": !pathname?.startsWith(`/dashboard/collections/${collection.id}`),
                          })}
                          style={{
                            color: pathname?.startsWith(`/dashboard/collections/${collection.id}`)
                              ? theme.textColor
                              : theme.mutedTextColor,
                          }}
                          href={`/dashboard/collections/${collection.id}`}
                        >
                          {collection.name}
                        </Link>
                        <ul className="space-y-1">
                          {collection.contents.length === 0 ? (
                            <li className="text-xs" style={{ color: theme.mutedTextColor }}>
                              No videos yet
                            </li>
                          ) : (
                            collection.contents.map((content) => {
                              const isActive = currentContentId === content.id && pathname?.startsWith("/dashboard");
                              return (
                                <li key={content.id}>
                                  <Link
                                    className={clsx("block rounded-md px-3 py-2 text-sm transition", {
                                      "shadow-sm": isActive,
                                    })}
                                    style={
                                      isActive
                                        ? {
                                            backgroundColor: theme.primaryColor,
                                            color: theme.surfaceColor,
                                          }
                                        : {
                                            color: theme.textColor,
                                          }
                                    }
                                    href={`/dashboard?contentId=${content.id}`}
                                  >
                                    {content.title}
                                  </Link>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
