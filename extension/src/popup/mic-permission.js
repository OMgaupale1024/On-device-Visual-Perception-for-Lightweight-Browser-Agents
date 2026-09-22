// One-time microphone grant for the extension origin. An extension popup cannot show
// Chrome's permission prompt; this extension-owned tab can, and the grant then applies
// to the popup too. The stream is stopped immediately: no audio is captured here.
const resultEl = document.getElementById('result');

async function allow() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    resultEl.textContent = 'Microphone allowed (MIC_GRANTED). Close this tab, reopen EdgeSight and press 🎤.';
  } catch (err) {
    const name = err?.name;
    resultEl.textContent = name === 'NotFoundError' || name === 'DevicesNotFoundError'
      ? 'No microphone found (MIC_NOT_FOUND).'
      : name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Microphone blocked (MIC_PERMISSION_DENIED). Allow it for EdgeSight in Chrome site settings, then try again.'
        : 'Microphone unavailable (MIC_UNAVAILABLE).';
  }
}

document.getElementById('allow').addEventListener('click', allow);
allow();
