/**
 * Handler Registration
 *
 * Register all your IPC handlers here
 */

import * as path from "path";
import { fileURLToPath } from "url";

import { appHandlers } from "./app.js";
import { registerFediPodHandlers } from "./fedipod.js";
import { registerGitHubHandlers } from "./github.js";
import { registerPostsHandlers } from "./posts.js";
import { registerProfileHandlers } from "./profile.js";
import { registerPublishHandlers } from "./publish.js";
import { registerSolidHandlers } from "./solid.js";
import { getSettingsWindow, openSettingsWindow } from "../windows/settings-window.js";

import { ipcMain, logger, shell } from "@glaze/core/backend";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerHandlers(): void {
  logger.info("handlers", "Registering IPC handlers...");

  ipcMain.handle("app:getInfo", async (_event) => {
    return await appHandlers.getInfo();
  });

  ipcMain.handle("app:getProjectPath", async () => {
    return path.join(__dirname, "..", "..");
  });

  ipcMain.handle("window:openSettings", async (_event) => {
    await openSettingsWindow();
  });

  ipcMain.handle("window:closeSettings", async (_event) => {
    getSettingsWindow()?.close();
  });

  ipcMain.handle("app:openExternal", async (_event, url: unknown) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      throw new Error("Only http(s) URLs can be opened");
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  registerPostsHandlers();
  registerProfileHandlers();
  registerGitHubHandlers();
  registerSolidHandlers();
  registerFediPodHandlers();
  registerPublishHandlers();

  logger.info("handlers", "✓ IPC handlers registered");
}
