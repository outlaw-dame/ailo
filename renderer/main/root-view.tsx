import { Outlet } from "@tanstack/react-router";
import * as React from "react";
import { SplitView, Status } from "@glaze/core/components";
import { useTheme, useConnection, useEnvironment } from "@glaze/core/hooks";

import { AppSidebar } from "../components/app-sidebar";

export function RootView() {
  useTheme();

  const connectionQuery = useConnection();
  const environmentQuery = useEnvironment();

  React.useEffect(() => {
    return () => {
      console.log("[RootView] cleanup - disconnecting IPC client");
      window.glazeAPI?.glaze?.ipc?.disconnect();
    };
  }, []);

  return (
    <div className="h-full relative [&:not(:has([data-toolbar]))_.drag-region]:z-50">
      <div className="drag-region fixed top-0 left-0 right-0 h-13" />
      <SplitView
        className="h-full"
        storageKey="knot-shell-v2"
        sidebar={<AppSidebar />}
        sidebarSize={{ default: 188, min: 168, max: 240 }}
      >
        <Outlet />
      </SplitView>

      <div className="flex flex-col items-end gap-1 mt-2 fixed bottom-12 right-2">
        {import.meta.env.DEV ? (
          <>
            {connectionQuery.error ? <Status variant="error">Backend disconnected</Status> : null}
            {environmentQuery.data ? null : <Status variant="error">Dev Server not found</Status>}
          </>
        ) : null}
      </div>
    </div>
  );
}
