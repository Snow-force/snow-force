import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function workspaceDataPath(fileName: string) {
  return path.join(process.cwd(), ".data", fileName);
}

export function createJsonArrayStore<T>(filePath: string) {
  async function read(): Promise<T[]> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async function write(records: T[]) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  return { read, write };
}
