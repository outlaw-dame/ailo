import type * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AtSign, BookOpen, PenLine, UserRound } from "lucide-react";
import { Sidebar, SidebarList, SidebarListItem } from "@glaze/core/components";

type NavId = "feed" | "write" | "fediverse" | "profile";

const NAV: Array<{ id: NavId; title: string; path: string; icon: React.ReactNode }> = [
  { id: "feed", title: "Stories", path: "/", icon: <BookOpen /> },
  { id: "write", title: "Compose", path: "/write", icon: <PenLine /> },
  { id: "fediverse", title: "Fediverse", path: "/fediverse", icon: <AtSign /> },
  { id: "profile", title: "You", path: "/profile", icon: <UserRound /> },
];

function activeNav(pathname: string): NavId {
  if (pathname.startsWith("/write")) return "write";
  if (pathname.startsWith("/fediverse")) return "fediverse";
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
