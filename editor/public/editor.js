let html = '';
let media = [];
const liveReload = new EventSource('/api/live-reload');
liveReload.addEventListener('reload', () => location.reload());
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
function sections() { return [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)]; }
function renderSlide() {
  const list = sections();
  view.innerHTML = `<h2>Слайд</h2><label>Секция <select id="section">${list.map((_, i) => `<option value="${i}">${i + 1}</option>`).join('')}</select></label><label>Шаблон <select id="template"><option value="">Не менять</option><option value="question">Вопрос</option><option value="answer">Ответ</option></select></label><button id="apply-template">Применить шаблон</button><br><label>Атрибут <input id="attribute" placeholder="data-autoslide=40000 или start-audio"></label><button id="apply-attribute">Добавить атрибут</button><br><label>Медиа <select id="slide-media"><option value="">Не вставлять</option>${media.map((file) => `<option>${file}</option>`).join('')}</select></label><button id="apply-media">Вставить в src</button><br><textarea id="section-code" style="width:48%;height:55vh"></textarea><button id="apply-code">Применить код секции</button>`;
  const select = view.querySelector('#section'), code = view.querySelector('#section-code');
  const refresh = () => { code.value = sections()[Number(select.value)]?.[0] || ''; }; refresh(); select.onchange = refresh;
  const replaceSelected = (value) => { const match = sections()[Number(select.value)]; html = `${html.slice(0, match.index)}${value}${html.slice(match.index + match[0].length)}`; code.value = value; status.textContent = 'Секция изменена в памяти. Нажмите «Сохранить».'; };
  view.querySelector('#apply-template').onclick = () => { const kind = view.querySelector('#template').value; if (kind) replaceSelected(kind === 'question' ? '<section data-autoslide="40000" data-autoslide-auto volumehalf><h2>Текст вопроса</h2></section>' : '<section><h2 class="fragment fade-up">Ответ</h2></section>'); };
  view.querySelector('#apply-code').onclick = () => replaceSelected(code.value);
  view.querySelector('#apply-attribute').onclick = () => { const raw = view.querySelector('#attribute').value.trim(); if (!raw) return; const [name, value] = raw.split('='); replaceSelected(code.value.replace('<section', `<section ${name}${value ? `="${value}"` : ''}`)); };
  view.querySelector('#apply-media').onclick = () => { const selected = view.querySelector('#slide-media').value; if (!selected) return; replaceSelected(code.value.match(/\ssrc="[^"]*"/) ? code.value.replace(/\ssrc="[^"]*"/, ` src="${selected}"`) : code.value.replace('>', `><img src="${selected}" height="900px">`)); };
}
document.querySelectorAll('[data-view]').forEach((button) => button.onclick = () => ({ source: renderSource, slide: renderSlide, quiz: renderQuiz })[button.dataset.view]());
document.querySelector('#save').onclick = async () => { const source = document.querySelector('#source'); if (source) html = source.value; const response = await fetch('/api/document', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html }) }); const payload = await response.json(); status.textContent = payload.error || `Сохранено; backup: ${payload.backup}`; };
load().catch((error) => { status.textContent = error.message; });
