# Pack list app: build spec

Name: **Kit Check**. Repo `kit-check`.

Owner: Dom Borka, Nrth Media. Solo videographer, Minneapolis. He is the only user of v1.

---

## 0. Read this first: why the app exists

Do not skip this section. Almost every design decision below follows from it.

Dom forgets one piece of gear on a shoot fairly regularly. Never the camera. It is always the lens step ring, the V-mount, the sandbag, or the thing he decided on Tuesday that he wanted to try. He finds out on the road or on location.

He already uses a checklist. The checklist is the thing that is failing. There are two separate reasons, and the app has to fix both.

**Failure one is structural.** His list is flat. Sixty items where the FX6 and the 82mm step ring render identically. He skims, because fifty of those items are muscle memory anyway, and the ones that get skipped are always the unusual ones.

> Design consequence: **the app must invert emphasis.** Habitual items collapse. Unusual items get promoted to the top at full size. A list that treats every row the same has already failed.

**Failure two is temporal.** The idea arrives on Tuesday while driving. Packing happens Thursday night. Nothing bridges those two moments except his memory, which is the thing that drops it.

> Design consequence: **capture must take under five seconds and must land on a specific gig.** If capture requires opening the app, navigating to a gig, and filling a form, it will not happen and the feature is decorative.

Everything else in this spec is in service of those two sentences.

---

## 1. Design direction

Dom picked three directions at once and they are reconcilable: **instrument precision, native-app polish, and usable at 6am in a garage.** Plus one specific idea of his own that should become the app's signature.

### 1.1 The gradient and the rings (revised after Dom's references)

Revised after three rounds of feedback. The look is now: Airbnb layout and air (white, spacious, shadows not borders, a friendly rounded sans in sentence case, small illustrations for warmth), Strava colour and weight (one bold accent, big numerals, chunky pill buttons, a full-bleed colour panel that peels away, an oversized punch on completion), and Apple Fitness rings for packing. The palette is Dom's: Ivory Vapor #FFFEEC ground, Obsidian Ash #222222 ink and primary buttons, Antique Brass #CAC426 as the single accent (with obsidian text on it, since white does not contrast on brass). The hero blob runs brass into amber into coral. The original gradient-is-the-progress-bar rule below is superseded: the gradient lives in one hero blob on the Home dashboard and on the first-run panel and grows with the inventory; three rings (packed, one-offs, cases loaded) own the pack screen, each fading red to green as it fills, with a strip of half-ring gauges per case beneath. The rest of this section is kept for history.

#### The original gradient rule

His idea, and it is the right one. Build the whole visual identity around it.

There is one ambient gradient layer behind all content, fixed to the viewport. It drifts slowly and continuously. **Its state is driven by completion of whatever the current screen is about.**

- On the first-run kit builder: the gradient is nearly absent on an empty kit and fills as items are added.
- On the pack screen: it tracks packed / total for the current gig. Empty is cool, faint, low coverage. Full is warm, saturated, covering most of the viewport.
- On completion it **blooms** once, then settles into a calm resting state.

Consequences:

- **There is no conventional progress bar anywhere in this app.** The page is the progress bar. A numeric count (`14/22`) is fine as a small mono label. A filled rectangle is not.
- The gradient must work in both light and dark. Light is a soft off-white ground with low-chroma colour pooling in from the edges. Dark is near-black with the same pools at much lower luminance and slightly higher chroma.
- It must never compromise legibility. Text contrast is measured against the gradient at its most saturated state, not against the base ground.

### 1.2 Motion

Dom asked for "lots of smooth clean animations." Read that as *considered* motion, not *abundant* motion. One orchestrated moment beats ten scattered effects.

Spend the motion budget here, in priority order:

1. **The tick.** Checking an item is the single most repeated interaction in the app. It should feel physically good. Spring-fill on the circle, the row settling, the gradient responding. Get this one right before anything else.
2. **The gradient response.** Every tick nudges the gradient. Ease it, do not snap it.
3. **Group collapse.** When every item in a case is ticked, the group animates closed to a single summary row. Use FLIP so the rows below move smoothly rather than jumping.
4. **Completion bloom.** Gradient blooms, a brief particle or light burst, then the load-out card rises in.
5. **Sheets.** Spring up from the bottom, backdrop blur behind.
6. **Screen transitions.** Restrained. A cross-fade with an 8px rise. Do not build shared-element transitions for v1.

Timing: 180–260ms for ordinary UI, 400–700ms for the celebratory moments. Entrance easing around `cubic-bezier(0.2, 0.8, 0.2, 1)`. Springs for anything that should feel physical.

**Everything above must have a `prefers-reduced-motion` path.** Under reduced motion the gradient renders statically at its current value, groups collapse without animation, and the completion bloom becomes a single static state change. No exceptions.

