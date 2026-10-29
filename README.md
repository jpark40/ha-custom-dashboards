# Home Assistant Dashboards

![Repository icon](icon.png)

Version **1.0.13** supports the Front Door backend's detection-triggered image capture. Backend **1.0.14** saves `image.front_door_last_event` whenever `event.front_door_detection` reports `person`, `stranger`, `package_delivered`, or `package_taken`. An unchanged image timestamp no longer blocks a detection from appearing. If the image arrives later, the same event is updated and the card fetches its revised image instead of keeping an old cached blob.

Update through HACS, restart HA after updating the backend integration, then fully
reload each browser/Fully Kiosk page so it loads the new JavaScript. **Latest**
enables following the newest saved date for the selected tab. Switching tabs
while following Latest opens that tab's latest date. Choosing a date or using the date arrows pins
history until Latest is selected again. While viewing the newest frame, incoming
snapshots replace it automatically; deliberately selected older frames stay put.

For the capture repair, install front-door backend **1.0.14**, turn off the old
**Front Door - Save snapshots to timeline** automation, restart HA, and fully
reload the dashboard. Automatic capture is enabled by default and reads the same
image API as the image entity on your dashboard. A relevant detection saves the
available image immediately, without opening live video or requiring image bytes
to change. Repeated callbacks for the same event do not add copies. A different
detection gets its own entry; a later image update revises that event's existing
snapshot. Existing snapshots remain browsable.

If no snapshots appear, run
**Developer Tools → Actions → Front Door Snapshot Timeline: Timeline diagnostics**
(`front_door_timeline.diagnostics`, with `data: {}`). Its response distinguishes an
empty storage folder, captures with hidden labels, and unavailable or renamed
Eufy source entities without modifying saved images.

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
type: custom:jp-vehicle-status-card
vehicle: mousie  # or moomoo
height: 650
```

For full-screen Fully Kiosk launch shortcuts, use:

- `/local/community/ha-custom-dashboards/mousie-status.html`
- `/local/community/ha-custom-dashboards/moomoo-status.html`

Open each page directly and complete HA sign-in once at the new URL before embedding it. The new pages use separate HA session storage to avoid mixing OAuth client IDs with the old `/local` pages. The existing routing API key storage is retained. No credentials are embedded in the repository. Vehicle entities come from the existing pages. External MapLibre, map tiles, and routing services remain their existing dependencies.

### Vehicle card name change in 1.0.7

The embedded Mousie/Moo Moo iframe card is now registered as `custom:jp-vehicle-status-card`. Earlier releases used `custom:vehicle-status-card`, which collided with ngocjohn's separate Vehicle Status Card HACS frontend and could produce `CustomElementRegistry` duplicate-registration errors. Existing ngocjohn Vehicle Status Card YAML should remain `custom:vehicle-status-card`. Only cards from this repository that include `vehicle: mousie` or `vehicle: moomoo` should be changed to `custom:jp-vehicle-status-card`.

## Update

Publish a new version here, install the available HACS update, and reload the dashboard/vehicle page. The `jp-vehicle-status-card` uses the HACS version tag on its iframe URL so updated HTML receives a new cache key. For direct Fully Kiosk shortcuts, force a page reload or clear its web cache if the old page remains. Integration updates are separate and require an HA restart. This is an update-through-HACS workflow, not unattended installation.

## Maintainer

Edit `src/`, update `VERSION`, run `node scripts/build.js`, and commit the generated `dist/ha-custom-dashboards.js` together with any HTML changes. The distribution is one JS module, so child imports cannot stay on an old browser cache version. Existing card tests and bundle checks run in GitHub Actions.

To publish, run **Actions > Publish release > Run workflow** on `main`. It validates the current contents and creates a release named from `VERSION`. Increase the version before the next release. HACS reads `dist/` from the release's source tree; a release ZIP asset is not used.

This is a custom HACS repository; listing in the default HACS catalog is not required.

## Icons

The repository contains a custom icon in 256px and 512px PNG, with editable SVG source. For integrations, `brand/icon.png` and `brand/icon@2x.png` are bundled inside the integration; Home Assistant 2026.3+ can display these local brand images.

HACS currently uses its external brands source for integration list icons; the open upstream issue https://github.com/hacs/integration/issues/5223 prevents local-only brand assets from reliably appearing there. Dashboard repositories use HACS's generic Dashboard category icon rather than a per-repository custom icon. The artwork is visible in each repository README and is included for supported HA surfaces. No unsupported icon field is added to hacs.json.

## Front door: Eufy SDK migration (1.0.1)

The Front Door card shows **Person** and **Package** tabs, with Person selected by default. The current backend routes `person` and `stranger` to Person, and `package_delivered` and `package_taken` to Package. The main snapshot and thumbnails fit the complete image without cropping, using the same bounded viewer size as Blue Iris. You can set `initial_category: person` or `package`.

Update this dashboard bundle through HACS, then fully reload the browser/Fully Kiosk page. With backend 1.0.14, keep the old capture automation disabled. The [optional manual automation](https://github.com/jpark40/ha-front-door-timeline/blob/main/examples/automation.yaml) is only for `auto_capture: false`; it triggers on `event.front_door_detection` and captures `image.front_door_last_event`.

The tabs filter saved snapshot labels: Person includes `person` and `stranger`; Package includes package labels, preserving older stranded/package history as well. The current backend does not create new entries for `package_stranded`. Old `image_update` or `motion` snapshots do not appear in either tab because their original category was not saved. The timeline uses the image/detection entities and does not need a camera entity.

## Front Door touch viewer (1.0.2)

Tap the main snapshot to open the full-size viewer. Swipe left/right for the next/previous snapshot within the selected date and tab. Pinch to zoom up to 8×; drag to pan while zoomed. Mouse wheel zoom, arrow keys, previous/next buttons, a reset-zoom button (or `0`), and Escape to close are supported. Zoom resets on snapshot changes. Automatic refresh pauses while the viewer is open. Update the dashboard bundle in HACS and refresh the browser or clear Fully Kiosk's web cache; card YAML and the backend do not need changes.

## Front Door image fit (1.0.3)

The main timeline snapshot and thumbnails are sized against the viewer bounds, so tall images fit completely without the grid stretching their image box. The full snapshot remains visible with letterboxing as needed. Update the dashboard bundle through HACS and refresh the browser or clear the Fully Kiosk web cache.
