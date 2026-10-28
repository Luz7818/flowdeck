let uiSeq = 0;

/** ids for modules created inside the UI (insert row / convert / canvas palette) */
export function newId(type: string): string {
  uiSeq += 1;
  return `${type}_ui_${Date.now().toString(36)}_${uiSeq}`;
}
