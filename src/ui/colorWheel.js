// Draggable HSB color wheel widget, canvas-based. Puck position encodes
// hue (angle) and saturation (radius from center); a separate axis (e.g. a
// modifier-drag or scroll) could be wired up later for luminance, but for
// v0 we keep it to hue/sat with luminance left to the exposure slider.

export function createColorWheel(canvas, { onChange } = {}) {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const center = size / 2;
  const radius = size / 2 - 4;

  let puck = { x: center, y: center }; // neutral by default
  let dragging = false;

  function drawWheelGradient() {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist > radius) {
          image.data[idx + 3] = 0;
          continue;
        }
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
        const sat = Math.min(dist / radius, 1);
        const [r, g, b] = hsbToRgb(angle, sat, 1);
        image.data[idx] = r;
        image.data[idx + 1] = g;
        image.data[idx + 2] = b;
        image.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function drawPuck() {
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // crosshair through center for reference
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, size);
    ctx.moveTo(0, center);
    ctx.lineTo(size, center);
    ctx.stroke();
  }

  function render() {
    drawWheelGradient();
    drawPuck();
  }

  function setPuckFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    const dx = x - center;
    const dy = y - center;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
    const angle = Math.atan2(dy, dx);
    puck = {
      x: center + Math.cos(angle) * dist,
      y: center + Math.sin(angle) * dist,
    };
    render();
    if (onChange) {
      const hue = ((angle * 180) / Math.PI + 360) % 360;
      const sat = dist / radius;
      onChange({ hue, sat });
    }
  }

  canvas.addEventListener("pointerdown", (evt) => {
    dragging = true;
    canvas.setPointerCapture(evt.pointerId);
    setPuckFromEvent(evt);
  });
  canvas.addEventListener("pointermove", (evt) => {
    if (dragging) setPuckFromEvent(evt);
  });
  canvas.addEventListener("pointerup", (evt) => {
    dragging = false;
    canvas.releasePointerCapture(evt.pointerId);
  });

  // double-click resets to neutral (matches common grading-tool convention)
  canvas.addEventListener("dblclick", () => {
    puck = { x: center, y: center };
    render();
    if (onChange) onChange({ hue: 0, sat: 0 });
  });

  render();

  return {
    reset() {
      puck = { x: center, y: center };
      render();
    },
  };
}

function hsbToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
