import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SIZE_BUDGETS_KB = { l: 500, m: 200, s: 100, xl: 1000, xs: 50 };

type SizeBudget = keyof typeof SIZE_BUDGETS_KB | number;

interface BuilderOptions {
  entrypoints: string[];
  maxSize?: SizeBudget;
  name?: string;
  packages?: "bundle" | "external";
  updateReadme?: boolean;
}

interface PackageJson {
  bin?: Record<string, string> | string;
  exports?: string | Record<string, string | Record<string, unknown>>;
  main?: string;
  name?: string;
  scripts?: Record<string, string>;
  types?: string;
}

function resolveEntrypoints(exportsField: PackageJson["exports"]): string[] {
  if (!exportsField) return [];
  if (typeof exportsField === "string") return [exportsField];

  const entrypoints: string[] = [];

  for (const value of Object.values(exportsField)) {
    if (typeof value === "string") {
      entrypoints.push(value);
      continue;
    }

    if (typeof value !== "object" || value === null) continue;

    const resolved = [value.bun, value.import, value.default].find((candidate) => typeof candidate === "string");
    if (typeof resolved === "string") entrypoints.push(resolved);
  }

  return entrypoints;
}

async function updateReadmeBadge(sizeKB: number, packageDir: string) {
  const readmePath = resolve(packageDir, "README.md");

  if (!existsSync(readmePath)) {
    console.warn(`⚠️  README not found at ${readmePath}, skipping badge update`);
    return;
  }

  const file = Bun.file(readmePath);
  let content = await file.text();

  const sizeBadgePattern = /https:\/\/img\.shields\.io\/badge\/bundle(?:_|%20)size-~?\d+KB-green\.svg/g;
  const newBadge = `https://img.shields.io/badge/bundle_size-~${sizeKB}KB-green.svg`;

  if (!content.match(sizeBadgePattern)) {
    console.warn(`⚠️  No bundle size badge found in ${readmePath}`);
    return;
  }

  content = content.replace(sizeBadgePattern, newBadge);

  const textSizePattern = /\*\*\d+KB (of Pure Speed|of Excellence)\*\*/g;
  content = content.replace(textSizePattern, `**${sizeKB}KB $1**`);

  await Bun.write(readmePath, content);
  console.info(`   📝 Updated README.md badge to ${sizeKB}KB`);
}

export async function bunPackageBuilder({
  maxSize,
  type,
  packages = "external",
  updateReadme = false,
  ...options
}: Omit<BuilderOptions & Partial<Parameters<typeof Bun.build>[0]>, "entrypoints"> & {
  type?: "cli";
  entrypoints?: string[];
}) {
  const pkgJson = (await Bun.file("package.json").json()) as PackageJson;
  const packageName = pkgJson.name || "unknown-package";

  if (pkgJson.scripts?.["type-check"]) {
    try {
      await Bun.$`bun run type-check`;
    } catch (e) {
      throw new Error(`Type check failed for ${packageName}`, { cause: e });
    }
  }

  // cli convention: "types" points at the TS source entrypoint to bundle, "main" at the built binary to chmod.
  if (type === "cli" && !pkgJson.types) {
    throw new Error(
      `cli build for ${packageName} requires "types" in package.json to point at the TS source entrypoint`,
    );
  }

  const parsedEntrypoints = type === "cli" ? [`./${pkgJson.types}`] : resolveEntrypoints(pkgJson.exports);
  const entrypoints = options.entrypoints || parsedEntrypoints;

  if (!entrypoints || entrypoints.length === 0) {
    throw new Error(
      `No entrypoints provided for build — pass options.entrypoints, define them in package.json "exports", or set type: "cli"`,
    );
  }

  const build = await Bun.build({
    entrypoints,
    minify: true,
    outdir: "./dist",
    packages,
    sourcemap: "none",
    target: "bun",
    ...options,
  });

  if (!build.success) {
    const errorMessage = `Build failed for ${packageName}\n${build.logs.join("\n")}`;
    throw new Error(errorMessage);
  }

  if (!build.outputs || build.outputs.length === 0) {
    throw new Error(`No outputs generated for ${packageName}`);
  }

  const totalSize = build.outputs.reduce((sum, output) => sum + (output.size || 0), 0);
  const sizeInKB = (totalSize / 1024).toFixed(2);
  const roundedSizeKB = Math.round(totalSize / 1024);

  if (maxSize) {
    const budgetKB = typeof maxSize === "number" ? maxSize : SIZE_BUDGETS_KB[maxSize];
    const actualKB = totalSize / 1024;

    if (actualKB > budgetKB) {
      const overBy = (actualKB - budgetKB).toFixed(2);
      throw new Error(`❌ ${packageName} exceeds size budget: ${sizeInKB}KB > ${budgetKB}KB (over by ${overBy}KB)`);
    }
  }

  console.info(
    `✅ ${packageName} build successful (${sizeInKB} KB, ${build.outputs.length} file${build.outputs.length > 1 ? "s" : ""})`,
  );

  if (updateReadme) {
    await updateReadmeBadge(roundedSizeKB, process.cwd());
  }

  if (process.platform !== "win32" && type === "cli") {
    if (!pkgJson.main || !existsSync(pkgJson.main)) {
      throw new Error(
        `cli build for ${packageName} requires "main" in package.json to point at the built binary, got "${pkgJson.main}"`,
      );
    }

    await Bun.$`chmod +x ./${pkgJson.main}`.quiet();
  }

  return true;
}
