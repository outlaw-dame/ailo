import { BrowserWindow, logger } from "@glaze/core/backend";
import { getPreloadPath, getWindowUrl } from "./window-paths.js";

let settingsWindow: BrowserWindow | null = null;

// `initialPage` only takes effect on a fresh window (query param, read once
// by settings-view.tsx on mount) — an already-open window is just shown as
// is rather than force-navigated, so it doesn't yank a page out from under
// whatever the user is already doing there.
export async function openSettingsWindow(initialPage?: string): Promise<void> {
  // If window exists and is not destroyed, just show it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    logger.debug("settings", "Settings window already exists, showing it");
    settingsWindow.show();
    return;
  }

  logger.info("settings", "Creating settings window");

  settingsWindow = new BrowserWindow({
    windowKey: "settings",
    width: 520,
    height: 300,
    minWidth: 400,
    minHeight: 200,
    title: "Settings",
    show: false,
    center: true,
    webPreferences: {
      preload: getPreloadPath(),
    },
  });

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  const baseUrl = await getWindowUrl("settings-window.html");
  const url = initialPage ? `${baseUrl}?page=${encodeURIComponent(initialPage)}` : baseUrl;
  logger.info("settings", "Loading settings URL", { url });

  await settingsWindow.loadURL(url);
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
