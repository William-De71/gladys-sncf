# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for SNCF trains: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
node .github/scripts/release.mjs plan     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only: handlers registered before connect()
src/sncf-api.js         SNCF API client (Navitia: journeys, departures, places)
src/stations.js         station names, UIC codes and ids -> stop areas
src/schedule.js         when a trip is read, and which trains are followed
src/watcher.js          one timer chain per trip -> snapshots
src/quota.js            the 5 000 requests a day of the free key
src/trains.js           API answers -> trains (delays, cancellations, causes)
src/tracker.js          snapshots -> scene trigger transitions (pure logic)
src/device.js           the "SNCF – <from> → <to>" devices and their states
src/events.js           scene trigger payloads
src/scene-actions.js    scene action outputs
src/widgets.js          dashboard widget contents
src/i18n.js             runtime texts, en / fr / de / es
src/store.js            JSON files under /data (quota, stations, fired events)
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
docs/illustrations/render.sh        regenerates the widget illustrations (docs/assets)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids, feature `category` / `type` / `unit` / `min` / `max` /
  `step`, the keys of `config_schema`, `actions`, widgets and their settings,
  scene triggers (fields, variables) and scene actions (fields, outputs).
  `test/structure.test.js` compares them to `test/fixtures/discovery.baseline.json`:
  never update the baseline to make a test pass without a documented migration.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  the API key.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing. Scope `security` lands under "Security", a description
  starting with "remove" / "drop" under "Removed".
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language. A field older cores
  do not know needs a higher `gladys_version` minimum (see `src/constants.js`
  of the integration-store).
- **Widget illustrations.** `docs/assets/widgets.<lang>.png` are generated
  from the widget code by `docs/illustrations/render.sh`: run it again after
  any change to a widget content, and keep them labelled as illustrations.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