Performance bar: 60fps on an iPhone while ticking items rapidly. The gradient layer must be composited and must not repaint on scroll. Animate `transform` and `opacity` only.

### 1.3 Type and colour

Two typefaces, doing different jobs. This is where the instrument half lives.

- **UI face:** a precise grotesque with real weight range. Used for item names, headings, buttons.
- **Data face:** a monospace. Used for counts, case tags, dates, category labels, the build number. Tabular numerals wherever digits line up.

Avoid Inter and Space Grotesk. Both read as default choices and this should not look defaulted.

Colour:

- Neutrals get a slight hue bias rather than being pure grey. Pick the bias deliberately.
- **Case colours are user-chosen and are the primary colour information in the app.** The app's own accent must therefore stay low-chroma so it never competes with a user's bright yellow grip bag.
- Both themes are required, defined entirely through tokens. Never define a colour only inside a media query or a `[data-theme]` block.
- Follow the viewer's system theme by default, with a manual override that persists.

### 1.4 Ergonomics

Phone first. Design at 390px wide. Desktop is a centred column, not a separate layout.

- Assume one hand, in a garage, before sunrise, with the other hand holding a case lid.
- Pack screen rows: minimum 56px tall. Every tap target minimum 44px.
- Primary actions sit in the bottom third of the screen.
- Respect `env(safe-area-inset-*)` everywhere.
- Landscape is not a requirement.

### 1.5 Brand note

If a mark is needed: Dom's brand direction runs to solid, heavy geometric forms with rotational symmetry, where negative space does the work. Not hairline strokes. A slightly generic clean look is acceptable to him. The app icon should follow that.

---

## 2. Tech constraints

Dom has a working pattern from a previous app and this should match it, because it is proven and has zero deploy friction for him.

**Required:**

- Static hosting on **GitHub Pages**. No server, no backend, no build-time secrets.
- **PWA**: web app manifest, service worker, installable to iPhone home screen, correct icons and splash, standalone display mode.
- **Fully offline.** Every feature must work in a garage with no signal. There are no network calls in v1.
- **All data on-device.** IndexedDB for records and photos, localStorage for preferences only.
- **Manual backup and restore.** Export the whole database as a single JSON file, import it back. This is the only safety net, so it must be reliable and it must round-trip photos.
- **Visible build number** in Settings, so Dom can tell whether an update actually landed. Increment it on every deploy.
- Schema version field on the database, with a migration path. Do not ship without it.

**Preferred structure:** a single self-contained `index.html` plus `sw.js`, matching his existing app. If the animation and state work genuinely warrants a build step, Vite is acceptable, but the output must be static files committed for Pages, and the repo must stay simple enough that he can deploy by pushing.

**Photos:** resize client-side to max 800px on the long edge, encode as WebP or JPEG at reasonable quality, store the blob in IndexedDB. Never store full-resolution camera images. Cap total storage and warn before hitting it.

**No** accounts, analytics, telemetry, third-party scripts, or network requests in v1.

---

## 3. Data model

Five entities. Keep it this simple.

```
Container        // a case, bag, or backpack
  id: string
  name: string           // "Gray Nanuk"
  color: string          // hex, user-picked from a curated palette
  order: number

Item             // one piece of gear
  id: string
  name: string           // "Sony FX6"
  category: string       // camera | lens | audio | power | light | grip | drone | misc
  containerId: string    // its HOME case; may be empty
  photoId: string        // key into the photo store; may be empty
  note: string           // "fans broken, not for client shoots"
  archived: boolean
  createdAt: ISO string

Kit              // a block of gear added to a gig as one decision
  id: string
  name: string           // "Interview audio"
  itemIds: string[]
  order: number

Gig              // one shoot
  id: string
  name: string
  client: string
  date: ISO date string
  kitIds: string[]
  extraItemIds: string[] // one-offs; see §4.3, this list drives the whole app
  packed: { [itemId]: boolean }
  loaded: { [containerId]: boolean }
  notes: Note[]
  createdAt: ISO string
  completedAt: ISO string | null

Note             // a thought captured before packing
  id: string
  text: string
  at: ISO string
  itemIds: string[]      // gear this note pulled onto the gig
```

Notes on the model:

- An item's `containerId` is its **home**. Per-gig container overrides are explicitly out of scope for v1; add them only if Dom asks.
- `extraItemIds` is not a convenience field. It is the mechanism behind the app's core feature. An item on a gig is either inherited from a kit or added as a one-off, and one-offs are treated completely differently in the UI.
- Deleting an item must not corrupt kits or gigs. Filter dangling ids at read time rather than cascading deletes.

---

## 4. Screens

