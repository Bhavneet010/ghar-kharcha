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

## Shared cloud data
Supabase is the only source of financial data. The app reads fresh cloud data at
startup, after every write or delete, on realtime events, and during periodic
foreground refreshes. Financial entries are not stored in `localStorage`.

If Supabase cannot be reached or rejects a change, the app leaves that change
unsaved and shows the operation and cloud error on the home screen.

Each non-cook user confirms their own cook-salary payment once per month. The
default amount per payer is stored in Supabase and can be changed in Settings.
Until a payer confirms, the app shows a monthly pending reminder for that user.

## Notes
- Currency is INR (₹). The cook only logs shopping and never pays.
- "Who pays next" = whoever (you or Ritika) has contributed less so far; the app shows
  the amount that would make you even.
- **Backup:** use Settings → Export to save a JSON copy of the current cloud data.
