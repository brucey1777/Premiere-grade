// A "region" in this panel = one masked Lumetri Color instance on the
// currently selected track item. This module owns the in-memory region
// list and the (stubbed) mask-creation bridge into Premiere's effect mask
// API.

import { executeAsModal, getSelectedTrackItem } from "./session.js";
import { ensureLumetri, setColorWheel, setExposure, setHslQualifier } from "./lumetri.js";

let regions = [];
let nextId = 1;

export function listRegions() {
  return regions;
}

export function getRegion(id) {
  return regions.find((r) => r.id === id);
}

export async function addRegion({ shape = "ellipse" } = {}) {
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

export function removeRegion(id) {
  regions = regions.filter((r) => r.id !== id);
}

export async function updateWheel(regionId, range, values) {
  const region = getRegion(regionId);
  if (!region || !region.component) return;
  region.wheelRange = range;
  await executeAsModal(async (compoundAction) => {
    await setColorWheel(region.component, range, values, compoundAction);
  }, "Adjust Color Wheel");
}

export async function updateExposure(regionId, value) {
  const region = getRegion(regionId);
  if (!region || !region.component) return;
  region.exposure = value;
  await executeAsModal(async (compoundAction) => {
    await setExposure(region.component, value, compoundAction);
  }, "Adjust Exposure");
}

export async function updateQualifier(regionId, qualifier) {
  const region = getRegion(regionId);
  if (!region || !region.component) return;
  region.qualifier = { ...region.qualifier, ...qualifier };
  await executeAsModal(async (compoundAction) => {
    await setHslQualifier(region.component, region.qualifier, compoundAction);
  }, "Adjust HSL Qualifier");
}

export function resetRegions() {
  regions = [];
  nextId = 1;
}
