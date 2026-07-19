import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const PREFIX = "[setup-monorepo]";
const log = (...args: unknown[]) => console.log(PREFIX, ...args);
const logError = (...args: unknown[]) => console.error(PREFIX, ...args);

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  trustedDependencies?: string[];
  workspaces?: string[] | { packages?: string[] };
  [key: string]: unknown;
};

const BIOME_CONTENT = `{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "extends": ["./tools/biome.json"]
}
`;

const BUNFIG_CONTENT = `[install]
# Save exact dependency versions without ranges
exact = true
`;

const CI_WORKFLOW_CONTENT = `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  lint-and-type-check:
    name: Lint & Type-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Setup bun & install dependencies
        uses: ./tools/github/setup

      - name: Run linter
        run: bun lint:ci

      - name: Run type-check
        run: bun type-check:ci

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Setup bun & install dependencies
        uses: ./tools/github/setup

      - name: Run tests
        run: bun run test
`;

const GITIGNORE_CONTENT = `# Dependencies
node_modules/

# Build outputs
dist/
build/
out/
.expo/
.next/
.turbo/

# Logs
*.log

# Environment variables
.env*
!.env.example

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
*.swp
*.swo

# Testing
coverage/

# Temporary files
.tmp/
*.tmp
`;

const LEFTHOOK_CONTENT = `pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{js,ts,cjs,mjs,d.cts,d.mts,jsx,tsx,json,jsonc,css,scss}"
      run: bun lint --no-errors-on-unmatched --files-ignore-unknown=true --colors=off {staged_files}
      stage_fixed: true

    typecheck:
      glob: "*.{ts,tsx}"
      run: bun type-check:ci
      fail_text: "TypeScript errors found. Fix them before committing."
`;

const VSCODE_SETTINGS_CONTENT = `{
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.fixAll.biome": "explicit",
    "source.organizeImports.biome": "explicit",
    "source.removeUnusedImports": "explicit"
  },
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true
}
`;

const monorepoRoot = join(import.meta.dir, "../..");
const packageJsonPath = join(monorepoRoot, "package.json");
const configFiles = {
  biome: { content: BIOME_CONTENT, path: join(monorepoRoot, "biome.json") },
  bunfig: { content: BUNFIG_CONTENT, path: join(monorepoRoot, "bunfig.toml") },
  ci: { content: CI_WORKFLOW_CONTENT, path: join(monorepoRoot, ".github/workflows/ci.yml") },
  gitignore: { content: GITIGNORE_CONTENT, path: join(monorepoRoot, ".gitignore") },
  lefthook: { content: LEFTHOOK_CONTENT, path: join(monorepoRoot, "lefthook.yml") },
  vscode: { content: VSCODE_SETTINGS_CONTENT, path: join(monorepoRoot, ".vscode/settings.json") },
};

async function setupConfigFiles(): Promise<string[]> {
  const createdPaths: string[] = [];

  for (const [key, { content, path }] of Object.entries(configFiles)) {
    const file = Bun.file(path);
    const exists = await file.exists();

    if (exists) {
      log(`${key} already exists`);
      continue;
    }

    mkdirSync(dirname(path), { recursive: true });
    await Bun.write(path, content);
    createdPaths.push(path);
    log(`✅ Created ${path}`);
  }

  return createdPaths;
}

async function readOrCreatePackageJson(): Promise<PackageJson> {
  const packageJsonFile = Bun.file(packageJsonPath);
  const exists = await packageJsonFile.exists();

  if (exists) {
    log("Found existing package.json");
    return await packageJsonFile.json();
  }

  const folderName = monorepoRoot.split("/").pop() || "monorepo";
  log("Creating new package.json");

  return {
    license: "Apache-2.0",
    name: `@${folderName}/monorepo`,
    packageManager: `bun@${Bun.version}`,
    private: true,
    version: "0.0.0",
  };
}

