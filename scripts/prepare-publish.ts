import { copyFileSync, existsSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BACKUP_SUFFIX = ".pre-publish.bak";
const CATALOG_PREFIX = "catalog:";

const args = Bun.argv.slice(2);
const restore = args.includes("--restore");
const packages = args.filter((arg) => arg !== "--restore");

if (packages.length === 0) {
  console.error(
    "No packages provided. Usage: bun ./prepare-publish.ts [--restore] ./packages/hydra ./packages/sisyphus",
  );
  process.exit(1);
}

async function loadRootPackageJson(packagePath: string) {
  let currentPath = resolve(packagePath);

  while (currentPath !== dirname(currentPath)) {
    const rootPkgPath = resolve(currentPath, "package.json");
    if (existsSync(rootPkgPath)) {
      const file = Bun.file(rootPkgPath);
      const rootPkg = await file.json();

      if (rootPkg.workspaces) {
        return rootPkg;
      }
    }
    currentPath = dirname(currentPath);
  }

  throw new Error("Could not find root package.json with workspaces");
}

function extractCatalogs(rootPkg: any) {
  const catalogs: Record<string, Record<string, string>> = { default: {} };

  if (rootPkg.catalog) {
    catalogs.default = rootPkg.catalog;
  }

  if (rootPkg.workspaces?.catalog) {
    catalogs.default = { ...catalogs.default, ...rootPkg.workspaces.catalog };
  }

  if (rootPkg.catalogs) {
    Object.assign(catalogs, rootPkg.catalogs);
  }

  if (rootPkg.workspaces?.catalogs) {
    Object.assign(catalogs, rootPkg.workspaces.catalogs);
  }

  return catalogs;
}

function resolveDependencies(
  deps: Record<string, string> | undefined,
  catalogs: Record<string, Record<string, string>>,
  packageName: string,
) {
  if (!deps) return deps;

  const resolved: Record<string, string> = {};

  for (const [name, version] of Object.entries(deps)) {
    if (!version.startsWith(CATALOG_PREFIX)) {
      // workspace: specifiers stay as-is — bun publish resolves them at pack time (npm publish is not supported).
      resolved[name] = version;
      continue;
    }

    const catalogName = version.slice(CATALOG_PREFIX.length) || "default";
    const catalogVersion = catalogs[catalogName]?.[name];

    if (!catalogVersion) {
      throw new Error(`Catalog "${catalogName}" has no entry for "${name}" (required by ${packageName})`);
    }

    resolved[name] = catalogVersion;
  }

  return resolved;
}

function reportErrorsAndExit(errors: Array<{ pkg: string; error: string }>): void {
  if (errors.length === 0) return;

  console.error("\n❌ Errors occurred:");
  errors.forEach(({ pkg, error }) => {
    console.error(`  - ${pkg}: ${error}`);
  });
  process.exit(1);
}

const errors: Array<{ pkg: string; error: string }> = [];

if (restore) {
  console.info(`Restoring ${packages.length} package${packages.length > 1 ? "s" : ""} from backup`);

  for (const pkg of packages) {
    const pkgFilePath = `${resolve(pkg)}/package.json`;
    const backupPath = `${pkgFilePath}${BACKUP_SUFFIX}`;

    if (!existsSync(backupPath)) {
      errors.push({ error: `No backup found at ${backupPath} — was prepare-publish run for this package?`, pkg });
      continue;
    }

    renameSync(backupPath, pkgFilePath);
    console.info(`✅ Restored ${pkg}`);
  }

  reportErrorsAndExit(errors);
  process.exit(0);
}

console.info(`Preparing ${packages.length} package${packages.length > 1 ? "s" : ""} for publish`);

let catalogs: Record<string, Record<string, string>> | null = null;

for (const pkg of packages) {
  const pkgPath = resolve(pkg);
  const pkgFilePath = `${pkgPath}/package.json`;

  try {
    if (!existsSync(pkgFilePath)) {
      errors.push({ error: `package.json not found at ${pkgFilePath}`, pkg });
      continue;
    }

    if (!catalogs) {
      const rootPkg = await loadRootPackageJson(pkgPath);
      catalogs = extractCatalogs(rootPkg);
    }

    const file = Bun.file(pkgFilePath);
    const { devDependencies: _, ...pkgJson } = await file.json();

    const resolvedPkg = {
      ...pkgJson,
      dependencies: resolveDependencies(pkgJson.dependencies, catalogs, pkgJson.name),
      optionalDependencies: resolveDependencies(pkgJson.optionalDependencies, catalogs, pkgJson.name),
      peerDependencies: resolveDependencies(pkgJson.peerDependencies, catalogs, pkgJson.name),
    };

    if (!existsSync(`${pkgFilePath}${BACKUP_SUFFIX}`)) {
      copyFileSync(pkgFilePath, `${pkgFilePath}${BACKUP_SUFFIX}`);
    }
    await Bun.write(pkgFilePath, `${JSON.stringify(resolvedPkg, null, 2)}\n`);
    console.info(`✅ Processed ${pkg}`);
  } catch (error) {
    errors.push({ error: error instanceof Error ? error.message : String(error), pkg });
  }
}

reportErrorsAndExit(errors);