### 4.1 First run

**This is the most important screen in the app and it is not a settings wizard.** Dom explicitly wants the first thing he sees to be building and saving a kit.

Flow:

1. One short screen: what this is, in two sentences.
2. **"Let's build your first kit."** Name it, and suggest "Interview kit" as placeholder text, not as a prefilled value.
3. Add items to it, typing names. Each item gets a name and, optionally, a case and a photo. Keep the add loop fast: type, enter, type, enter. Do not force category or photo during onboarding.
4. **The gradient fills as items are added.** This is the moment that teaches the whole visual language of the app, so make it feel good.
5. Save the kit. Celebrate lightly, not with the full completion bloom, save that for packing.
6. Land on the gigs list with a clear next action: make your first gig.

Cases can be created inline during this flow, from the item form. Do not make him set up cases before he can add gear.

Offer a **skip to an empty app** for anyone who does not want the guided path.

### 4.2 Gigs list (home)

A list of shoots, soonest first. Each row: name, date, client, item count, and the completion state shown as a ring or a subtle gradient chip rather than a bar.

Past gigs move to a collapsed section below.

Primary action: **New gig**, in easy thumb reach.

Empty state gives one clear action, not a paragraph.

### 4.3 The pack screen

The heart of the app. Get this right and the rest is scaffolding.

Structure, top to bottom:

**a. Header.** Gig name, date, and a small mono count. Sticky. No progress bar, the gradient is the progress bar.

**b. "Not in your usual kit."** Every item from `extraItemIds` appears here, at full size, visually distinct, above everything else. A short line of copy explains why they are separated: they were added for this shoot specifically, so they are the ones that get left behind.

This block is the product. If it renders as just another group, the app has not solved Dom's problem.

**c. Case groups.** Everything inherited from kits, grouped by the item's home container, each group headed by the case's colour swatch, its name, and a mono count.

**Collapse behaviour:** when every item in a case is ticked, the group animates closed into a single summary row showing the case name, its colour, and a check. This is what makes a sixty-item list readable. Tapping a collapsed group reopens it.

**d. Add to this shoot.** A prominent action that opens a fast picker over existing gear, with the option to create a new item inline. Anything added this way goes into `extraItemIds` and therefore appears in the block at the top.

**e. Notes.** Everything captured for this gig, shown while packing, because the whole point is that Tuesday's thought is in front of him on Thursday.

**f. Load out.** Hidden until every item is ticked. Then the completion bloom fires and this card rises in.

It lists only the cases this gig actually uses, as its own checklist. Copy should make the distinction plainly: cases packed is not the same as cases in the vehicle. Same tick interaction, same satisfaction.

A gig is only "done" when both the items and the cases are checked.

### 4.4 Gear

The inventory, grouped by case. Each row shows the photo thumbnail, name, and category. Tapping opens the item editor.

Also where cases are managed: create, rename, recolour, reorder.

Search across item names, and it needs to be fast because this list will grow past a hundred items.

### 4.5 Kits

List of kits with item counts. Tap to edit: rename, add and remove items, delete.

Add one thing Dom did not ask for but will want within a month: **"Save as new kit"** from a gig, so that when he assembles a fresh combination for a shoot he can keep it without rebuilding it by hand. He said the ability to save a freshly built kit matters.

### 4.6 Capture

The five-second path. Reachable from anywhere, ideally a persistent action rather than a tab buried behind navigation.

Type a thought, pick a gig, done. Optionally attach gear from inventory in the same sheet, but never require it, because a note with no gear attached is still worth capturing, and forcing the gear step is what will stop him using it.

### 4.7 Settings

Export backup. Import backup. Theme override. Build number. Storage used. Delete everything, behind a confirm.

---

## 5. Build phases

Ship each phase working. Do not build all the screens at 40% and then polish.

**Phase 0: foundation**
Repo, GitHub Pages deploy, PWA manifest, service worker, install to home screen verified on an actual iPhone. IndexedDB layer with schema version and migration. Export and import JSON. Build number in Settings. Design tokens for both themes.

*Done when:* it installs to the home screen, opens offline, and a backup round-trips through export and import with nothing lost.

**Phase 1: gear, cases, kits, first run**
The first-run kit builder. Item, case, and kit CRUD. Photos with client-side resize. Search. A basic version of the ambient gradient responding to kit size.

*Done when:* Dom can build his real inventory and kits, close the app, and find everything there tomorrow.

**Phase 2: gigs and packing**
Gigs list, gig creation with kit selection, the pack screen with case grouping, the "not in your usual kit" block, ticking, one-off adds, group collapse.

*Done when:* he can pack a real shoot end to end.

