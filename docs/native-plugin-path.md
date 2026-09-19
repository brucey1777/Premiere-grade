# If you need a true custom look baked into the program monitor

The UXP panel in this repo drives Premiere's own Lumetri Color effect, so
everything renders through Premiere's existing real-time pipeline — no
custom rendering code, but also no controls beyond what Lumetri's parameter
tree exposes (no bespoke halation/bloom math, no custom LUT blending modes,
etc.).

If a look genuinely can't be built from Lumetri params + `.cube` LUTs, the
next tier up is a compiled native video-effect plugin using Adobe's
**Premiere Pro / After Effects Video Filter SDK** (C++, ships as a
`.aex`/`.bundle`/`.prm` depending on platform and host). That plugin:

- Registers as a standard effect Premiere lists in Effects > Video Effects.
- Receives the actual frame buffer (8/16/32-bit, GPU or CPU path) each
  render, so it can do arbitrary per-pixel math — this is the only way to
  get truly custom compositing math into the program monitor in real time.
- Is typically built with OpenGL/Metal/DirectX (via Adobe's `PF_` GPU
  suites) for the frame-rate performance the reference clips show.
- Ships as a separate native installer per OS; a UXP panel can still be the
  UI shell (parameter sliders etc.) that writes into that effect's
  parameters, exactly like this panel does for Lumetri — just swap
  `"Lumetri Color"` in `src/ppro/lumetri.js` for your effect's match name.

This is a much larger undertaking (separate C++ codebase, per-OS builds,
Adobe SDK registration, no dynamic reload the way UXP has) and is out of
scope for the current scaffold. Worth doing only once you've confirmed
Lumetri's params + LUTs genuinely can't produce the look you want.
