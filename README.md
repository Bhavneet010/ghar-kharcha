# Ghar Kharcha — Daily Expenses PWA

A shared kitchen-expense tracker for you, Ritika, and the cook. Tracks daily grocery
shopping, the advance balance left with the cook, monthly salary, low-balance alerts,
and a "who has paid how much" settle-up ledger.

**Live app:** https://bhavneet010.github.io/ghar-kharcha/ (after enabling GitHub Pages)

## What's here

| File | Purpose |
|---|---|
| `index.html` | The whole app — UI + logic in one file |
| `manifest.webmanifest` | Makes it installable as an app |
| `sw.js` | Service worker (offline support) |
| `icon.svg` | App icon |

## Install on a phone
Open the live link in Chrome (Android) or Safari (iPhone) → menu → **Add to Home screen**.

## Stage 2 — shared data across all three phones (next step)
Right now data lives on each phone. To sync everyone to one live balance, add a free
**Supabase** database and swap the `Store.load()/save()` layer in `index.html` (already
isolated for this). Steps and the SQL will be added here when set up.

## Notes
- Currency is INR (₹). The cook only logs shopping and never pays.
- "Who pays next" = whoever (you or Ritika) has contributed less so far; the app shows
  the amount that would make you even.
- **Backup:** until cloud sync is on, use Settings → Export to save a copy of the data.
