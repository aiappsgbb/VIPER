"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

export default function DashboardSidebar({ organizations, isAdmin }) {
  const searchParams = useSearchParams();
  const currentContentId = searchParams?.get("contentId");
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 flex-col border-r border-slate-200 bg-white/90 backdrop-blur-xl lg:flex">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workspace</p>
          <h1 className="text-lg font-semibold text-slate-900">VIPER</h1>
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
            <p className="text-sm text-slate-500">
              You are not assigned to any collections yet. Contact your administrator to request access.
            </p>
          ) : (
            organizations.map((organization) => (
              <div key={organization.id} className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {organization.name}
                  </p>
                </div>
                <div className="space-y-2">
                  {organization.collections.length === 0 ? (
                    <p className="text-xs text-slate-400">No collections assigned</p>
                  ) : (
                    organization.collections.map((collection) => (
                      <div key={collection.id} className="space-y-1">
                        <p className="text-xs font-medium text-slate-500">{collection.name}</p>
                        <ul className="space-y-1">
                          {collection.contents.length === 0 ? (
                            <li className="text-xs text-slate-400">No videos yet</li>
                          ) : (
                            collection.contents.map((content) => (
                              <li key={content.id}>
                                <Link
                                  className={clsx(
                                    "block rounded-md px-3 py-2 text-sm transition", 
                                    currentContentId === content.id && pathname?.startsWith("/dashboard")
                                      ? "bg-slate-900 text-white shadow"
                                      : "text-slate-600 hover:bg-slate-100",
                                  )}
                                  href={`/dashboard?contentId=${content.id}`}
                                >
                                  {content.title}
                                </Link>
                              </li>
                            ))
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
