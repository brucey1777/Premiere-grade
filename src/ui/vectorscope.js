// Lightweight HSL vectorscope-style readout. This is NOT a broadcast-legal
// vectorscope (no true I/Q graticule, no per-pixel frame sampling — UXP has
// no access to program monitor pixels). It's a visual echo of the current
// wheel puck position, styled like the reference UI's "HSL VECTORS" readout,
// so the operator gets the same at-a-glance hue/sat feedback while dragging.

export function createVectorscope(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  function render({ hue = 0, sat = 0 } = {}) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#333";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // simple bar: position along width encodes hue, fill height encodes sat
    const x = (hue / 360) * w;
    const barHeight = sat * (h - 10);
    ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
    ctx.fillRect(x - 2, h - barHeight - 5, 4, barHeight);
  }

  render({});

  return { render };
}

export function formatVectorReadout({ hue = 0, sat = 0 }) {
  const huePct = Math.round(((hue % 180) / 180) * 100);
  const satPct = Math.round(sat * 100);
  const huePair = hue < 180 ? "MAGENTA" : "RED";
  return `HSL VECTORS — HUE: ${huePair} ${huePct}%  SAT ${satPct}%`;
}
