export function renderRegionList(container, regions, { activeId, onSelect, onRemove }) {
  container.innerHTML = "";

  if (!regions.length) {
    const hint = document.createElement("p");
    hint.className = "empty-hint";
    hint.textContent = 'Select a clip, then "Add Region" to start grading a part of the frame.';
    container.appendChild(hint);
    return;
  }

  regions.forEach((region) => {
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
