import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ErrorBoundaryView } from "@glaze/core/components";

import { EditorView } from "./editor-view";
import { FeedView } from "./feed-view";
import { FediverseView } from "./fediverse-view";
import { FeedsView } from "./feeds-view";
import { FeedDetailView } from "./feed-detail-view";
import { PostDetailView } from "./post-detail-view";
import { ProfileView } from "./profile-view";
import { RootView } from "./root-view";
import { SettingsView } from "../settings/settings-view";
import { StatusThreadView } from "./status-thread-view";

const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootView,
  errorComponent: ErrorBoundaryView,
  notFoundComponent: () => {
    const { t } = useTranslation();
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="drag-region fixed top-0 left-0 right-0 h-13" />
        <p className="text-secondary">{t("errors.routeNotFound")}</p>
      </div>
    );
  },
});

const feedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: FeedView,
  staticData: { title: "Feed" },
});

const writeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/write",
  component: EditorView,
  staticData: { title: "Write" },
});

const editRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/write/$postId",
  component: EditorView,
  staticData: { title: "Edit" },
});

const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/post/$postId",
  component: PostDetailView,
  staticData: { title: "Note" },
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: ProfileView,
  staticData: { title: "Profile" },
});

const fediverseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fediverse",
  component: FediverseView,
  staticData: { title: "Fediverse" },
});

const statusThreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/fediverse/status/$statusId",
  component: StatusThreadView,
  staticData: { title: "Post" },
});

const feedsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/feeds",
  component: FeedsView,
  staticData: { title: "Feeds" },
});

const feedDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/feeds/$feedId",
  component: FeedDetailView,
  staticData: { title: "Feed" },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: () => <SettingsView embedded />,
  staticData: { title: "Settings" },
});

const routeTree = rootRoute.addChildren([
  feedRoute,
  writeRoute,
  editRoute,
  postRoute,
  fediverseRoute,
  statusThreadRoute,
  feedsRoute,
  feedDetailRoute,
  profileRoute,
  settingsRoute,
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const router = createRouter({
  routeTree,
  history: createMemoryHistory(),
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  context: {
    queryClient,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface StaticDataRouteOption {
    title?: string;
    component?: any;
  }
}

export { router, queryClient };
