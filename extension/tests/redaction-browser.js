import { redactScreenshot, buildOutboundPackage } from '../src/privacy/redact.js';

const assert = (condition) => { if (!condition) throw new Error('Pixel assertion failed.'); };
async function pixels(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}
try {
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eeddcc'; ctx.fillRect(0, 0, 800, 400);
  const roles = ['name', 'email', 'phone', 'employee_id', 'password', 'destination', 'purpose'];
  const fields = roles.map((role, i) => ({ id: `field_${i + 1}`, role, sensitive: i < 5,
    rect: { x: 10 + i * 55, y: 25, width: 45, height: 30 } }));
  ctx.fillStyle = '#4488cc';
  fields.forEach((f) => ctx.fillRect(f.rect.x * 2, f.rect.y * 2, f.rect.width * 2, f.rect.height * 2));
  const raw = canvas.toDataURL('image/png');
  const visual = await redactScreenshot(raw, fields, { width: 400, height: 200 });
  const outbound = buildOutboundPackage(visual.handle, { fields: [] }, []);
  const [before, after, original] = await Promise.all([pixels(raw), pixels(outbound.image.dataUrl), pixels(visual.originalPreview)]);
  assert(visual.redactedRegions === 5 && raw !== outbound.image.dataUrl);
  let checked = 0;
  for (let y = 0; y < 400; y++) for (let x = 0; x < 800; x++) {
    const region = fields.find((f) => x >= f.rect.x * 2 && x < (f.rect.x + f.rect.width) * 2 && y >= f.rect.y * 2 && y < (f.rect.y + f.rect.height) * 2);
    const offset = (y * 800 + x) * 4;
    for (let c = 0; c < 4; c++) {
      assert(after[offset + c] === (region?.sensitive ? (c === 3 ? 255 : 0) : before[offset + c]));
      assert(original[offset + c] === (region?.role === 'password' ? (c === 3 ? 255 : 0) : before[offset + c]));
    }
    checked++;
  }
  document.getElementById('original').src = visual.originalPreview;
  document.getElementById('sanitized').src = outbound.image.dataUrl;
  document.getElementById('result').textContent = `PASS: ${checked} pixels checked; 5 masks opaque; Destination/Purpose unchanged; original password masked; 2x mapping.`;
} catch {
  document.getElementById('result').textContent = 'FAIL: local Canvas pixel test failed.';
}
