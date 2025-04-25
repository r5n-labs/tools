const packages = Bun.argv.slice(2);

if (packages.length === 0) {
  console.error(
    "No packages provided. Usage: bun ./prepare-publish.ts ./packages/cli/hydra ./packages/cli/sisyphus",
  );
  process.exit(1);
}

console.info(`Removing dev dependencies paths ${packages.join(", ")}`);

for (const pkg of packages) {
  const pkgFilePath = `${pkg}/package.json`;

  const { devDependencies: _, ...pkgJson } = await Bun.file(pkgFilePath).json();

  await Bun.write(pkgFilePath, `${JSON.stringify(pkgJson, null, 2)}\n`);
}
