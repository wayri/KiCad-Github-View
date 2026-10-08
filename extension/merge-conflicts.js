/* Source-preserving Git conflict candidates. Never writes the supplied design. */
((root) => {
  'use strict';
  const design = typeof module === 'object' && module.exports ? require('./design-diff.js') : root.KiCadDesignDiff;
  const MAX_BYTES = 64 * 1024 * 1024, MAX_CONFLICTS = 1024;
  function parse(source) {
    if (typeof source !== 'string') throw new TypeError('KiCad source must be a string.');
    if (source.length > MAX_BYTES || new TextEncoder().encode(source).length > MAX_BYTES) throw new Error('Conflict source exceeds 64 MiB.');
    const conflicts = []; let active = null, quoted = false, escaped = false, offset = 0, line = 1;
    const fail = (message) => { throw new Error(message + ' at line ' + line + '.'); };
    while (offset < source.length) {
      const newline = source.indexOf('\n', offset), end = newline < 0 ? source.length : newline + 1;
      const text = source.slice(offset, end), body = text.replace(/\r?\n$/, '');
      const marker = !quoted && /^([<|=>])\1{6,}(?:[ \t]+(.*))?$/.exec(body);
      if (marker) {
        const kind = marker[1], width = /^[<|=>]+/.exec(body)[0].length;
        if (kind === '<') {
          if (active) fail('Nested Git conflict');
          if (conflicts.length >= MAX_CONFLICTS) fail('Too many Git conflicts');
          active = { index: conflicts.length, start: offset, line, width, currentLabel: marker[2] || '', currentStart: end, phase: 'current' };
        } else {
          if (!active) fail('Unexpected Git conflict marker');
          if (width !== active.width) fail('Mismatched Git conflict marker width');
          if (kind === '|') {
            if (active.phase !== 'current') fail('Unexpected ancestor marker');
            active.current = source.slice(active.currentStart, offset); active.baseStart = end;
            active.baseLabel = marker[2] || ''; active.phase = 'base';
          } else if (kind === '=') {
            if (marker[2] || active.phase === 'incoming') fail('Unexpected Git conflict separator');
            if (active.phase === 'base') active.base = source.slice(active.baseStart, offset);
            else active.current = source.slice(active.currentStart, offset);
            active.incomingStart = end; active.phase = 'incoming';
          } else {
            if (active.phase !== 'incoming') fail('Git conflict has no separator');
            active.incoming = source.slice(active.incomingStart, offset);
            active.incomingLabel = marker[2] || ''; active.end = end; active.endLine = line;
            delete active.phase; delete active.currentStart; delete active.baseStart; delete active.incomingStart;
            conflicts.push(active); active = null;
          }
        }
      } else {
        // Markers inside KiCad quoted fields or semicolon comments are ordinary text.
        for (const ch of text) {
          if (quoted) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') quoted = false;
          } else if (ch === ';') break;
          else if (ch === '"') quoted = true;
        }
      }
      offset = end; line++;
    }
    if (active) fail('Unterminated Git conflict');
    const result = { conflicts, current: assemble(source, conflicts, 'current'), incoming: assemble(source, conflicts, 'incoming') };
    if (conflicts.length && conflicts.every(c => Object.hasOwn(c, 'base'))) result.base = assemble(source, conflicts, 'base');
    return result;
  }
  function assemble(source, conflicts, choices) {
    let offset = 0; const chunks = [];
    conflicts.forEach((conflict, index) => {
      chunks.push(source.slice(offset, conflict.start), conflict[Array.isArray(choices) ? choices[index] : choices]);
      offset = conflict.end;
    });
    chunks.push(source.slice(offset)); return chunks.join('');
  }
  function validate(source, expectedRoot) {
    if (!design?.parse) throw new Error('KiCad parser is unavailable.');
    const form = design.parse(source), kind = form[0];
    if (kind !== 'kicad_sch' && kind !== 'kicad_pcb') throw new Error('Expected a KiCad schematic or PCB root.');
    if (expectedRoot && kind !== expectedRoot) throw new Error('Resolved KiCad root does not match ' + expectedRoot + '.');
    return kind;
  }
  function rootHint(source, options) {
    const expected = options?.expectedRoot || /^\s*\((kicad_sch|kicad_pcb)(?=\s|\))/.exec(source)?.[1];
    if (expected && !['kicad_sch', 'kicad_pcb'].includes(expected)) throw new Error('Invalid expected KiCad root.');
    return expected;
  }
  function analyze(source, options) {
    const parsed = parse(source), expected = rootHint(source, options), candidates = {};
    for (const side of ['current', 'incoming']) {
      try { validate(parsed[side], expected); candidates[side] = { source: parsed[side], valid: true, error: null }; }
      catch (error) { candidates[side] = { source: parsed[side], valid: false, error: error.message }; }
    }
    return { ...parsed, count: parsed.conflicts.length, candidates,
      validationError: Object.entries(candidates).filter(([, c]) => !c.valid).map(([side, c]) => side + ': ' + c.error).join('; ') || null };
  }
  function resolve(source, choices, options) {
    const parsed = parse(source);
    if (Array.isArray(choices)) {
      if (choices.length !== parsed.conflicts.length || choices.some(c => c !== 'current' && c !== 'incoming')) throw new Error('Choose current or incoming for every conflict.');
    } else if (choices !== 'current' && choices !== 'incoming') throw new Error('Choose current or incoming for every conflict.');
    const candidate = assemble(source, parsed.conflicts, choices);
    validate(candidate, rootHint(source, options)); return candidate;
  }
  const api = { parse, analyze, resolve, validate, MAX_BYTES, MAX_CONFLICTS };
  root.KiCadMergeConflicts = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : this);
