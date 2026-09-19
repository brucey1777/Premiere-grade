// Thin wrapper around the Premiere Pro UXP host API ("premierepro").
// Centralizing require() + common lookups here means the UI code never
// touches the host API directly, so it's easier to unit-test/stub later.

let pproModule = null;

function ppro() {
  if (!pproModule) {
    // Only resolvable inside a UXP host with Premiere Pro loaded.
    pproModule = require("premierepro");
  }
  return pproModule;
}

export async function getActiveSequence() {
  const { app } = ppro();
  const project = await app.Project.getActiveProject();
  if (!project) return null;
  return project.getActiveSequence();
}

export async function getSelectedTrackItem() {
  const sequence = await getActiveSequence();
  if (!sequence) return null;
  const selection = await sequence.getSelection();
  const items = await selection.getTrackItems();
  return items && items.length ? items[0] : null;
}

export async function getComponentChain(trackItem) {
  return trackItem.getComponentChain();
}

export async function executeAsModal(callback, description) {
  const { app } = ppro();
  return app.Project.getActiveProject().then((project) =>
    project.executeTransaction((compoundAction) => callback(compoundAction), description)
  );
}

export function isHostAvailable() {
  try {
    ppro();
    return true;
  } catch (e) {
    return false;
  }
}