function mergeArrayField(existing: string[] | undefined, additions: string[]): string[] {
  if (!existing) return additions;

  const merged = new Set(existing);
  for (const item of additions) {
    merged.add(item);
  }
  return Array.from(merged);
}

function mergeWorkspaces(
  existing: string[] | { packages?: string[] } | undefined,
  additions: string[],
): string[] | { packages: string[] } {
  if (existing && !Array.isArray(existing)) {
    return { ...existing, packages: mergeArrayField(existing.packages, additions) };
  }
  return mergeArrayField(existing, additions);
}

async function runSetupCommands(packageJson: PackageJson, createdConfigPaths: string[]): Promise<string[]> {
  const devDependencies = ["@biomejs/biome", "@types/bun", "lefthook", "typescript"];
  const installedDependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const missingDevDependencies = devDependencies.filter((dep) => !(dep in installedDependencies));
  const lintTargets = [...createdConfigPaths, packageJsonPath].map((path) => relative(monorepoRoot, path)).join(" ");

  const commands: Record<string, { command: string; description: string }> = {
    install: missingDevDependencies.length
      ? { command: `bun add -d ${missingDevDependencies.join(" ")}`, description: "Install devDependencies" }
      : { command: "bun install", description: "Install dependencies" },
    lint: {
      command: `bun biome check --write --no-errors-on-unmatched --files-ignore-unknown=true ${lintTargets}`,
      description: "Format generated config files",
    },
    typecheck: { command: "bun type-check:ci", description: "Run type-checking for initial setup" },
  };

  const failedSteps: string[] = [];

  for (const [key, { command, description }] of Object.entries(commands)) {
    try {
      log(`Running ${key}: ${description}`);
      await Bun.$`${{ raw: command }}`.cwd(monorepoRoot);
      log(`✅ ${key} completed`);
    } catch (err) {
      failedSteps.push(key);
      logError(`❌ ${key} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return failedSteps;
}

async function main() {
  const packageJson = await readOrCreatePackageJson();
  const trustedDependencies = ["@biomejs/biome", "lefthook"];
  const workspaces = ["packages/*", "tools"];
  const scripts = {
    bootstrap: "bun clean; bun install",
    clean: "bun --filter '*' clean; rm -rf bun.lock node_modules build; bun install",
    lint: "bun biome check --write",
    "lint:ci": "bun biome check",
    "lint:ws": "bunx sherif@latest",
    postinstall: "bun lefthook install; bun lint:ws",
    test: "bun test --pass-with-no-tests",
    "type-check": "bun --elide-lines=0 --filter '*' type-check",
    "type-check:ci": "bun --filter '*' type-check",
  };

  const keptScriptKeys = Object.keys(scripts).filter((key) => packageJson.scripts && key in packageJson.scripts);
  if (keptScriptKeys.length > 0) {
    log(`Keeping existing scripts (template not applied): ${keptScriptKeys.join(", ")}`);
  }

  const updatedPackageJson = {
    ...packageJson,
    scripts: { ...scripts, ...packageJson.scripts },
    trustedDependencies: mergeArrayField(packageJson.trustedDependencies, trustedDependencies),
    workspaces: mergeWorkspaces(packageJson.workspaces, workspaces),
  };

  await Bun.write(packageJsonPath, `${JSON.stringify(updatedPackageJson, null, 2)}\n`);
  log("✅ package.json updated successfully!");

  const createdConfigPaths = await setupConfigFiles();
  const failedSteps = await runSetupCommands(packageJson, createdConfigPaths);

  if (failedSteps.length > 0) {
    logError(`❌ Failed steps: ${failedSteps.join(", ")}`);
    logError("Setup completed with errors");
    process.exit(1);
  }

  log("✅ Monorepo setup completed");
  log("Next steps:");
  log("  1. Commit the generated files");
  log("  2. Create your first package under packages/ (each package should define a type-check script)");
  log("  3. Re-running setup is safe — existing files and existing package.json scripts are kept");
}

main().catch((err) => {
  logError("Failed to setup monorepo:", err);
  process.exit(1);
});
