import type * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AtSign, BookOpen, ListFilter, PenLine, Settings, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sidebar, SidebarList, SidebarListItem } from "@glaze/core/components";

type NavId = "feed" | "write" | "feeds" | "fediverse" | "profile" | "settings";

function activeNav(pathname: string): NavId {
  if (pathname.startsWith("/write")) return "write";
  if (pathname.startsWith("/feeds")) return "feeds";
  if (pathname.startsWith("/fediverse")) return "fediverse";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/settings")) return "settings";
  return "feed";
}

export function AppSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const NAV: Array<{ id: NavId; title: string; path: string; icon: React.ReactNode }> = [
    { id: "feed", title: t("nav.stories"), path: "/", icon: <BookOpen /> },
    { id: "write", title: t("nav.compose"), path: "/write", icon: <PenLine /> },
    { id: "feeds", title: t("nav.feeds"), path: "/feeds", icon: <ListFilter /> },
    { id: "fediverse", title: t("nav.fediverse"), path: "/fediverse", icon: <AtSign /> },
    { id: "profile", title: t("nav.you"), path: "/profile", icon: <UserRound /> },
    { id: "settings", title: t("nav.settings"), path: "/settings", icon: <Settings /> },
  ];

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
