# Tools
__Shared configs for all repos__

## Clone

```bash
git submodule add git@github.com:r5n-labs/tools.git tools
```

If you have already cloned the repo, you can initialize the submodule with:

```bash
git submodule update --init --recursive
```

## Bootstrap a monorepo

```bash
cd tools && bun setup-monorepo
```

Generates root `package.json` scripts and workspaces, plus `biome.json`, `bunfig.toml`, `lefthook.yml`,
`.gitignore`, `.vscode/settings.json`, and `.github/workflows/ci.yml` in the parent repo.
Installs `@biomejs/biome`, `@types/bun`, `lefthook`, and `typescript` as root devDependencies.
Re-running is non-destructive — existing files and existing `package.json` scripts win.
