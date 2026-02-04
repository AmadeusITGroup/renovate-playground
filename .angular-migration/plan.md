# Angular Migration Plan: renovate-playground
**Generated**: 20260204-1055
**Source**: Angular 20
**Target**: Angular 21
**Plan ID**: angular-migration-renovate-playground-20260204-1055
**Status**: Ready for Execution

## Executive Summary
- Migration approach: Direct (20 → 21) with staged validation checkpoints.
- Estimated effort: 2–4 days.
- Risk level: Medium (Angular Material + Design Factory compatibility, toolchain upgrades).
- Node.js upgrade required: Verify Node >= 20.19.0 or 22.12.0 (CI/Docker currently use 22.x).

## Chapter 0: Pre-Planning Validation
1. **Confirm Angular 21 support**
   - Verified against the bundled compatibility matrix (Angular 21 listed as active).
   - Requirements: Node 20.19.0+ or 22.12.0+ (or 24.x), TypeScript 5.9.x, RxJS 7.4+.
2. **Architecture signals**
   - Nx monorepo with Angular UI app (`apps/ui`) and Nest API (`apps/api`).
   - Angular Material + CDK in use.
   - Amadeus Design Factory in use.
   - Bootstrap CSS in use.
3. **Dependency matrix loaded**
   - Use exact versions from `assets/angular-dependency-matrix.csv` for Angular 21.

## Chapter 1: Discovery and Current State
- **Workspace**: Nx (no `angular.json`), Angular UI app + Nest API app.
- **Angular**: 20.x (core/cli/material/cdk), Angular Material in UI app.
- **Package manager**: pnpm with `--frozen-lockfile` in CI.
- **CI/CD**: GitHub Actions uses Node 22.x; Docker build uses Node 22 images.
- **Test stack**: Jest for unit tests; Cypress dependency present.
- **Key dependencies**:
  - `@design-factory/design-factory` 20.x
  - `bootstrap` 5.3.3
  - `rxjs` 7.8.x
  - `zone.js` 0.16.x

### Optional Artifacts
- `.angular-migration/findings/current-state.json`
- `.angular-migration/findings/dependencies.json`

## Chapter 2: Compatibility Assessment
### 2.1 Platform & Tooling
- **Node.js**: Angular 21 requires Node 20.19.0+ / 22.12.0+ / 24.x.
  - CI uses Node 22.x; confirm minor version (>=22.12.0).
  - Docker base images should match required Node runtime.
- **TypeScript**: Upgrade to 5.9.x (current: 5.8.3).
- **RxJS**: 7.8.x is compatible; keep on 7.8.x unless Angular 21 updates it.

### 2.2 Angular & Material
- Upgrade `@angular/*`, `@angular-devkit/*`, `@angular/cli` to 21.
- Angular Material is already on MDC (required since 17). Validate components after update.

### 2.3 Third‑Party Compatibility (Matrix‑based)
Use exact versions for Angular 21:
- **Design Factory**: 21.0.x
- **Bootstrap CSS**: 5.3.8
- **Ng-Bootstrap**: 20.0.x (only if used)
- **Ng-select**: 21.x (only if used)
- **Ag-grid**: 35.x (only if used)
- **AgnosUI**: 0.10.x (only if used)

### 2.4 Nx Compatibility
- Verify Nx version support for Angular 21.
- If Nx 21.x does not support Angular 21, upgrade Nx to latest compatible major before Angular update.

### 2.5 Update Guide Links
- Angular Update Guide: https://angular.dev/update-guide?v=20-21&l=1

## Chapter 3: Migration Planning
### 3.1 Strategy
- Direct upgrade from Angular 20 → 21.
- Keep incremental checkpoints with commits and CI validation.

### 3.2 Pre-flight Checklist
- Create a migration branch.
- Ensure clean working tree.
- Confirm local Node version and pnpm version.
- Confirm CI/Docker Node minor versions are compatible.

