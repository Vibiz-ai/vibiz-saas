// Sandbox v2 — ts-morph config-patch executor.
//
// Applies a list of `ConfigOp` operations (set / append / remove) to the
// `export const config = { ... }` object literal in a TypeScript source
// file (`template.config.ts`). This is the AST-aware mechanism that the
// runner uses to mutate the chassis config without ever doing string
// replacement on user-edited code.
//
// The runner endpoint at `src/app/api/internal/runner/apply-config-patch`
// is the only caller; expressing the engine as a pure(ish) library — input
// is a source string + ops, output is the modified source — keeps it unit
// testable without spinning up Next.js.
//
// Path syntax (matches the wire contract in `runner-types.ts`):
//   - dot-separated property names                     "brand.colors.primary"
//   - bracket indices for arrays                       "features[2].title"
//   - trailing "[]" denotes the array itself           "features[]"        (append only)
//   - mix freely                                       "pricing.fallbackTiers[1].features[3]"
//
// Conventions:
//   - `set` and `remove` require the path to exist; we throw
//     `ConfigPatchError` with a descriptive message rather than silently
//     creating intermediate keys (the runner-side classifier should never
//     ask for paths that don't exist; loud failure surfaces real bugs).
//   - `append` requires the path to point at an array. Both `features[]`
//     and `features` are accepted as targeting the array itself.
//   - Values are JSON-shaped (zod accepts `z.unknown()`); we re-serialize
//     them as TypeScript object/array/primitive literals via ts-morph's
//     structural builders so the resulting source is syntactically valid
//     and `formatText()`-able.
//
// Runtime validation of the modified config is intentionally NOT done
// here — the route handler dynamically imports the file and runs
// `TemplateConfigSchema.parse` on the result. Keeping AST mutation and
// runtime validation separate keeps this module pure (no fs, no node:vm,
// no dynamic import) so tests stay fast and deterministic.

import {
  Project,
  SyntaxKind,
  type ArrayLiteralExpression,
  type Expression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
} from "ts-morph";

import type { ConfigOp } from "./runner-types.ts";

export interface ApplyResult {
  filesChanged: string[];
  newSourceText: string;
}

export class ConfigPatchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ConfigPatchError";
    this.code = code;
  }
}

// --- Path parsing --------------------------------------------------------

type PathSegment =
  | { kind: "key"; key: string }
  | { kind: "index"; index: number }
  | { kind: "arraySelf" }; // trailing "[]"

/**
 * Parse a dot/bracket path into ordered segments.
 *
 * Examples:
 *   "brand.colors.primary"             → key brand, key colors, key primary
 *   "features[2].title"                → key features, index 2, key title
 *   "features[]"                       → key features, arraySelf
 *   "pricing.fallbackTiers[1]"         → key pricing, key fallbackTiers, index 1
 *
 * The "[]" arraySelf token is only legal at the very end of a path, and
 * only `append` is allowed to use it.
 */
function parsePath(path: string): PathSegment[] {
  if (!path.length) {
    throw new ConfigPatchError("invalid_path", "path is empty");
  }
  const segments: PathSegment[] = [];
  let i = 0;

  while (i < path.length) {
    // skip a leading dot between segments
    if (path[i] === ".") {
      i++;
      continue;
    }

    if (path[i] === "[") {
      // bracket: either [<digits>] or []
      const close = path.indexOf("]", i);
      if (close === -1) {
        throw new ConfigPatchError(
          "invalid_path",
          `unterminated '[' in path: ${path}`,
        );
      }
      const inner = path.slice(i + 1, close);
      if (inner.length === 0) {
        if (close !== path.length - 1) {
          throw new ConfigPatchError(
            "invalid_path",
            `'[]' must be the last segment in path: ${path}`,
          );
        }
        segments.push({ kind: "arraySelf" });
        return segments;
      }
      if (!/^\d+$/.test(inner)) {
        throw new ConfigPatchError(
          "invalid_path",
          `array index must be a non-negative integer: ${inner}`,
        );
      }
      segments.push({ kind: "index", index: Number.parseInt(inner, 10) });
      i = close + 1;
      continue;
    }

    // key segment: read until '.' or '['
    let end = i;
    while (end < path.length && path[end] !== "." && path[end] !== "[") end++;
    const key = path.slice(i, end);
    if (key.length === 0) {
      throw new ConfigPatchError(
        "invalid_path",
        `empty key segment in path: ${path}`,
      );
    }
    segments.push({ kind: "key", key });
    i = end;
  }

  return segments;
}

