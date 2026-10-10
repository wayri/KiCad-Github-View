/** Match saved geometry identities without treating net zero as a connected net. */
export function selectionMatcher(selection = {}, board = {}) {
  const strings = values => new Set(Array.isArray(values) ? values.filter(v => typeof v === 'string' && v) : []);
  const references = strings(selection.references), uuids = strings(selection.uuids);
  const nets = new Set();
  for (const code of Array.isArray(selection.netCodes) ? selection.netCodes : []) {
    if (code === 0 || code === '0' || code == null || code === '') continue;
    const name = board.nets?.[String(code)];
    if (name) nets.add(name);
    else if (typeof code === 'string' && !/^\d+$/.test(code)) nets.add(code);
  }
  // A selected net includes the bodies of parts whose saved pads belong to it.
  const connectedParts = new Set();
  for (const pad of board.pads || []) if (nets.has(pad.net) && pad.ref) connectedParts.add(pad.ref);
  return record => Boolean(record && (
    references.has(record.ref) || nets.has(record.net) || uuids.has(record.uuid) ||
    uuids.has(record.id) || (typeof record.id === 'string' && uuids.has(record.id.split(':')[0])) ||
    (connectedParts.has(record.ref) && (record.type === 'Component' || typeof record.library === 'string'))
  ));
}

/** Pinching or dragging must never become a tap when the final finger lifts. */
export function tapGesture(limit = 6) {
  const pointers = new Map(); let blocked = false;
  return {
    down(event) { if (!pointers.size) blocked = false; pointers.set(event.pointerId, [event.clientX, event.clientY]); if (pointers.size > 1) blocked = true; },
    move(event) { const start = pointers.get(event.pointerId); if (start && Math.hypot(event.clientX-start[0], event.clientY-start[1]) >= limit) blocked = true; },
    up(event) { const start = pointers.get(event.pointerId); const tap = Boolean(start && !blocked && pointers.size === 1 && Math.hypot(event.clientX-start[0], event.clientY-start[1]) < limit); pointers.delete(event.pointerId); return tap; },
    cancel(event) { pointers.delete(event.pointerId); blocked = true; }
  };
}
