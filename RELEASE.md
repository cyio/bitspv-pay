# Release Guide

## Automated Release (Recommended)

Push a version tag to trigger the GitHub Actions workflow, which builds the offline bundle and creates a GitHub Release automatically.

```bash
pnpm version patch   # or minor / major
git push --follow-tags
```

`pnpm version` bumps `package.json`, commits the change, and creates an annotated tag (e.g. `v0.1.1`). `--follow-tags` pushes both the commit and the tag. The workflow triggers on any `v*` tag.

The release will contain:
- `bitspv-offline-v<version>-<git-hash>.html` — standalone offline wallet, no server needed
- `bitspv-offline-v<version>-<git-hash>.html.sha256` — integrity checksum

---

## Manual Release

Use this if you need to build locally or skip CI.

```bash
# 1. Bump version
pnpm version patch

# 2. Build offline bundle
pnpm build:offline
# Output: dist-offline/bitspv-offline-v<version>-<hash>.html

# 3. Create GitHub Release
gh release create v<version> \
  dist-offline/bitspv-offline-*.html \
  dist-offline/bitspv-offline-*.html.sha256 \
  --title "v<version>"

# 4. Deploy PWA
pnpm ship:prod
```

---

## Verifying a Download

```bash
shasum -a 256 -c bitspv-offline-v<version>-<hash>.html.sha256
```
