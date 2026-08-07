import type * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, PenLine, UserRound } from "lucide-react";
import { Sidebar, SidebarList, SidebarListItem } from "@glaze/core/components";

type NavId = "feed" | "write" | "profile";

const NAV: Array<{ id: NavId; title: string; path: string; icon: React.ReactNode }> = [
  { id: "feed", title: "Feed", path: "/", icon: <BookOpen /> },
  { id: "write", title: "Write", path: "/write", icon: <PenLine /> },
  { id: "profile", title: "Profile", path: "/profile", icon: <UserRound /> },
];

function activeNav(pathname: string): NavId {
  if (pathname.startsWith("/write")) return "write";
  if (pathname.startsWith("/profile")) return "profile";
  return "feed";
}

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const selected = activeNav(pathname);
  const selectedItem = NAV.find((item) => item.id === selected) ?? NAV[0];

  return (
    <Sidebar>
      <SidebarList
        items={NAV}
        selectedItem={selectedItem}
        onSelectedItemChange={(item) => {
          void navigate({ to: item.path });
        }}
        getItemKey={(item) => item.id}
      >
        {NAV.map((item) => (
          <SidebarListItem key={item.id} item={item} icon={item.icon} title={item.title} />
        ))}
      </SidebarList>
    </Sidebar>
  );
}
