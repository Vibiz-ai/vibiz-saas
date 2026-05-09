// Minimal ambient types for `ts-morph` so this codebase typechecks even
// when the dependency is not yet installed in node_modules. The full
// type definitions ship with ts-morph itself; once it is added to the
// chassis package via `npm install ts-morph` (Sandbox v2 follow-up) this
// shim becomes redundant — TypeScript prefers the package's bundled
// `.d.ts` over an ambient declaration.
//
// Surface declared here covers ONLY what
// `src/lib/config-patch-executor.ts` and its test file use. Do NOT grow
// this stub; if more API surface is needed, install ts-morph for real.

declare module "ts-morph" {
  export enum SyntaxKind {
    AsExpression,
    ObjectLiteralExpression,
    ArrayLiteralExpression,
    PropertyAssignment,
  }

  export interface DiagnosticMessageChain {
    getMessageText(): string;
  }

  export interface Diagnostic {
    getCategory(): number;
    getCode(): number;
    getMessageText(): string | DiagnosticMessageChain;
  }

  export interface Expression {
    getKind(): SyntaxKind;
  }

  export interface PropertyAssignment {
    getKind(): SyntaxKind;
    getName(): string;
    getInitializer(): Expression | undefined;
    setInitializer(text: string): void;
    remove(): void;
  }

  export interface ObjectLiteralExpression extends Expression {
    getProperties(): PropertyAssignment[];
  }

  export interface ArrayLiteralExpression extends Expression {
    getElements(): Expression[];
    addElement(text: string): Expression;
    insertElement(index: number, text: string): Expression;
    removeElement(index: number): void;
  }

  export interface SourceFile {
    getVariableDeclaration(name: string): VariableDeclaration | undefined;
    formatText(): void;
    getFullText(): string;
    getPreEmitDiagnostics(): Diagnostic[];
  }

  export interface VariableDeclaration {
    getInitializer(): Expression | undefined;
  }

  export interface CreateSourceFileOptions {
    overwrite?: boolean;
  }

  export interface ProjectOptions {
    useInMemoryFileSystem?: boolean;
    skipAddingFilesFromTsConfig?: boolean;
  }

  export class Project {
    constructor(options?: ProjectOptions);
    createSourceFile(
      filePath: string,
      sourceText: string,
      options?: CreateSourceFileOptions,
    ): SourceFile;
  }
}