// --- Value → TS literal text --------------------------------------------

/**
 * Render a JSON-shaped runtime value into a TypeScript literal source
 * fragment. ts-morph's `setInitializer` / `addElement` APIs accept raw
 * source text, so we hand them a string built here.
 *
 * - strings: JSON.stringify keeps escaping correct, including `"` and `\`.
 * - numbers: `Number.isFinite` filters NaN/Infinity (which JSON drops too).
 * - booleans, null: literal text.
 * - arrays/objects: recursive; objects use shorthand-property-name keys
 *   when the key is a valid identifier, otherwise quoted keys.
 *
 * Rejects: undefined, functions, symbols, BigInt, circular refs.
 */
function renderValueAsTsLiteral(value: unknown): string {
  return renderInner(value, new WeakSet());
}

function renderInner(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (value === undefined) {
    throw new ConfigPatchError(
      "invalid_value",
      "undefined is not allowed in patch values (use null or omit the field)",
    );
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ConfigPatchError(
        "invalid_value",
        `non-finite number: ${String(value)}`,
      );
    }
    return String(value);
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new ConfigPatchError(
      "invalid_value",
      `unsupported value type: ${typeof value}`,
    );
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new ConfigPatchError("invalid_value", "circular reference in value");
    }
    seen.add(value);
    const parts = value.map((v) => renderInner(v, seen));
    return `[${parts.join(", ")}]`;
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new ConfigPatchError("invalid_value", "circular reference in value");
    }
    seen.add(value);
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj).map(([k, v]) => {
      const keyText = isSafeIdentifier(k) ? k : JSON.stringify(k);
      return `${keyText}: ${renderInner(v, seen)}`;
    });
    return `{ ${entries.join(", ")} }`;
  }
  throw new ConfigPatchError(
    "invalid_value",
    `unsupported value type: ${typeof value}`,
  );
}

