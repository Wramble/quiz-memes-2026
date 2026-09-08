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
function region(name) {
  const start = `<!-- quiz-editor:${name}:start -->`;
  const end = `<!-- quiz-editor:${name}:end -->`;
  const from = html.indexOf(start), to = html.indexOf(end);
  return from >= 0 && to > from ? { start, end, from, to, value: html.slice(from + start.length, to).trim() } : null;
}
function replaceRegion(name, value) {
  const current = region(name);
  if (!current) throw new Error(`Не найдены маркеры ${name}`);
  html = `${html.slice(0, current.from + current.start.length)}\n${value}\n${html.slice(current.to)}`;
}
function renderQuiz() {
  const title = region('title'); const rounds = region('rounds');
  view.innerHTML = `<h2>Квиз</h2><label>Тема <input id="title" value="${title ? title.value.replace(/<[^>]+>/g, '').trim() : ''}"></label><button id="apply-title">Применить тему</button><p>Раундов в шаблоне: ${(rounds?.value.match(/quiz-editor:round id=/g) || []).length}</p><label>Новый раунд <input id="round-name" placeholder="Название"></label><label>Вопросов <input id="question-count" type="number" min="0" value="10"></label><button id="add-round">Добавить пустой раунд</button><h3>Медиа</h3><select id="media"><option>Выберите файл</option>${media.map((file) => `<option>${file}</option>`).join('')}</select><p>Выберите «Исходник», чтобы редактировать секции, атрибуты и нестандартные слайды напрямую.</p>`;
  view.querySelector('#apply-title').onclick = () => { replaceRegion('title', `<h2>${view.querySelector('#title').value}</h2>`); status.textContent = 'Тема изменена в памяти. Нажмите «Сохранить».'; };
  view.querySelector('#add-round').onclick = () => {
    const name = view.querySelector('#round-name').value.trim(); const count = Number(view.querySelector('#question-count').value);
    if (!name || !Number.isInteger(count) || count < 0) return status.textContent = 'Укажите название и число вопросов.';
    const id = `round-${Date.now()}`;
    const slots = Array.from({ length: count }, (_, index) => `                    <!-- Пустой вопрос ${index + 1}: выберите шаблон в исходнике -->\n                    <section></section>\n                    <!-- Пустой ответ ${index + 1}: выберите шаблон в исходнике -->\n                    <section></section>`).join('\n');
    const block = `<!-- quiz-editor:round id="${id}" name="${encodeURIComponent(name)}":start -->\n                <section>\n                    <section><h1>${name}</h1></section>\n${slots}\n                </section>\n<!-- quiz-editor:round:end -->`;
    replaceRegion('rounds', `${rounds.value}\n${block}`); status.textContent = `Добавлен пустой раунд «${name}». Нажмите «Сохранить».`; renderQuiz();
  };
}
document.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => button.dataset.view === 'source' ? renderSource() : renderQuiz());
document.querySelector('#save').onclick = async () => { const source = document.querySelector('#source'); if (source) html = source.value; const response = await fetch('/api/document', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html }) }); const payload = await response.json(); status.textContent = payload.error || `Сохранено; backup: ${payload.backup}`; };
load().catch((error) => { status.textContent = error.message; });
