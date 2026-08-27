export function getSelectionRule(
  minSelections: number,
  maxSelections: number,
) {
  return minSelections === maxSelections
    ? `Escolle ${maxSelections} persoas`
    : `Escolle entre ${minSelections} e ${maxSelections} persoas`;
}

export function getSelectionStatus(
  selectedCount: number,
  maxSelections: number,
) {
  const selectionLabel = selectedCount === 1 ? 'seleccionada' : 'seleccionadas';
  const maximumLabel =
    selectedCount === maxSelections ? ' · máximo acadado' : '';

  return `${selectedCount} de ${maxSelections} ${selectionLabel}${maximumLabel}`;
}

export function isSelectionCountValid(
  selectedCount: number,
  minSelections: number,
  maxSelections: number,
) {
  return selectedCount >= minSelections && selectedCount <= maxSelections;
}
