const isProduction = process.env.NODE_ENV === "production";

export async function bunPackageBuilder({
  entrypoints,
  name,
  packages = "external",
  ...options
}: { entrypoints: string[]; name?: string; packages?: "bundle" | "external" } & Partial<
  Parameters<typeof Bun.build>[0]
>) {
  const packageJson = await Bun.file("./package.json").json();
  const packageName = name || packageJson.name;

  const cli = await Bun.build({
    define: isProduction ? { "process.env.NODE_ENV": '"production"' } : {},
    entrypoints,
    minify: isProduction,
    outdir: "./dist",
    packages,
    sourcemap: isProduction ? "none" : "inline",
    target: "bun",
    ...options,
  });

  if (!cli.success) {
    throw new AggregateError(cli.logs, "Build failed");
  }

  const bytesSize = cli.outputs[0]?.size || 0;

  console.info(`✅ ${packageName} build successful (${(bytesSize / 1024).toFixed(2)} KB)`);

  return true;
}
