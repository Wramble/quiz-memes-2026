let html = '';
let media = [];
const view = document.querySelector('#view');
const status = document.querySelector('#status');
async function load() {
  html = (await (await fetch('/api/document')).json()).html;
  media = (await (await fetch('/api/media')).json()).files;
  renderSource();
}
function renderSource() { view.innerHTML = '<h2>Исходник</h2><textarea id="source" style="width:100%;height:70vh"></textarea>'; view.querySelector('#source').value = html; }
function renderQuiz() { view.innerHTML = `<h2>Квиз</h2><p>Медиа: ${media.length}</p><select id="media"><option>Выберите файл</option>${media.map((file) => `<option>${file}</option>`).join('')}</select><p>Для полной гибкости изменяйте секции в режиме «Исходник».</p>`; }
document.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => button.dataset.view === 'source' ? renderSource() : renderQuiz());
document.querySelector('#save').onclick = async () => { const source = document.querySelector('#source'); if (source) html = source.value; const response = await fetch('/api/document', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html }) }); const payload = await response.json(); status.textContent = payload.error || `Сохранено; backup: ${payload.backup}`; };
load().catch((error) => { status.textContent = error.message; });
