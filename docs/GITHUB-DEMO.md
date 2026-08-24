# GitHub distribution

## Artifacts

| Channel | Output | Endpoint |
|---------|--------|----------|
| Pages | Static landing (`apps/thanh-hoai-runtime/docs`) | https://jokejoker-designer.github.io/ERPcompany-/ |
| Preview UI | React ERP v1.2 (browser demo data) | https://lagoon-thunder-glow-fleet.grok.me |
| Releases | Source archive `erpcompany-v*.tar.gz` | Tag `v*` → workflow `Release` |
| Packages | npm `@jokejoker-designer/erpcompany-demo` | Release → workflow `Publish demo package` |
| Local | Full stack | [`CHAY-LOCAL.md`](../CHAY-LOCAL.md) |

## Pages deploy

Source: **GitHub Actions** (`.github/workflows/pages.yml`).

Manual run: Actions → **Deploy demo Pages** → Run workflow.

## Release

```bash
git tag v1.2.0
git push origin v1.2.0
```

Creates GitHub Release + `erpcompany-v1.2.0.tar.gz`. Triggers npm publish for `@jokejoker-designer/erpcompany-demo`.

## Packages (npm)

Registry: `https://npm.pkg.github.com`

```bash
# .npmrc
@jokejoker-designer:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm view @jokejoker-designer/erpcompany-demo
```

Package scope: metadata and distribution pointers only. Application runtime remains clone + local install.
