# Case Check

Pack list for video shoots. Gear lives in cases, kits compose per gig, and the
things you added just for this shoot get surfaced so they stop getting left behind.

Full requirements are in **SPEC.md**. Read that before changing anything.

## Status

**Phase 0 complete.** Foundation only: storage, backup, offline, install, theming.
No gear, kits, gigs or packing yet. That is Phase 1 and 2.

## Running it

No build step. It is a static site.

```
# any static server works, e.g.
npx serve .
# or
python3 -m http.server 8080
```

Open it, then check the Status card. Service worker should read `active`.

Note: service workers need `https://` or `localhost`. Opening `index.html`
directly with `file://` will work for the UI but the worker will not register
and nothing will be cached for offline.

## Deploying

GitHub Pages, from the repository root on the default branch.

1. Push the repo to GitHub.
2. Settings, Pages, Source: deploy from branch, root.
3. Open the Pages URL on the iPhone in Safari, Share, Add to Home Screen.

## The build number

`BUILD` is declared in **two** places and both must be bumped together on every
deploy:

- `index.html`, near the top of the script
- `sw.js`, first line

The service worker cache name is derived from `BUILD`. If you do not bump it,
an installed home-screen app will keep serving the old cached shell and your
update will appear not to have shipped. The number is shown in the app footer,
so you can always confirm what is actually running.

## Data

Everything is in IndexedDB on the device. There is no server and no account.

Object stores: `meta`, `containers`, `items`, `kits`, `gigs`, `photos`.

Schema changes are append-only. To add a store or an index:

1. Append a function to `DB.migrations`.
2. Raise `DB_VERSION` by exactly one.
3. Never edit a migration that has already shipped.

## Backup

Settings has Export and Restore. Export writes a single JSON file containing
every record plus photos as data URLs. Restore replaces everything.

**Run the tests after any change to the data layer.** There are two:

- In the app, Settings, "Run round-trip test". Quick, manual, runs on the real device.
- `npm test`. Headless, covers all ten Phase 0 acceptance criteria including the
  backup round trip with a photo, offline open, both themes, layout down to 320px,
  and whether `BUILD` matches between `index.html` and `sw.js`.

These are the only thing standing between a schema mistake and a lost gear library.

## Conventions

- Every colour is a token in `:root`. Never define a colour only inside a media
  query or a `[data-theme]` block, or one theme will render unreadably.
- The ambient gradient is the progress indicator. Drive it with `setProgress(0..1)`.
  Do not add conventional progress bars anywhere in this app.
- Never `await` between creating an IndexedDB transaction and using it.
- Minimum tap target 44px, minimum pack-screen row 56px.
- Everything animated needs a `prefers-reduced-motion` path.

## Tests

```
npm install     # installs playwright and a headless chromium, dev only
npm test
```

Writes `test/screenshot.png` so you can see what it saw. Ten checks, all of which
map to the acceptance criteria in SPEC.md section 6. It exits non-zero on failure,
so it works as a pre-deploy gate.