function isSafeIdentifier(key: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

// --- AST navigation ------------------------------------------------------

/**
 * Find the `export const config = { ... }` initializer object literal.
 * Throws if missing or shaped unexpectedly.
 */
function findConfigObjectLiteral(sourceFile: SourceFile): ObjectLiteralExpression {
  const decl = sourceFile.getVariableDeclaration("config");
  if (!decl) {
    throw new ConfigPatchError(
      "config_not_found",
      "could not find `export const config = {...}` in source",
    );
  }
  const init = decl.getInitializer();
  if (!init) {
    throw new ConfigPatchError(
      "config_not_found",
      "`config` declaration has no initializer",
    );
  }

  // The chassis writes `{ ... } as const`, which is a TypeAssertion /
  // AsExpression wrapping the literal. Unwrap until we hit the literal.
  let cursor: Expression = init;
  while (cursor.getKind() === SyntaxKind.AsExpression) {
    cursor = (cursor as unknown as { getExpression(): Expression }).getExpression();
  }
  if (cursor.getKind() !== SyntaxKind.ObjectLiteralExpression) {
    throw new ConfigPatchError(
      "config_not_found",
      `\`config\` initializer is not an object literal (got ${SyntaxKind[cursor.getKind()]})`,
    );
  }
  return cursor as ObjectLiteralExpression;
}

/**
 * Walk path segments to a target node. Behavior is parameterized by
 * `mode`:
 *   - "navigate":  resolve every segment, return the final value node.
 *                  Used by `set` (return the property's initializer) and
 *                  by `remove` (return the property assignment, see below).
 *   - "parent":    resolve all segments EXCEPT the last; return the
 *                  containing object/array. Used by `set` to swap an
 *                  initializer and by `remove` to drop the property.
 */
type WalkResult =
  | { kind: "property"; assignment: PropertyAssignment; parent: ObjectLiteralExpression }
  | { kind: "element"; element: Expression; parent: ArrayLiteralExpression; index: number }
  | { kind: "object"; node: ObjectLiteralExpression }
  | { kind: "array"; node: ArrayLiteralExpression };

function walkToValue(
  root: ObjectLiteralExpression,
  segments: PathSegment[],
): WalkResult {
  if (segments.length === 0) {
    return { kind: "object", node: root };
  }

  let current: Expression = root;
  let lastResult: WalkResult = { kind: "object", node: root };

  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s]!;

    if (seg.kind === "key") {
      if (current.getKind() !== SyntaxKind.ObjectLiteralExpression) {
        throw new ConfigPatchError(
          "path_not_found",
          `path segment '${seg.key}' expects an object, got ${SyntaxKind[current.getKind()]}`,
        );
      }
      const obj = current as ObjectLiteralExpression;
      const prop = findPropertyByName(obj, seg.key);
      if (!prop) {
        throw new ConfigPatchError(
          "path_not_found",
          `key '${seg.key}' not found at segment ${s}`,
        );
      }
      const initializer = prop.getInitializer();
      if (!initializer) {
        throw new ConfigPatchError(
          "path_not_found",
          `property '${seg.key}' has no initializer`,
        );
      }
      lastResult = { kind: "property", assignment: prop, parent: obj };
      current = initializer;
    } else if (seg.kind === "index") {
      if (current.getKind() !== SyntaxKind.ArrayLiteralExpression) {
        throw new ConfigPatchError(
          "path_not_found",
          `index [${seg.index}] expects an array, got ${SyntaxKind[current.getKind()]}`,
        );
      }
      const arr = current as ArrayLiteralExpression;
      const elements = arr.getElements();
      if (seg.index < 0 || seg.index >= elements.length) {
        throw new ConfigPatchError(
          "path_not_found",
          `index ${seg.index} out of bounds (length=${elements.length})`,
        );
      }
      const el = elements[seg.index]!;
      lastResult = {
        kind: "element",
        element: el,
        parent: arr,
        index: seg.index,
      };
      current = el;
    } else {
      // arraySelf: only legal at the end of the path
      if (s !== segments.length - 1) {
        throw new ConfigPatchError(
          "invalid_path",
          "'[]' must be the final segment",
        );
      }
      if (current.getKind() !== SyntaxKind.ArrayLiteralExpression) {
        throw new ConfigPatchError(
          "path_not_found",
          `'[]' targets an array but found ${SyntaxKind[current.getKind()]}`,
        );
      }
      return { kind: "array", node: current as ArrayLiteralExpression };
    }
  }

  // After the loop, normalize: if the final navigated node is an array or
  // object, return a typed wrapper for it; if it's a primitive (or any
  // other expression) stuck inside a property, lastResult already reflects
  // the property assignment, which is what `set`/`remove` need.
  const lastSeg = segments[segments.length - 1]!;
  if (lastSeg.kind === "key" && current.getKind() === SyntaxKind.ObjectLiteralExpression) {
    // The property exists and its initializer is an object — both
    // representations matter (parent for remove, value-as-object for
    // recursive ops). Default to the property representation; callers that
    // want the inner object can re-fetch.
  }
  return lastResult;
}

function findPropertyByName(
  obj: ObjectLiteralExpression,
  name: string,
): PropertyAssignment | undefined {
  for (const prop of obj.getProperties()) {
    if (prop.getKind() === SyntaxKind.PropertyAssignment) {
      const pa = prop as PropertyAssignment;
      if (pa.getName() === name) return pa;
    }
  }
  return undefined;
}

// --- Op handlers ---------------------------------------------------------

function applySet(
  root: ObjectLiteralExpression,
  path: string,
  value: unknown,
): void {
  const segments = parsePath(path);
  if (segments.length === 0) {
    throw new ConfigPatchError(
      "invalid_path",
      "set requires a non-empty path",
    );
  }
  const last = segments[segments.length - 1]!;
  if (last.kind === "arraySelf") {
    throw new ConfigPatchError(
      "invalid_path",
      "set is not compatible with '[]' (use append for arrays)",
    );
  }

  const result = walkToValue(root, segments);
  const literalText = renderValueAsTsLiteral(value);

  if (result.kind === "property") {
    result.assignment.setInitializer(literalText);
    return;
  }
  if (result.kind === "element") {
    // Replace by setting the element at index in the parent array.
    result.parent.removeElement(result.index);
    result.parent.insertElement(result.index, literalText);
    return;
  }
  throw new ConfigPatchError(
    "path_not_found",
    "set target did not resolve to a settable node",
  );
}

