# Home Assistant Dashboards

![Repository icon](icon.png)

Version 1.0.6 packages the existing Blue Iris v1.1.0, Purobot v1.0.3, and Front Door v1.0.5 cards into one JavaScript module. It includes the latest recovered Mousie and Moo Moo HTML pages. Timeline card names, API routes, settings, and UI behavior are retained. Purobot retains Toilet Used first and the scale-to-fit viewer; Blue Iris retains Delivery, swipe, and zoom. Front Door shows all-history Person and Package counts on its tabs.

## Install or migrate once

1. Add `https://github.com/jpark40/ha-custom-dashboards` in **HACS > three dots > Custom repositories**, type **Dashboard**. Install it.
2. Under **Settings > Dashboards > Resources**, remove the old resource entries for `blue-iris-timeline-card.js`, `purobot-timeline-card.js`, and `front-door-timeline-card.js`. Keep unrelated resources. Old file copies do not need to be deleted.
3. Ensure exactly one new JavaScript module resource exists:
   `/hacsfiles/ha-custom-dashboards/ha-custom-dashboards.js`
4. Fully reload the dashboard on each browser/tablet. Old resources must not load alongside the bundle: the first loaded custom element wins for that page session.
5. Existing timeline card YAML can remain. For a new dashboard, use `examples/dashboard.yaml` once. HACS does not replace UI-stored dashboard YAML.

The three timeline cards require their existing backend integrations. Install the corresponding HACS integration repositories to manage backend updates too. Keep existing configuration blocks and `/media` event folders; do not uninstall the working integration first or delete history. Back up HA before the first migration.

## Vehicles

Use a Manual card:

```yaml
type: custom:vehicle-status-card
vehicle: mousie  # or moomoo
height: 650
```

For full-screen Fully Kiosk launch shortcuts, use:

- `/local/community/ha-custom-dashboards/mousie-status.html`
- `/local/community/ha-custom-dashboards/moomoo-status.html`

Open each page directly and complete HA sign-in once at the new URL before embedding it. The new pages use separate HA session storage to avoid mixing OAuth client IDs with the old `/local` pages. The existing routing API key storage is retained. No credentials are embedded in the repository. Vehicle entities come from the existing pages. External MapLibre, map tiles, and routing services remain their existing dependencies.

## Update

Publish a new version here, install the available HACS update, and reload the dashboard/vehicle page. The vehicle card uses the HACS version tag on its iframe URL so updated HTML receives a new cache key. For direct Fully Kiosk shortcuts, force a page reload or clear its web cache if the old page remains. Integration updates are separate and require an HA restart. This is an update-through-HACS workflow, not unattended installation.

## Maintainer

Edit `src/`, update `VERSION`, run `node scripts/build.js`, and commit the generated `dist/ha-custom-dashboards.js` together with any HTML changes. The distribution is one JS module, so child imports cannot stay on an old browser cache version. Existing card tests and bundle checks run in GitHub Actions.

To publish, run **Actions > Publish release > Run workflow** on `main`. It validates the current contents and creates a release named from `VERSION`. Increase the version before the next release. HACS reads `dist/` from the release's source tree; a release ZIP asset is not used.

This is a custom HACS repository; listing in the default HACS catalog is not required.

## Icons

The repository contains a custom icon in 256px and 512px PNG, with editable SVG source. For integrations, `brand/icon.png` and `brand/icon@2x.png` are bundled inside the integration; Home Assistant 2026.3+ can display these local brand images.

HACS currently uses its external brands source for integration list icons; the open upstream issue https://github.com/hacs/integration/issues/5223 prevents local-only brand assets from reliably appearing there. Dashboard repositories use HACS's generic Dashboard category icon rather than a per-repository custom icon. The artwork is visible in each repository README and is included for supported HA surfaces. No unsupported icon field is added to hacs.json.

## Front door: Eufy SDK migration (1.0.1)

The Front Door card now shows **Person** and **Package** tabs, with Person selected by default. Detection labels from `event.front_door_detection` route person and stranger snapshots to Person and package delivery, taken, or stranded snapshots to Package. The main snapshot and thumbnails fit the complete image without cropping, using the same bounded viewer size as Blue Iris. You can set `initial_category: person` or `package`.

Update this dashboard bundle through HACS, then refresh the browser/clear the Fully Kiosk web cache. Replace your existing timeline capture automation with [the new SDK example](https://github.com/jpark40/ha-front-door-timeline/blob/main/examples/automation.yaml), keeping its existing automation ID. Do not add a second capture automation. The example uses `image.front_door_last_event` and `event.front_door_detection`; it captures on the image timestamp changing, rather than capturing the previous thumbnail as soon as detection fires.

The tabs filter saved snapshot labels: Person includes `person` and `stranger`; Package includes delivered, taken, and stranded events. Old `image_update` or `motion` snapshots do not appear in either tab because their original category was not saved, and cannot be reliably classified retroactively. The card displays saved history and does not need a camera entity. For separate live-view cards, your migrated camera is `camera.front_door_2`.

## Front Door touch viewer (1.0.2)

Tap the main snapshot to open the full-size viewer. Swipe left/right for the next/previous snapshot within the selected date and tab. Pinch to zoom up to 8×; drag to pan while zoomed. Mouse wheel zoom, arrow keys, previous/next buttons, a reset-zoom button (or `0`), and Escape to close are supported. Zoom resets on snapshot changes. Automatic refresh pauses while the viewer is open. Update the dashboard bundle in HACS and refresh the browser or clear Fully Kiosk's web cache; card YAML and the backend do not need changes.

## Front Door image fit (1.0.3)

The main timeline snapshot and thumbnails are sized against the viewer bounds, so tall images fit completely without the grid stretching their image box. The full snapshot remains visible with letterboxing as needed. Update the dashboard bundle through HACS and refresh the browser or clear the Fully Kiosk web cache.
