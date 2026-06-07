# CI/CD pipeline — ChatVerse frontend

## Flow

```
You push to `dev-frontend` (from VS Code)
   ↓
ci.yml runs   — npm ci + vite build (tsc included). ~2-3 min.
   ↓
On green ✅, auto-merge.yml fires
   ↓
main gets fast-forwarded to dev-frontend, push triggers
   ↓
Cloudflare Pages redeploys frontend (~2-3 min)
```

If CI **fails**, main stays untouched. Fix on `dev-frontend`, re-push.

## What runs

| File             | Trigger                       | What it does                  |
| ---------------- | ----------------------------- | ----------------------------- |
| `ci.yml`         | push to `dev-frontend`, any PR | `npm ci` + `vite build` (in `chatverse-client/`) |
| `auto-merge.yml` | `ci.yml` green on `dev-frontend` push | `git merge --ff-only dev-frontend` → push main |

## Required GitHub repo settings

1. **Settings → Actions → General** → "Workflow permissions" →
   - select **"Read and write permissions"**.
   - Tick **"Allow GitHub Actions to create and approve pull requests"**.
2. **Settings → Branches** → leave `main` UNPROTECTED for now.
3. **Cloudflare Pages dashboard** → confirm production branch is `main`.

## How to make a change

```bash
git checkout dev-frontend
# … edit code …
git add . && git commit -m "feat: …"
git push origin dev-frontend
```

Watch the Actions tab — CI runs → auto-merge runs → Cloudflare redeploys.

## When auto-merge refuses

If you see "main and dev-frontend have diverged" the workflow exited
on purpose. Fix:

```bash
git checkout dev-frontend
git pull origin main --rebase
git push origin dev-frontend
```
