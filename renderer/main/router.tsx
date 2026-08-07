import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { ErrorBoundaryView } from "@glaze/core/components";

import { EditorView } from "./editor-view";
import { FeedView } from "./feed-view";
import { PostDetailView } from "./post-detail-view";
import { ProfileView } from "./profile-view";
import { RootView } from "./root-view";

const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootView,
  errorComponent: ErrorBoundaryView,
  notFoundComponent: () => {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="drag-region fixed top-0 left-0 right-0 h-13" />
        <p className="text-secondary">Route not found</p>
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

const routeTree = rootRoute.addChildren([
  feedRoute,
  writeRoute,
  editRoute,
  postRoute,
  profileRoute,
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
