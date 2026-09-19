// Helpers for finding/creating a Lumetri Color component on a track item
// and reading/writing its named parameters.
//
// NOTE ON PARAM NAMES: Lumetri exposes its parameters with the same display
// names you see in the stock Effect Controls panel ("Exposure", "Contrast",
// "Highlights", "Shadows", "Whites", "Blacks", "Temperature", "Tint",
// "Saturation" for Basic Correction; "Hue", "Saturation", "Luminance" for
// each Color Wheel range). Adobe does not publish a stable enum for these in
// the UXP API docs at the time of writing, so this file centralizes the
// string lookups — if Adobe renames something in a future Premiere version,
// this is the only place to fix it.

import { getComponentChain } from "./session.js";

const LUMETRI_MATCH_NAME = "Lumetri Color";

export async function findLumetriComponent(trackItem) {
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

export async function addLumetriComponent(trackItem, compoundAction) {
  const chain = await getComponentChain(trackItem);
  // insertComponent's exact signature depends on the installed UXP/Premiere
  // API version; wrap so callers don't need to know the details.
  return chain.insertComponent(LUMETRI_MATCH_NAME, compoundAction);
}

export async function ensureLumetri(trackItem, compoundAction) {
  const existing = await findLumetriComponent(trackItem);
  if (existing) return existing;
  return addLumetriComponent(trackItem, compoundAction);
}

export async function findParam(component, displayName) {
  const paramCount = await component.getParamCount();
  for (let i = 0; i < paramCount; i++) {
    const param = await component.getParam(i);
    const name = await param.getDisplayName();
    if (name === displayName) return param;
  }
  return null;
}

export async function setParamValue(component, displayName, value, compoundAction) {
  const param = await findParam(component, displayName);
  if (!param) {
    console.warn(`[lumetri] param not found: ${displayName}`);
    return false;
  }
  await param.setValue(value, compoundAction);
  return true;
}

// Color Wheels & Match wheels are addressed as "<Range> Hue" / "<Range> Sat"
// / "<Range> Lum" (e.g. "Midtones Hue", "Midtones Sat", "Midtones Lum") on
// most Premiere versions' Lumetri param tree.
export function wheelParamNames(range) {
  const prefix = range.charAt(0).toUpperCase() + range.slice(1);
  return {
    hue: `${prefix} Hue`,
    sat: `${prefix} Sat`,
    lum: `${prefix} Lum`,
  };
}

export async function setColorWheel(component, range, { hue, sat, lum }, compoundAction) {
  const names = wheelParamNames(range);
  if (hue !== undefined) await setParamValue(component, names.hue, hue, compoundAction);
  if (sat !== undefined) await setParamValue(component, names.sat, sat, compoundAction);
  if (lum !== undefined) await setParamValue(component, names.lum, lum, compoundAction);
}

export async function setExposure(component, value, compoundAction) {
  return setParamValue(component, "Exposure", value, compoundAction);
}

export async function setHslQualifier(component, { hue, sat, lum, softness }, compoundAction) {
  // HSL Secondary's key/qualifier params live under their own sub-group in
  // the stock panel; naming here follows the same "<Field> <Axis>"
  // convention used for the wheels. Verify against your Premiere version's
  // actual param tree (log component.getParam(i).getDisplayName() for all i)
  // before relying on this in production — Lumetri's HSL Secondary param
  // names are more version-sensitive than the Basic Correction ones.
  await setParamValue(component, "Key Hue", hue, compoundAction);
  await setParamValue(component, "Key Sat", sat, compoundAction);
  await setParamValue(component, "Key Lum", lum, compoundAction);
  await setParamValue(component, "Key Softness", softness, compoundAction);
}
