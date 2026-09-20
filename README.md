# Premiere Grade — Region-Based Color Grading Panel

A UXP panel for Adobe Premiere Pro that lets you paint/define a region on the
frame (ellipse, four-point, or free mask) and grade just that region with a
touch-friendly color wheel + HSL qualifier + exposure control, without
leaving the Lumetri panel workflow. Modeled on the UX shown in the reference
clips: a color wheel puck, a vertical exposure slider, and an HSL
vectorscope-style readout, all overlaid on the program monitor context.

## How this actually works in Premiere

Premiere Pro does not give any extensibility surface (UXP or CEP) direct,
low-level access to the program monitor's live pixels or a custom
GPU-compositing hook — that tier of integration (a true "film-look" filter
baked into playback) only exists through a compiled native video-effect
plugin built against Adobe's C++ **Video Filter SDK**, shipped as a system
plugin (`.aex`/`.bundle`) that Premiere loads like a built-in effect.

What UXP *can* do — and what this panel does — is drive Premiere's own
**Lumetri Color** effect and its built-in mask system entirely from script:

- Add a Lumetri Color instance to the selected clip (or reuse the existing one).
- Add an **effect mask** (ellipse / 4-point / free-draw) scoped to that
  Lumetri instance — this is the actual "region" mechanism. Premiere already
  composites masked Lumetri instances in real time in the program monitor,
  so grading updates are live with zero custom rendering code.
- Expose that instance's **Color Wheels & Match**, **HSL Secondary**, and
  **Basic Correction / Exposure** parameters through a simplified radial
  wheel + slider UI, instead of Lumetri's dense stock panel.
- Stack multiple regions as multiple masked Lumetri instances on the same
  clip, each independently editable from a region list.

This gets you real-time, region-scoped grading using Premiere's native
renderer — the same rendering path the reference plugin's "HSL Vectors" /
"Primaries – Midtones" / "Exposure – Midtones" wheels are driving (those are
Lumetri's own controls, wrapped in custom UI).

**What this does *not* do**: bespoke look emulation (film grain, halation,
bloom, custom LUD math) that isn't expressible as Lumetri parameters. That
requires either (a) baking those looks into `.cube` LUTs applied per-region
the same way, or (b) the native Video Filter SDK plugin path — see
`docs/native-plugin-path.md` for what that involves if you want to go there
later.

## Project layout

```
premiere-grade/
  manifest.json          UXP plugin manifest (host: Premiere Pro)
  package.json
  index.html              Panel markup (must live at plugin root — UXP
                            resolves <link>/<script> paths against the
                            manifest's folder, not the HTML file's own folder)
  main.js                 Panel bootstrap, wires UI <-> Premiere API
  ppro/
    session.js             Wraps the premierepro UXP API: selection, effects, masks
    lumetri.js              Find/create Lumetri instance, param lookup helpers
    regions.js               Region model: create/select/delete masked Lumetri instances
  ui/
    colorWheel.js            Canvas-based draggable color wheel widget
    vectorscope.js            Lightweight HSL vectorscope readout
    regionList.js              Region list / add-region UI
  styles/
    panel.css
  docs/
    native-plugin-path.md   Notes on the native Video Filter SDK route
  icons/
    plugin-icon.png (placeholder — replace with real asset)
```

## Setup

1. Install the **UXP Developer Tool (UDT)** from the Creative Cloud desktop app.
2. In UDT, "Add Plugin" → select this folder's `manifest.json`.
3. Load it into a running Premiere Pro (25.6 / 2026 or later — the first
   release with standard UXP panel support; earlier versions only had it in
   Beta) via UDT's "Load" button.
4. Open the panel: **Window > Extensions (Legacy or UXP) > Premiere Grade**.
5. Select a clip on the timeline, click **Add Region**, drag the mask handles
   in the program monitor, then grade with the wheel/slider/qualifier.

`npm install` has nothing to build yet (no bundler wired up) — the panel is
plain HTML/CSS/JS so UDT can load it directly. Add a bundler (esbuild/vite)
once the UI grows past a few files.

## Status

Initial scaffold: manifest, panel shell, color wheel + exposure widgets, and
the Premiere API wrapper stubs for creating a masked Lumetri region and
pushing wheel/slider values into its parameters. Mask-shape editing
(dragging mask points in the program monitor) and the HSL qualifier eyedropper
are stubbed with TODOs — see inline comments in `src/ppro/regions.js` and
`src/ppro/lumetri.js`.
