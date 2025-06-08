import { existsSync } from "node:fs";
import { resolve } from "node:path";

const packages = Bun.argv.slice(2);

if (packages.length === 0) {
  console.error(
    "No packages provided. Usage: bun ./prepare-publish.ts ./packages/cli/hydra ./packages/cli/sisyphus",
  );
  process.exit(1);
}

console.info(
  `Removing dev dependencies from ${packages.length} package${packages.length > 1 ? "s" : ""}`,
);

const errors: Array<{ pkg: string; error: string }> = [];

for (const pkg of packages) {
  const pkgPath = resolve(pkg);
  const pkgFilePath = `${pkgPath}/package.json`;

  try {
    if (!existsSync(pkgFilePath)) {
      errors.push({ error: `package.json not found at ${pkgFilePath}`, pkg });
      continue;
    }

    const file = Bun.file(pkgFilePath);
    const { devDependencies: _, ...pkgJson } = await file.json();

    await Bun.write(pkgFilePath, `${JSON.stringify(pkgJson, null, 2)}\n`);
    console.info(`✅ Processed ${pkg}`);
  } catch (error) {
    errors.push({ error: error instanceof Error ? error.message : String(error), pkg });
  }
}

if (errors.length > 0) {
  console.error("\n❌ Errors occurred:");
  errors.forEach(({ pkg, error }) => {
    console.error(`  - ${pkg}: ${error}`);
  });
  process.exit(1);
}
