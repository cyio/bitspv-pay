# Release Guide

## Automated Release (Recommended)

```bash
pnpm version patch   # or minor / major
git push --follow-tags
```

`pnpm version` bumps `package.json`, commits the change, and creates an annotated tag (e.g. `v1.5.1`). `--follow-tags` pushes both the commit and the tag. The GitHub Actions workflow triggers on any `v*` tag and publishes the release automatically.

The release will contain:
- `bitspv-pay-offline-v<version>-<git-hash>.html` — standalone offline wallet, no server needed
- `bitspv-pay-offline-v<version>-<git-hash>.html.sha256` — integrity checksum

---

## Manual Release

Use this if you need to build locally or skip CI.

```bash
# 1. Bump version
pnpm version patch

# 2. Build offline bundle
pnpm build:offline
# Output: dist-offline/bitspv-pay-offline-v<version>-<hash>.html

# 3. Create GitHub Release
gh release create v<version> \
  dist-offline/bitspv-pay-offline-*.html \
  dist-offline/bitspv-pay-offline-*.html.sha256 \
  --title "v<version>"

# 4. Deploy PWA
pnpm ship:prod
```

---

## Verifying a Download

```bash
shasum -a 256 -c bitspv-pay-offline-v<version>-<hash>.html.sha256
```
