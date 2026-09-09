// Separate from value-free observation/classification. Injected in the isolated world.
// Returns ephemeral local data ONLY to the trusted worker, never to the popup.
export function collectLocalValues(ids, sensitiveIds) {
  const state = globalThis.__edgeSightFields;
  try {
    const values = ids.map((id) => {
      const el = state?.elements.get(id);
      if (!el?.isConnected) throw new Error('Page changed.');
      return { id, value: String(el.value ?? '') };
    });
    // Known sensitive values repeated in labels/body text would remain outside masks.
    // Block locally; do not return that text to the worker or treat it as safe context.
    const secrets = values.filter((v) => sensitiveIds.includes(v.id) && v.value.length > 0);
    const text = (document.body?.innerText || '') + '\n' + document.title;
    if (secrets.some((v) => text.includes(v.value))) {
      values.forEach((v) => { v.value = ''; });
      throw new Error('Sensitive data outside field regions.');
    }
    return values;
  } finally {
    state?.elements.clear();
  }
}