function applyAppend(
  root: ObjectLiteralExpression,
  path: string,
  value: unknown,
): void {
  const segments = parsePath(path);
  if (segments.length === 0) {
    throw new ConfigPatchError(
      "invalid_path",
      "append requires a non-empty path",
    );
  }

  // Tolerate both "features" (key resolves to an array) and "features[]"
  // (explicit array-self marker). For the former we walk all segments and
  // expect the final value to be an array.
  const result = walkToValue(root, segments);
  let arrayNode: ArrayLiteralExpression | null = null;

  if (result.kind === "array") {
    arrayNode = result.node;
  } else if (result.kind === "property") {
    const init = result.assignment.getInitializer();
    if (init && init.getKind() === SyntaxKind.ArrayLiteralExpression) {
      arrayNode = init as ArrayLiteralExpression;
    }
  } else if (result.kind === "element") {
    if (result.element.getKind() === SyntaxKind.ArrayLiteralExpression) {
      arrayNode = result.element as ArrayLiteralExpression;
    }
  }

  if (!arrayNode) {
    throw new ConfigPatchError(
      "invalid_target",
      `append requires the path to point at an array: ${path}`,
    );
  }

  arrayNode.addElement(renderValueAsTsLiteral(value));
}

function applyRemove(root: ObjectLiteralExpression, path: string): void {
  const segments = parsePath(path);
  if (segments.length === 0) {
    throw new ConfigPatchError(
      "invalid_path",
      "remove requires a non-empty path",
    );
  }
  const last = segments[segments.length - 1]!;
  if (last.kind === "arraySelf") {
    throw new ConfigPatchError(
      "invalid_path",
      "remove cannot target '[]' (the array itself); use a key or index",
    );
  }

  const result = walkToValue(root, segments);
  if (result.kind === "property") {
    result.assignment.remove();
    return;
  }
  if (result.kind === "element") {
    result.parent.removeElement(result.index);
    return;
  }
  throw new ConfigPatchError(
    "path_not_found",
    "remove target did not resolve to a removable node",
  );
}

// --- Public entrypoint ---------------------------------------------------

/**
 * Apply a list of ops in order to the given source text. Ops are applied
 * sequentially; intermediate AST mutations are visible to subsequent ops
 * (so a `set` on `features[0]` followed by an `append` to `features[]`
 * sees the updated element 0).
 *
 * Throws `ConfigPatchError` with a descriptive code on the first op that
 * fails. The route handler maps these to a 400 with a structured detail
 * payload.
 */
export async function applyConfigOps(
  sourceText: string,
  ops: ConfigOp[],
): Promise<ApplyResult> {
  // In-memory project so we never touch disk here. The route handler is
  // responsible for fs IO; this function stays pure.
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });
  const sourceFile = project.createSourceFile("template.config.ts", sourceText, {
    overwrite: true,
  });

  const root = findConfigObjectLiteral(sourceFile);

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    try {
      if (op.op === "set") {
        applySet(root, op.path, op.value);
      } else if (op.op === "append") {
        applyAppend(root, op.path, op.value);
      } else if (op.op === "remove") {
        applyRemove(root, op.path);
      }
    } catch (error) {
      if (error instanceof ConfigPatchError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ConfigPatchError(
        "op_failed",
        `op[${i}] (${op.op} ${op.path}) failed: ${message}`,
      );
    }
  }

  // Re-format with ts-morph's printer so trailing-comma / spacing is
  // consistent with the rest of the file.
  sourceFile.formatText();

  // Re-parse the output to surface syntax errors loudly. ts-morph's
  // diagnostics include parse errors before any type checking.
  const newSourceText = sourceFile.getFullText();
  const reparseProject = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
  });
  const reparseFile = reparseProject.createSourceFile("verify.ts", newSourceText, {
    overwrite: true,
  });
  const syntaxDiagnostics = reparseFile.getPreEmitDiagnostics().filter((d) => {
    // Only fail on real syntax errors. Type errors (e.g. missing `as
    // const`-derived types) are not our concern at this layer; the runtime
    // import + zod parse done by the route handler is the source of truth.
    const cat = d.getCategory();
    const code = d.getCode();
    // Category 1 = Error. We further restrict to "diagnostic-from-tokenizer"
    // codes (1000-1499 are syntactic errors in TS) to avoid false-positives
    // from missing type info in an in-memory file.
    return cat === 1 && code >= 1000 && code < 1500;
  });
  if (syntaxDiagnostics.length > 0) {
    const messages = syntaxDiagnostics
      .map((d) => {
        const m = d.getMessageText();
        return typeof m === "string" ? m : m.getMessageText();
      })
      .join("; ");
    throw new ConfigPatchError(
      "syntax_error",
      `ts-morph emitted invalid TypeScript: ${messages}`,
    );
  }

  return {
    filesChanged: ["template.config.ts"],
    newSourceText,
  };
}
