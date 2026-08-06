# NQL

Utilities for using NQL

## Install


## Usage


## Develop

This is a monorepo managed with [Lerna](https://lerna.js.org/) and pnpm workspaces.

1. `git clone` this repo & `cd` into it as usual
2. Enable Corepack with `corepack enable`
3. Run `pnpm setup`
   - installs all external dependencies
   - links all internal dependencies

To add a new package to the repo:
   - install [slimer](https://github.com/TryGhost/slimer)
   - run `slimer new <package name>`


## Run

- `pnpm dev`


## Test

- `pnpm lint` runs just ESLint
- `pnpm test` runs lint and tests


## Publish

- `pnpm ship` is an alias for `lerna version`
    - Bumps the version of all packages which have changed, also updating any packages which depend on them
    - Commits the new versions ("Published new versions"), tags the releases, and pushes to the remote (set `GHOST_UPSTREAM` to push to a remote other than `origin`)
    - Publishing to npm happens in CI: the [Publish workflow](.github/workflows/publish.yml) picks up the version commit on `main` and publishes any package versions missing from the registry via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers)
    - If a publish fails, re-run the Publish workflow from the Actions tab (with dry-run disabled) — it only publishes versions not yet on the registry, so it is safe to retry


# Copyright & License 

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
