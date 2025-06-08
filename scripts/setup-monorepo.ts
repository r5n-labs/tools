#!/usr/bin/env bun

import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { colors } from "../utils/colors";
import { createLogger } from "../utils/logger";

const logger = createLogger({ prefix: "setup-monorepo" });

interface MonorepoConfig {
  name: string;
  workspaces?: string[];
  scripts?: Record<string, string>;
  templateConfigs?: TemplateConfig[];
}

interface TemplateConfig {
  filename: string;
  content: string | (() => string);
  overwrite?: boolean;
}

const DEFAULT_SCRIPTS = {
  build: "bun run --filter '*' build",
  clean: "rm -rf **/node_modules **/dist **/build **/.turbo",
  dev: "bun run --filter '*' dev",
  "install:fresh": "bun clean && bun install",
  lint: "bun biome check --write --unsafe",
  prepare: "bun run build",
  test: "bun run --filter '*' test",
  "type-check": "bun run --filter '*' type-check",
};

const DEFAULT_TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    content: () => `# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
out/
.next/
.turbo/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Logs
*.log
logs/

# Testing
coverage/
.nyc_output/

# Misc
.cache/
tmp/
temp/
`,
    filename: ".gitignore",
  },
  {
    content: () =>
      JSON.stringify(
        {
          compilerOptions: { baseUrl: ".", paths: { "@/*": ["./packages/*/src"] } },
          extends: "./tools/typescript/base.json",
          include: [],
          references: [],
        },
        null,
        2,
      ),
    filename: "tsconfig.json",
  },
  {
    content: () => JSON.stringify({ extends: ["./tools/biome.json"] }, null, 2),
    filename: "biome.json",
  },
];

async function setupMonorepo(config: Partial<MonorepoConfig> = {}) {
  const rootDir = resolve(process.cwd());
  const packageJsonPath = join(rootDir, "package.json");

  logger.info(`Setting up monorepo in ${colors.cyan(rootDir)}`);

  // Check if package.json exists
  let packageJson: any = {};
  if (existsSync(packageJsonPath)) {
    try {
      packageJson = await Bun.file(packageJsonPath).json();
      logger.info("Found existing package.json");
    } catch (error) {
      logger.error("Failed to read package.json:", error);
      process.exit(1);
    }
  } else {
    logger.info("Creating new package.json");
    packageJson = {
      name: config.name || "monorepo",
      private: true,
      type: "module",
      workspaces: config.workspaces || ["packages/*"],
    };
  }

  // Update scripts
  const scripts = { ...DEFAULT_SCRIPTS, ...config.scripts };
  packageJson.scripts = { ...packageJson.scripts, ...scripts };

  logger.info(`Adding ${Object.keys(scripts).length} scripts to package.json`);

  // Add common devDependencies if not present
  if (!packageJson.devDependencies) {
    packageJson.devDependencies = {};
  }

  const commonDevDeps = {
    "@biomejs/biome": "latest",
    "@types/bun": "latest",
    typescript: "^5.3.0",
  };

  for (const [dep, version] of Object.entries(commonDevDeps)) {
    if (!packageJson.devDependencies[dep]) {
      packageJson.devDependencies[dep] = version;
      logger.info(`Adding ${colors.green(dep)} to devDependencies`);
    }
  }

  // Write updated package.json
  await Bun.write(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  logger.info("Updated package.json");

  // Create template config files
  const templateConfigs = config.templateConfigs || DEFAULT_TEMPLATE_CONFIGS;

  for (const template of templateConfigs) {
    const filePath = join(rootDir, template.filename);
    const dirPath = join(rootDir, template.filename.split("/").slice(0, -1).join("/"));

    // Create directory if needed
    if (dirPath !== rootDir && !existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      logger.info(`Created directory ${colors.cyan(dirPath)}`);
    }

    if (existsSync(filePath) && !template.overwrite) {
      logger.warn(`Skipping ${colors.yellow(template.filename)} (already exists)`);
      continue;
    }

    const content = typeof template.content === "function" ? template.content() : template.content;

    await Bun.write(filePath, content);
    logger.info(`Created ${colors.green(template.filename)}`);
  }

  // Create default directories
  const defaultDirs = ["packages"];
  for (const dir of defaultDirs) {
    const dirPath = join(rootDir, dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      logger.info(`Created directory ${colors.cyan(dir)}/`);
    }
  }

  logger.info(colors.green("\n Monorepo setup complete!"));
  logger.info("\nNext steps:");
  logger.info(`  1. Run ${colors.cyan("bun install")} to install dependencies`);
  logger.info(`  2. Add your packages to ${colors.cyan("packages/")}`);
  logger.info(`  3. Run ${colors.cyan("bun dev")} to start development`);
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  const config: Partial<MonorepoConfig> = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--name":
      case "-n":
        config.name = args[++i];
        break;
      case "--workspaces":
      case "-w":
        config.workspaces = args[++i].split(",");
        break;
      case "--help":
      case "-h":
        console.log(`
${colors.bold("Usage:")} bun setup-monorepo [options]

${colors.bold("Options:")}
  -n, --name <name>              Set the monorepo name
  -w, --workspaces <paths>       Comma-separated workspace paths (default: packages/*)
  -h, --help                     Show this help message

${colors.bold("Examples:")}
  bun setup-monorepo
  bun setup-monorepo --name my-monorepo
  bun setup-monorepo --workspaces "packages/*,services/*,apps/*"
`);
        process.exit(0);
    }
  }

  setupMonorepo(config).catch((error) => {
    logger.error("Setup failed:", error);
    process.exit(1);
  });
}

export { setupMonorepo, type MonorepoConfig, type TemplateConfig };
