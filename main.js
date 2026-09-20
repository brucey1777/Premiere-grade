import { createColorWheel } from "./ui/colorWheel.js";
import { createVectorscope, formatVectorReadout } from "./ui/vectorscope.js";
import { renderRegionList } from "./ui/regionList.js";
import {
  addRegion,
  listRegions,
  removeRegion,
  updateWheel,
  updateExposure,
  updateQualifier,
} from "./ppro/regions.js";
import { isHostAvailable } from "./ppro/session.js";

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

// --- Color wheel ---
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

// --- Exposure slider ---
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

// --- HSL qualifier ---
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
  // TODO: wire to UXP's screen/program-monitor color-pick surface once
  // confirmed available for this host app version.
  setStatus("Eyedropper not yet implemented — set qualifier sliders manually.");
});

// --- Mask shape controls (UI only until session.js mask bridge lands) ---
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

// --- Add region ---
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

// --- Boot ---
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
