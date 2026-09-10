import { recognizePixels, disposeEngine } from '../src/perception/ocr.js';
import { redactScreenshot, sanitizedImageForPerception } from '../src/privacy/redact.js';
import { sanitizeVisual } from '../src/privacy/visual.js';

document.getElementById('run').addEventListener('click', async () => {
  const button = document.getElementById('run'); button.disabled = true;
  document.getElementById('status').textContent = 'Running actual engine…';
  const timeout = setTimeout(() => {
    document.getElementById('status').textContent = 'FAIL: engine timeout; reload this test page to dispose initialization.';
    disposeEngine().catch(() => {});
  }, 45_000);
  try {
    await disposeEngine();
    const canvas = document.getElementById('overlay'); canvas.width = 1000; canvas.height = 750;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 750);
    ctx.fillStyle = '#111'; ctx.font = '28px Arial';
    const expected = ['Employee Travel Request', 'Employee Name', 'Email', 'Phone', 'Employee ID', 'Destination', 'Bengaluru', 'Purpose', 'Conference', 'Password', 'Continue'];
    expected.forEach((text, i) => ctx.fillText(text, 35, 45 + i * 60));
    const fields = ['name', 'email', 'phone', 'employee_id', 'password'].map((role, i) => ({
      id: `field_${i + 1}`, role, sensitive: true, rect: { x: 550, y: 80 + i * 100, width: 350, height: 45 },
    }));
    const redacted = await redactScreenshot(canvas.toDataURL('image/png'), fields, { width: 1000, height: 750 });
    const image = sanitizedImageForPerception(redacted.handle);
    const runs = [];
    for (let i = 0; i < 2; i++) {
      const actual = sanitizeVisual(await recognizePixels(image), []);
      if (actual.privacy !== 'SAFE') throw new Error('Output blocked.');
      runs.push(actual.value);
    }
    const detected = runs[1].items.map((i) => i.text).join(' ');
    const missing = ['Destination', 'Bengaluru', 'Purpose', 'Conference', 'Continue'].filter((word) => !detected.includes(word));
    const preview = new Image(); preview.src = image.dataUrl; await preview.decode(); ctx.drawImage(preview, 0, 0);
    ctx.strokeStyle = '#ff4d24'; ctx.lineWidth = 2;
    runs[1].items.forEach(({ bbox: b }) => ctx.strokeRect(b.x, b.y, b.width, b.height));
    document.getElementById('result').textContent = JSON.stringify({ runs }, null, 2);
    document.getElementById('status').textContent = missing.length ? `FAIL: missing ${missing.join(', ')}` : 'PASS: actual local OCR recognized all five target strings, with boxes; cold and warm runs complete.';
  } catch {
    document.getElementById('status').textContent = 'FAIL: real local OCR unavailable or output blocked.';
  } finally { clearTimeout(timeout); button.disabled = false; await disposeEngine(); }
});
