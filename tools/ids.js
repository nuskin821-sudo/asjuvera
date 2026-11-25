// 접수번호를 줄 순서가 아니라 내용(접수일·이름·제품)으로 만든다. 시트 줄이 옮겨져도 번호가 바뀌지 않는다.
const norm = s => String(s || '').replace(/\s+/g, '').trim();
const keyOf = (date, name, product) => String(date || '').slice(0, 10) + '|' + norm(name) + '|' + norm(product);
function code(s) { let h = 0x811c9dc5; for (const ch of Buffer.from(s, 'utf8')) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0; } return (h % 1679616).toString(36).toUpperCase().padStart(4, '0'); }
// used: {id: key}. 같은 내용의 줄이 두 번 나오면 뒤에 B, C…를 붙인다.
function stableId(date, name, product, used) {
  const key = keyOf(date, name, product), base = 'AS-' + String(date).slice(2, 10).replace(/-/g, '') + '-' + code(key);
  let id = base, n = 0; while (used && used[id] != null) { n++; id = base + String.fromCharCode(65 + n); }
  if (used) used[id] = key; return id;
}
module.exports = { norm, keyOf, stableId };