**Phase 3: the identity pass** (partly pulled forward after Phase 1, on Dom's feedback that the plain version felt stale: fonts, glass surfaces, gradient, swipe navigation, page transitions, stagger, pop, sheet drag are done; the pack-screen moments below still belong here)
The full state-driven gradient. The tick animation. FLIP group collapse. Completion bloom. Load-out card. Sheet springs. Reduced-motion paths for all of it. The 60fps check on a real phone.

*Done when:* it stops looking like a prototype.

**Phase 4: capture and sharing**
Quick capture sheet. Notes rendered on the pack screen. Read-only share of a pack list, so a second person on set can see what is in which case. Given the no-backend constraint, do this as a URL-encoded snapshot or an exported file rather than building sync.

**Later, only if asked**
Post-shoot review (what you did not touch, what you wished you had) feeding kit suggestions. Return check for gear left on location. Cloud sync. AI capture.

On AI capture specifically: it needs a network call and an API key, which conflicts with the offline-first, no-backend, no-secrets constraints. If it gets built, the key lives in on-device settings and the feature degrades silently to manual entry when absent. It is a personal-use pattern and is not safe to ship to other people. Do not attempt it before Phase 4.

---

## 6. Acceptance criteria

Testable, and worth actually testing.

1. Installs to iPhone home screen, launches standalone, works with airplane mode on.
2. Backup export then import on a cleared database restores every item, case, kit, gig, note, and photo.
3. A gig with 60 items across 6 cases renders in under 100ms and scrolls at 60fps.
4. Ticking items rapidly never drops a tap and never drops frames.
5. One-off items appear above every case group, visually distinct, on every gig that has them.
6. A fully ticked case group collapses to one row, and rows below it move without jumping.
7. Completing every item fires the bloom exactly once and reveals the load-out card.
8. Reloading mid-pack restores the exact packed state.
9. Both themes pass WCAG AA contrast for body text, measured over the gradient at full saturation.
10. With `prefers-reduced-motion: reduce`, no drift, no bloom, no spring, and every state still legible.
11. Deleting an item that a kit and a gig both reference breaks neither.
12. Entire UI usable one-handed on a 390px viewport with no horizontal scroll.

---

## 7. Non-goals for v1

Say no to all of these:

- Accounts, login, multi-user, real-time sync.
- Any backend or server.
- Per-gig container overrides.
- Gear rental, maintenance logs, serial numbers, insurance values, purchase dates.
- Crew management, call sheets, scheduling, calendar integration.
- Barcode or QR tagging of cases.
- Push notifications. A web app cannot deliver them reliably on iOS, and pretending otherwise builds a feature that silently fails. The mitigation is that captured thoughts are attached to the gig and surface at pack time.
- Anything that requires a second person to adopt the app.

---

## 8. Notes for the agent building this

- Build Phase 0 completely before writing a single screen. The migration path and the backup are the things that hurt if they are retrofitted.
- The gradient system is an identity decision, not a nice-to-have. Prototype it in isolation, on a phone, before wiring it to real state. If it looks cheap or hurts performance, change the approach rather than shipping it dimmed.
- Seed a realistic dataset for development. An empty app tells you nothing about whether the collapse behaviour and the one-off block actually work. Use roughly 40 items across 7 cases and 8 kits.
- If you have mobile UI, design critique, or accessibility skills available, run them at the end of Phase 3, not before. Critique on an unstyled prototype wastes the pass.
- Write the copy as a person would speak. Short, direct, no exclamation marks, no "Oops!". Dom's own tone is casual and direct, and he actively dislikes copy that reads as AI-generated. Avoid em dashes throughout the interface.
- Commit the build number bump in the same commit as the deploy so it never lies.

---

## 9. Source of the requirements

Everything in §0 and §1 came from Dom directly, in his words:

- Forgetting gear is the real problem. "Whether a lens setup ring or a vmount or a sandbag. Feel like there's almost always something that slips."
- It is never core kit. "Could be something extra I wanted to try. Never like a camera in my case."
- He realizes too late. "Randomly think of it on the road when it's to late or at the shoot."
- He packs the night before, or day-of for later calls.
- He already ticks a list. "I currently do that most of the time. But having pre designed kits or something would be a game changer."
- His own spec: build a kit from items with photo and name, a new-gig flow that takes a prebuilt or freshly saved kit, check off as you pack, assign gear to a specific case so someone else on set can find it, celebrate completion, then a second prompt to load the cases into the vehicle, easy one-off adds, and fast capture of "add X to Friday's shoot."
- Look and feel: instrument, clean native app, and dark enough for 6am. "Maybe a soft white with. Moving gradient. As you add to your kit the gradient chances or slightly filled the page. Lots of smooth clean animations."

When a decision in this spec conflicts with something Dom says later, he wins.
