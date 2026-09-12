// Controlled acceptance fixture only. No planner or action sequence lives here.
const query = new URL(location.href).searchParams.get('q');
if (query) {
  document.getElementById('query').value = query;
  document.getElementById('results').hidden = false;
  document.getElementById('result-heading').textContent = 'Search results for ' + query;
  document.title = 'Search results - Learning library';
}
