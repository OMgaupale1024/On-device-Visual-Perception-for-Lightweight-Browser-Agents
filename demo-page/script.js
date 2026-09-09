// Demo-only. No network calls. On submit, reveal the success state so later phases
// (agent verification) have a clear, observable "after" page.
document.getElementById('travel-form').addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('travel-form').classList.add('hidden');
  document.getElementById('success').classList.remove('hidden');
  document.title = 'Travel Request Submitted';
});