### 3.3 Dependency Version Targets
| Package | Target Version | Notes |
| --- | --- | --- |
| @angular/* | 21.x | Core/CLI/Material/CDK/Compiler/Devkit |
| typescript | 5.9.x | Required for Angular 21 |
| @design-factory/design-factory | 21.0.x | From dependency matrix |
| bootstrap | 5.3.8 | From dependency matrix |
| rxjs | 7.8.x | Keep unless Angular 21 requires change |
| zone.js | Per Angular 21 | Let Angular update adjust |

### 3.4 Execution Steps (High Level)
1. **Update Nx (if required)**
   - Check Nx compatibility matrix; upgrade if needed (likely Nx 22.x).
   - Run migrations: `pnpm nx migrate <target>` then `pnpm nx migrate --run-migrations`.
2. **Update Angular Core/CLI**
   - `pnpm ng update @angular/cli@21 @angular/core@21`
   - Commit: `feat: update angular core/cli to 21`
3. **Update Angular Material/CDK**
   - `pnpm ng update @angular/material@21 @angular/cdk@21`
   - Commit: `feat: update angular material/cdk to 21`
4. **Update Tooling**
   - `pnpm add -D typescript@5.9.x`
   - `pnpm add -D @angular-devkit/build-angular@21 @angular/compiler-cli@21`
   - Update `@angular-eslint/*` to Angular 21 compatible versions.
   - Commit: `chore: update angular tooling`
5. **Update Third‑Party UI Dependencies**
   - `pnpm add @design-factory/design-factory@21.0.x`
   - `pnpm add bootstrap@5.3.8`
   - Commit: `chore: update ui dependencies`
6. **Run Migrations & Fixes**
   - Apply CLI migration output.
   - Resolve any TS 5.9 / Angular 21 deprecations.
7. **Validation**
   - `pnpm lint`
   - `pnpm test`
   - `pnpm nx build ui --configuration=production`
   - `pnpm nx build api --configuration=production`
   - Visual check for Material + Design Factory components.

## Chapter 4: Implementation Roadmap
### Phase 1: Environment Preparation
- [ ] Create migration branch.
- [ ] Confirm Node version locally and in CI/Docker (>=20.19.0 or 22.12.0).
- [ ] Confirm pnpm lockfile is clean.

### Phase 2: Nx Compatibility (if needed)
- [ ] Upgrade Nx to compatible version for Angular 21.
- [ ] Run Nx migrations and commit.

### Phase 3: Angular Core/CLI Update
- [ ] Run Angular update for core/cli.
- [ ] Commit changes.

### Phase 4: Material/CDK Update
- [ ] Run Angular Material/CDK update.
- [ ] Commit changes.

### Phase 5: Tooling & Third‑Party Updates
- [ ] Update TypeScript 5.9.x and Angular tooling packages.
- [ ] Update Design Factory + Bootstrap versions from matrix.
- [ ] Commit changes.

### Phase 6: Validation & CI
- [ ] Run lint/tests/builds.
- [ ] Update CI/Docker Node versions if required.
- [ ] Ensure production build outputs correct artifacts.

### Rollback Strategy
- Use git commits between phases; revert to previous commit if a phase fails.

### Execution Context for Migration
```json
{
  "plan_id": "angular-migration-renovate-playground-20260204-1055",
  "migration_type": "angular",
  "source_version": "20",
  "target_version": "21",
  "incremental_upgrade": false,
  "node_js_requirements": {
    "current": "unknown (CI uses 22.x)",
    "required_for_target": "20.19.0+ or 22.12.0+",
    "upgrade_needed": "verify"
  }
}
```

## External Research Workflow
- Check `@nx/angular` + Nx release notes for Angular 21 support.
- Validate `@design-factory/design-factory@21.0.x` peer dependencies.
- Review Angular 21 release notes for breaking changes.
- Verify `@angular-eslint` compatibility for Angular 21.

## Risks and Mitigations
- **Medium**: Design Factory compatibility → mitigate with matrix version and peerDependency checks.
- **Medium**: TypeScript 5.9 update impacts Nest API → run API tests/build after TS upgrade.
- **Low**: Material visual regressions → visual sanity pass post-upgrade.

## Next Steps
- Review this plan.
- If approved, run the execution workflow using the execute-angular-migration skill.
