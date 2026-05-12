import "server-only";
import { config as baseConfig } from "../../template.config";
import { readFileSync, existsSync } from "fs";
import path from "path";

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (typeof base !== "object" || base === null) return override as T;
  if (Array.isArray(base) || Array.isArray(override)) return override as T;
  if (typeof override !== "object") return override as T;
  const ov = override as Record<string, unknown>;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const k of Object.keys(ov)) {
    result[k] = deepMerge((base as Record<string, unknown>)[k], ov[k]);
  }
  return result as T;
}

const OVERRIDES_PATH = path.join(process.cwd(), "data/config-overrides.json");

export function getConfig() {
  if (existsSync(OVERRIDES_PATH)) {
    try {
      const overrides = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
      return deepMerge(baseConfig, overrides);
    } catch {
      return baseConfig;
    }
  }
  return baseConfig;
}
