import * as fs from "node:fs/promises";
import * as path from "node:path";

import { app } from "@glaze/core/backend";

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** Atomic JSON file store under userData. */
export class JsonStore<T> {
  private cache: T | null = null;
  private filePath: string | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private readonly relativeName: string;
  private readonly createDefault: () => T;
  private readonly validate: (value: unknown) => T;

  constructor(relativeName: string, createDefault: () => T, validate: (value: unknown) => T) {
    this.relativeName = relativeName;
    this.createDefault = createDefault;
    this.validate = validate;
  }

  private async resolvePath(): Promise<string> {
    if (!this.filePath) {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      this.filePath = path.join(dir, this.relativeName);
    }
    return this.filePath;
  }

  async load(): Promise<T> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(await this.resolvePath(), "utf-8");
      const parsed: unknown = JSON.parse(raw);
      this.cache = this.validate(parsed);
      return this.cache;
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
      this.cache = this.createDefault();
      return this.cache;
    }
  }

  async save(next: T): Promise<T> {
    this.cache = next;
    const snapshot = next;
    const save = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        const filePath = await this.resolvePath();
        const tempPath = `${filePath}.${process.pid}.tmp`;
        try {
          await fs.writeFile(tempPath, JSON.stringify(snapshot, null, 2), "utf-8");
          await fs.rename(tempPath, filePath);
        } finally {
          await fs.rm(tempPath, { force: true }).catch(() => undefined);
        }
      });
    this.saveQueue = save;
    await save;
    return next;
  }

  async update(mutator: (current: T) => T): Promise<T> {
    const current = await this.load();
    return this.save(mutator(current));
  }
}
