/* Două corecții peste JSON-ul scos de @visbot/webvsc, ca webvs să poată rula presetul:
 *
 * 1. bufferId / buffer — convertorul emite valori ca 18, 21, 36, 228; AVS are doar
 *    buffere 0..7. Remapăm valorile DISTINCTE dintr-un preset pe 0..n-1, ca două
 *    componente care arătau spre același buffer să arate în continuare spre același.
 * 2. câmpurile de cod trebuie să fie string-uri; câteva ies ca numere și crapă
 *    compilatorul de expresii cu "f.trim is not a function".
 */
const CODE_KEYS = ['init','perFrame','onBeat','perPoint','perPixel','code'];

function sanitize(preset, maxBuffers = 8) {
  const seen = new Set();
  (function scan(cs){ (cs||[]).forEach(c=>{
      ['bufferId','buffer'].forEach(k=>{ if (typeof c[k] === 'number') seen.add(c[k]); });
      scan(c.components);
  });})(preset.components);

  const order = [...seen].sort((a,b)=>a-b);
  const map = new Map(order.map((v,i)=>[v, i % maxBuffers]));

  let remapped = 0, coerced = 0;
  (function fix(cs){ (cs||[]).forEach(c=>{
      ['bufferId','buffer'].forEach(k=>{
        if (typeof c[k] === 'number' && map.has(c[k]) && map.get(c[k]) !== c[k]) {
          c[k] = map.get(c[k]); remapped++;
        }
      });
      if (c.code && typeof c.code === 'object') {
        // orice valoare din blocul `code` trebuie să fie string — compilatorul
        // de expresii face .trim() pe ea
        Object.keys(c.code).forEach(k=>{
          const v = c.code[k];
          if (typeof v === 'string') return;
          c.code[k] = v == null ? '' : (Array.isArray(v) ? v.join('\n') : String(v));
          coerced++;
        });
      }
      CODE_KEYS.forEach(k=>{
        if (k in c && typeof c[k] !== 'string' && typeof c[k] !== 'object') {
          c[k] = c[k] == null ? '' : String(c[k]); coerced++;
        }
      });
      fix(c.components);
  });})(preset.components);

  return { preset, remapped, coerced };
}
module.exports = { sanitize };
