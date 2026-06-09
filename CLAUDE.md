# Ghar Kharcha — Claude Instructions

## Git workflow
After completing any change:
1. Bump the service worker cache version in `sw.js` (e.g. `ghar-kharcha-v5` → `v6`) so all clients pick up the new files.
2. Merge to `main` and push to `origin/main` — no separate PR step needed unless explicitly asked.
