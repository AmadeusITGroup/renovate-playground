# Rollback Instructions for Angular 21 Migration
## Project: renovate-playground
**Plan ID:** angular-migration-renovate-playground-20-to-21-20260119-1038  
**Created:** 2026-01-19 12:14  

---

## Quick Rollback (Git Tag Method)

### Using Git Reset (Recommended)
This method resets the repository to the state before migration started:

```bash
cd /Users/sahmed/workspace/GithubRepos/renovate-playground
git reset --hard angular-20-pre-upgrade-20260119-1038
```

⚠️ **WARNING:** This will discard ALL changes made during the migration, including commits.

---

## Partial Rollback (File-by-File Method)

If you want to keep some changes but rollback specific files, use the backup files:

### Restore package.json
```bash
cd /Users/sahmed/workspace/GithubRepos/renovate-playground
cp package.json.backup-20260119-1038 package.json
```

### Restore pnpm-lock.yaml
```bash
cd /Users/sahmed/workspace/GithubRepos/renovate-playground
cp pnpm-lock.yaml.backup-20260119-1038 pnpm-lock.yaml
```

### Restore nx.json
```bash
cd /Users/sahmed/workspace/GithubRepos/renovate-playground
cp nx.json.backup-20260119-1038 nx.json
```

### Restore apps/ui/project.json
```bash
cd /Users/sahmed/workspace/GithubRepos/renovate-playground
cp apps/ui/project.json.backup-20260119-1038 apps/ui/project.json
```

### After Restoring Files
```bash
# Reinstall dependencies at original versions
pnpm install --frozen-lockfile

# Rebuild to verify
pnpm nx run-many --target=build --all
```

---

## Backup File Locations

All backup files are stored in the repository root and project directories:

1. **package.json.backup-20260119-1038** - Main package configuration
2. **pnpm-lock.yaml.backup-20260119-1038** - Exact dependency versions
3. **nx.json.backup-20260119-1038** - Nx workspace configuration
4. **apps/ui/project.json.backup-20260119-1038** - Angular UI project configuration

---

## Git Tag Information

### Pre-Upgrade Tag
- **Tag Name:** `angular-20-pre-upgrade-20260119-1038`
- **Purpose:** Marks the last known good state before migration
- **Angular Version:** 20.0.0

### View Tag Details
```bash
git show angular-20-pre-upgrade-20260119-1038
```

### List All Migration Tags
```bash
git tag --list | grep angular
```

---

## Complete Rollback Steps

If you need to completely rollback and clean up:

```bash
# 1. Reset to pre-upgrade state
git reset --hard angular-20-pre-upgrade-20260119-1038

# 2. Clean untracked files (optional)
git clean -fd

# 3. Remove node_modules and reinstall
rm -rf node_modules
pnpm install --frozen-lockfile

# 4. Verify build works
pnpm nx run-many --target=build --all

# 5. Run tests to confirm
pnpm test --ci
```

---

## Verify Current State

### Check Angular Version
```bash
grep '"@angular/core"' package.json
```

### Check Git Status
```bash
git status
git log --oneline -10
```

### Check if on Pre-Upgrade Tag
```bash
git describe --tags
```

---

## Important Notes

1. **Backup Files Are Safe:** Even after rollback, backup files remain in the repository
2. **Git Tag Persists:** The pre-upgrade tag will always exist for reference
3. **CI/CD Impact:** If changes were pushed to remote, you may need to force push after rollback
4. **Docker Images:** Rebuild Docker images after rollback to use Angular 20

---

## Post-Rollback Verification

After rollback, verify everything is working:

```bash
# 1. Check versions
node --version          # Should be v22.12.0
pnpm --version          # Should be 10.28.1+
grep '@angular/core' package.json  # Should show ^20.0.0

# 2. Clean build
rm -rf dist
pnpm nx run-many --target=build --all

# 3. Run tests
pnpm test --ci

# 4. Start applications (manual test)
pnpm start:ui  # In terminal 1
pnpm start:api # In terminal 2
```

---

## Support

If rollback fails or you encounter issues:

1. Check git status for uncommitted changes
2. Verify backup files exist and are not corrupted
3. Review git log for any unexpected commits
4. Consider creating a new branch from the tag:
   ```bash
   git checkout -b rollback-branch angular-20-pre-upgrade-20260119-1038
   ```

---

**Rollback Instructions Ready** ✓  
**Tag Created:** angular-20-pre-upgrade-20260119-1038  
**Backups Created:** 4 files
