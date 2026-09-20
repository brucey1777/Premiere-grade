// Premiere Grade panel — bundled as a single plain script (no ES module
// import/export). UXP's panel webview did not execute a <script type="module">
// referencing sibling files via relative import specifiers (no console error,
// the script just silently never ran) — flattening isolated one class of
// path-resolution issue for CSS/script tags, but the module loader itself is
// still a separate, less reliable mechanism inside UXP's webview. Plain
// scripts are how most production UXP plugins avoid this class of problem
// entirely, so everything is consolidated into this one file instead of
// splitting it across ppro/*.js and ui/*.js with import statements.

(function () {
  "use strict";

  // ---------------------------------------------------------------------
  // ppro/session.js — thin wrapper around the Premiere Pro UXP host API.
  // ---------------------------------------------------------------------
  let pproModule = null;

  function ppro() {
    if (!pproModule) {
      pproModule = require("premierepro");
    }
    return pproModule;
  }

  async function getActiveSequence() {
    const { app } = ppro();
    const project = await app.Project.getActiveProject();
    if (!project) return null;
    return project.getActiveSequence();
  }

  async function getSelectedTrackItem() {
    const sequence = await getActiveSequence();
    if (!sequence) return null;
    const selection = await sequence.getSelection();
    const items = await selection.getTrackItems();
    return items && items.length ? items[0] : null;
  }

  async function getComponentChain(trackItem) {
    return trackItem.getComponentChain();
  }

  async function executeAsModal(callback, description) {
    const { app } = ppro();
    return app.Project.getActiveProject().then((project) =>
      project.executeTransaction((compoundAction) => callback(compoundAction), description)
    );
  }

  function isHostAvailable() {
    try {
      ppro();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // ppro/lumetri.js — find/create a Lumetri Color component, read/write params.
  // ---------------------------------------------------------------------
  const LUMETRI_MATCH_NAME = "Lumetri Color";

  async function findLumetriComponent(trackItem) {
    const chain = await getComponentChain(trackItem);
    const count = await chain.getComponentCount();
    for (let i = 0; i < count; i++) {
      const component = await chain.getComponentAtIndex(i);
      const name = await component.getMatchName();
      if (name && name.includes("Lumetri")) {
        return component;
      }
    }
    return null;
  }

  async function addLumetriComponent(trackItem, compoundAction) {
    const chain = await getComponentChain(trackItem);
    return chain.insertComponent(LUMETRI_MATCH_NAME, compoundAction);
  }

  async function ensureLumetri(trackItem, compoundAction) {
    const existing = await findLumetriComponent(trackItem);
    if (existing) return existing;
    return addLumetriComponent(trackItem, compoundAction);
  }

  async function findParam(component, displayName) {
    const paramCount = await component.getParamCount();
    for (let i = 0; i < paramCount; i++) {
      const param = await component.getParam(i);
      const name = await param.getDisplayName();
      if (name === displayName) return param;
    }
    return null;
  }

  async function setParamValue(component, displayName, value, compoundAction) {
    const param = await findParam(component, displayName);
    if (!param) {
      console.warn(`[lumetri] param not found: ${displayName}`);
      return false;
    }
    await param.setValue(value, compoundAction);
    return true;
  }

  function wheelParamNames(range) {
    const prefix = range.charAt(0).toUpperCase() + range.slice(1);
    return {
      hue: `${prefix} Hue`,
      sat: `${prefix} Sat`,
      lum: `${prefix} Lum`,
    };
  }

  async function setColorWheel(component, range, { hue, sat, lum }, compoundAction) {
    const names = wheelParamNames(range);
    if (hue !== undefined) await setParamValue(component, names.hue, hue, compoundAction);
    if (sat !== undefined) await setParamValue(component, names.sat, sat, compoundAction);
    if (lum !== undefined) await setParamValue(component, names.lum, lum, compoundAction);
  }

  async function setExposure(component, value, compoundAction) {
    return setParamValue(component, "Exposure", value, compoundAction);
  }

  async function setHslQualifier(component, { hue, sat, lum, softness }, compoundAction) {
    await setParamValue(component, "Key Hue", hue, compoundAction);
    await setParamValue(component, "Key Sat", sat, compoundAction);
    await setParamValue(component, "Key Lum", lum, compoundAction);
    await setParamValue(component, "Key Softness", softness, compoundAction);
  }

  // ---------------------------------------------------------------------
  // ppro/regions.js — region model: one masked Lumetri instance per region.
  // ---------------------------------------------------------------------
  let regions = [];
  let nextId = 1;

  function listRegions() {
    return regions;
  }

  function getRegion(id) {
    return regions.find((r) => r.id === id);
  }

  async function addRegion({ shape = "ellipse" } = {}) {
    const trackItem = await getSelectedTrackItem();
    if (!trackItem) {
      throw new Error("No clip selected in the sequence.");
    }

    let component = null;
    await executeAsModal(async (compoundAction) => {
      component = await ensureLumetri(trackItem, compoundAction);
      // TODO: create an actual effect mask (ellipse/4-point/freeform) on
      // `component` here once the mask-creation call in the installed
      // premierepro typings is confirmed (Component.createMask / similar).
      // Until then, each "region" maps 1:1 onto its own Lumetri instance
      // without a spatial mask — grading applies to the whole frame, which
      // is enough to validate the parameter-pushing path end-to-end.
    }, "Add Grade Region");

    const region = {
      id: nextId++,
      label: `Region ${nextId - 1}`,
      shape,
      trackItem,
      component,
      wheelRange: "midtones",
      exposure: 0,
      qualifier: { hue: 0, sat: 50, lum: 50, softness: 20 },
      maskInvert: false,
      maskFeather: 20,
    };
    regions.push(region);
    return region;
  }

  function removeRegion(id) {
    regions = regions.filter((r) => r.id !== id);
  }

  async function updateWheel(regionId, range, values) {
    const region = getRegion(regionId);
    if (!region || !region.component) return;
    region.wheelRange = range;
    await executeAsModal(async (compoundAction) => {
      await setColorWheel(region.component, range, values, compoundAction);
    }, "Adjust Color Wheel");
  }

  async function updateExposure(regionId, value) {
    const region = getRegion(regionId);
    if (!region || !region.component) return;
    region.exposure = value;
    await executeAsModal(async (compoundAction) => {
      await setExposure(region.component, value, compoundAction);
    }, "Adjust Exposure");
  }

  async function updateQualifier(regionId, qualifier) {
    const region = getRegion(regionId);
    if (!region || !region.component) return;
    region.qualifier = { ...region.qualifier, ...qualifier };
    await executeAsModal(async (compoundAction) => {
      await setHslQualifier(region.component, region.qualifier, compoundAction);
    }, "Adjust HSL Qualifier");
  }

  // ---------------------------------------------------------------------
  // ui/colorWheel.js — draggable HSB color wheel widget.
  // ---------------------------------------------------------------------
  function createColorWheel(canvas, { onChange } = {}) {
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const center = size / 2;
    const radius = size / 2 - 4;

    let puck = { x: center, y: center };
    let dragging = false;

    function drawWheelGradient() {
      // UXP's Canvas2D implementation doesn't support createImageData/
      // putImageData, so the wheel is built from standard, widely-supported
      // primitives instead: one filled wedge per degree of hue (arc + fill),
      // then a white->transparent radial gradient painted on top to fake
      // the saturation falloff toward the center.
      ctx.clearRect(0, 0, size, size);

      const steps = 180;
      for (let i = 0; i < steps; i++) {
        const hue = (i / steps) * 360;
        const startAngle = (i / steps) * Math.PI * 2;
        const endAngle = ((i + 1.5) / steps) * Math.PI * 2; // slight overlap avoids seams
        const [r, g, b] = hsbToRgb(hue, 1, 1);
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
      }

      const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    function drawPuck() {
      ctx.beginPath();
      ctx.arc(puck.x, puck.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();

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

  // ---------------------------------------------------------------------
  // ui/vectorscope.js — lightweight HSL vectorscope-style readout.
  // ---------------------------------------------------------------------
  function createVectorscope(canvas) {
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

      const x = (hue / 360) * w;
      const barHeight = sat * (h - 10);
      ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
      ctx.fillRect(x - 2, h - barHeight - 5, 4, barHeight);
    }

    render({});

    return { render };
  }

  function formatVectorReadout({ hue = 0, sat = 0 }) {
    const huePct = Math.round(((hue % 180) / 180) * 100);
    const satPct = Math.round(sat * 100);
    const huePair = hue < 180 ? "MAGENTA" : "RED";
    return `HSL VECTORS — HUE: ${huePair} ${huePct}%  SAT ${satPct}%`;
  }

  // ---------------------------------------------------------------------
  // ui/regionList.js — region list / add-region UI.
  // ---------------------------------------------------------------------
  function renderRegionList(container, regionsArg, { activeId, onSelect, onRemove }) {
    container.innerHTML = "";

    if (!regionsArg.length) {
      const hint = document.createElement("p");
      hint.className = "empty-hint";
      hint.textContent = 'Select a clip, then "Add Region" to start grading a part of the frame.';
      container.appendChild(hint);
      return;
    }

    regionsArg.forEach((region) => {
      const item = document.createElement("div");
      item.className = "region-item" + (region.id === activeId ? " active" : "");

      const label = document.createElement("span");
      label.textContent = `${region.label} (${region.shape})`;
      item.appendChild(label);

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        onRemove(region.id);
      });
      item.appendChild(removeBtn);

      item.addEventListener("click", () => onSelect(region.id));
      container.appendChild(item);
    });
  }

  // ---------------------------------------------------------------------
  // main.js — panel bootstrap, wires UI <-> Premiere API.
  // ---------------------------------------------------------------------
  const el = (id) => document.getElementById(id);

  const state = {
    activeRegionId: null,
  };

  const statusLine = el("statusLine");
  const editor = el("editor");
  const regionListEl = el("regionList");

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function activeRegion() {
    return listRegions().find((r) => r.id === state.activeRegionId) || null;
  }

  function refreshRegionList() {
    renderRegionList(regionListEl, listRegions(), {
      activeId: state.activeRegionId,
      onSelect: selectRegion,
      onRemove: (id) => {
        removeRegion(id);
        if (state.activeRegionId === id) {
          const remaining = listRegions();
          state.activeRegionId = remaining.length ? remaining[0].id : null;
        }
        refreshRegionList();
        syncEditorVisibility();
      },
    });
  }

  function selectRegion(id) {
    state.activeRegionId = id;
    refreshRegionList();
    syncEditorVisibility();
  }

  function syncEditorVisibility() {
    const region = activeRegion();
    editor.classList.toggle("hidden", !region);
    if (region) {
      el("exposureSlider").value = region.exposure;
      el("exposureValue").textContent = region.exposure.toFixed(1);
      el("qHue").value = region.qualifier.hue;
      el("qSat").value = region.qualifier.sat;
      el("qLum").value = region.qualifier.lum;
      el("qSoftness").value = region.qualifier.softness;
      el("maskInvert").checked = region.maskInvert;
      el("maskFeather").value = region.maskFeather;
    }
  }

  let currentRange = "midtones";
  const wheel = createColorWheel(el("colorWheel"), {
    onChange: async ({ hue, sat }) => {
      const region = activeRegion();
      if (!region) return;
      vectorscope.render({ hue, sat });
      el("vectorscopeReadout").textContent = formatVectorReadout({ hue, sat });
      try {
        await updateWheel(region.id, currentRange, { hue, sat, lum: 0 });
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
    },
  });

  const vectorscope = createVectorscope(el("vectorscope"));

  el("rangeTabs").addEventListener("click", (evt) => {
    const btn = evt.target.closest("button[data-range]");
    if (!btn) return;
    currentRange = btn.dataset.range;
    el("wheelRangeLabel").textContent = btn.dataset.range[0].toUpperCase() + btn.dataset.range.slice(1);
    [...el("rangeTabs").children].forEach((b) => b.classList.toggle("active", b === btn));
    wheel.reset();
  });

  el("exposureSlider").addEventListener("input", async (evt) => {
    const region = activeRegion();
    if (!region) return;
    const value = Number(evt.target.value);
    el("exposureValue").textContent = value.toFixed(1);
    try {
      await updateExposure(region.id, value);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  });

  ["qHue", "qSat", "qLum", "qSoftness"].forEach((id) => {
    el(id).addEventListener("input", async () => {
      const region = activeRegion();
      if (!region) return;
      try {
        await updateQualifier(region.id, {
          hue: Number(el("qHue").value),
          sat: Number(el("qSat").value),
          lum: Number(el("qLum").value),
          softness: Number(el("qSoftness").value),
        });
      } catch (err) {
        setStatus(`Error: ${err.message}`);
      }
    });
  });

  el("eyedropperBtn").addEventListener("click", () => {
    setStatus("Eyedropper not yet implemented — set qualifier sliders manually.");
  });

  el("maskShapeButtons").addEventListener("click", (evt) => {
    const btn = evt.target.closest("button[data-shape]");
    if (!btn) return;
    const region = activeRegion();
    if (region) region.shape = btn.dataset.shape;
    [...el("maskShapeButtons").children].forEach((b) => b.classList.toggle("active", b === btn));
    refreshRegionList();
  });

  el("maskInvert").addEventListener("change", (evt) => {
    const region = activeRegion();
    if (region) region.maskInvert = evt.target.checked;
  });

  el("maskFeather").addEventListener("input", (evt) => {
    const region = activeRegion();
    if (region) region.maskFeather = Number(evt.target.value);
  });

  el("addRegionBtn").addEventListener("click", async () => {
    try {
      setStatus("Adding region…");
      const region = await addRegion({ shape: "ellipse" });
      state.activeRegionId = region.id;
      refreshRegionList();
      syncEditorVisibility();
      setStatus(`${region.label} added on selected clip.`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  });

  function boot() {
    if (!isHostAvailable()) {
      setStatus("Premiere Pro host API not available — running outside UXP.");
    } else {
      setStatus("Ready. Select a clip and add a region.");
    }
    refreshRegionList();
    syncEditorVisibility();
  }

  boot();
})();
