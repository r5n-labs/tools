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

async function updateReadmeBadge(sizeKB: number, packageDir: string) {
  const readmePath = resolve(packageDir, "README.md");

  if (!existsSync(readmePath)) {
    console.warn(`⚠️  README not found at ${readmePath}, skipping badge update`);
    return;
  }

  const file = Bun.file(readmePath);
  let content = await file.text();

  const sizeBadgePattern = /https:\/\/img\.shields\.io\/badge\/bundle[_%20]size-~?\d+KB-green\.svg/g;
  const newBadge = `https://img.shields.io/badge/bundle_size-~${sizeKB}KB-green.svg`;

  if (!sizeBadgePattern.test(content)) {
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
  entrypoints,
  maxSize,
  name,
  packages = "external",
  updateReadme = false,
  ...options
}: BuilderOptions & Partial<Parameters<typeof Bun.build>[0]>) {
  if (!entrypoints || entrypoints.length === 0) {
    throw new Error("No entrypoints provided for build");
  }

  const packageJsonPath = "./package.json";
  let packageJson: any;

  try {
    const file = Bun.file(packageJsonPath);
    if (!(await file.exists())) {
      throw new Error(`Package.json not found at ${packageJsonPath}`);
    }
    packageJson = await file.json();
  } catch (error) {
    throw new Error(`Failed to read package.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  const packageName = name || packageJson.name || "unknown-package";

  const cli = await Bun.build({
    entrypoints,
    minify: true,
    outdir: "./dist",
    packages,
    sourcemap: "none",
    target: "bun",
    ...options,
  });

  if (!cli.success) {
    const errorMessage = `Build failed for ${packageName}\n${cli.logs.join("\n")}`;
    throw new Error(errorMessage);
  }

  if (!cli.outputs || cli.outputs.length === 0) {
    throw new Error(`No outputs generated for ${packageName}`);
  }

  const totalSize = cli.outputs.reduce((sum, output) => sum + (output.size || 0), 0);
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
    `✅ ${packageName} build successful (${sizeInKB} KB, ${cli.outputs.length} file${cli.outputs.length > 1 ? "s" : ""})`,
  );

  if (updateReadme) {
    await updateReadmeBadge(roundedSizeKB, process.cwd());
  }

  return true;
}
