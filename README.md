# Jeff Home Assistant Dashboards

![Repository icon](icon.png)

Version 1.0.0 packages the existing Blue Iris v1.1.0, Purobot v1.0.3, and Front Door v1.0.4 cards into one JavaScript module. It includes the latest recovered Mousie and Moo Moo HTML pages. Timeline card names, API routes, settings, and UI behavior are retained. Purobot retains Toilet Used first and the scale-to-fit viewer; Blue Iris retains Delivery, swipe, and zoom.

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
