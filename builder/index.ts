const SIZE_BUDGETS_KB = { l: 500, m: 200, s: 100, xl: 1000, xs: 50 };

type SizeBudget = keyof typeof SIZE_BUDGETS_KB | number;

export async function bunPackageBuilder({
  entrypoints,
  maxSize,
  name,
  packages = "external",
  ...options
}: { entrypoints: string[]; maxSize?: SizeBudget; name?: string; packages?: "bundle" | "external" } & Partial<
  Parameters<typeof Bun.build>[0]
>) {
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
    const errorMessage = `Build failed for ${packageName}`;
    throw new AggregateError(cli.logs, errorMessage);
  }

  if (!cli.outputs || cli.outputs.length === 0) {
    throw new Error(`No outputs generated for ${packageName}`);
  }

  const totalSize = cli.outputs.reduce((sum, output) => sum + (output.size || 0), 0);
  const sizeInKB = (totalSize / 1024).toFixed(2);

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

  return true;
}
