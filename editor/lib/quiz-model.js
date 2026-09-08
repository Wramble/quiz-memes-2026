function createEmptySlots(questionCount) {
  if (!Number.isInteger(questionCount) || questionCount < 0)
    throw new RangeError("questionCount must be a non-negative integer");
  return Array.from({ length: questionCount }, (_, index) => [
    { kind: "question", number: index + 1, html: "", overrides: {} },
    { kind: "answer", number: index + 1, html: "", overrides: {} },
  ]).flat();
}

function effectiveAttributes(defaults, overrides) {
  return { ...defaults, ...overrides };
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function serializeAttributes(attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value != null && value !== "")
    .map(([name, value]) =>
      value === true ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`,
    )
    .join("");
}

function setSlotTemplate(slot, template, { replace = false } = {}) {
  if (slot.kind !== template.kind)
    throw new Error(
      `Template kind ${template.kind} cannot fill ${slot.kind} slot`,
    );
  if (slot.html.trim() && !replace)
    throw new Error("Replacing populated slot requires explicit permission");
  return { ...slot, html: template.html };
}

module.exports = {
  createEmptySlots,
  effectiveAttributes,
  serializeAttributes,
  setSlotTemplate,
};
