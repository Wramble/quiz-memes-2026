const MARKERS = {
  title: ['<!-- quiz-editor:title:start -->', '<!-- quiz-editor:title:end -->'],
  roundList: ['<!-- quiz-editor:round-list:start -->', '<!-- quiz-editor:round-list:end -->'],
  rounds: ['<!-- quiz-editor:rounds:start -->', '<!-- quiz-editor:rounds:end -->']
};

function markerStatus(html) {
  return Object.fromEntries(Object.entries(MARKERS).map(([name, [start, end]]) => [
    name,
    html.includes(start) && html.includes(end) && html.indexOf(start) < html.indexOf(end)
  ]));
}

function readRange(html, name) {
  const [start, end] = MARKERS[name];
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || startIndex >= endIndex) {
    throw new Error(`Missing or invalid quiz-editor ${name} markers`);
  }
  return html.slice(startIndex + start.length, endIndex).trim();
}

function parseRounds(html) {
  const region = readRange(html, 'rounds');
  const pattern = /<!-- quiz-editor:round id="([^"]+)" name="([^"]*)":start -->\s*([\s\S]*?)\s*<!-- quiz-editor:round:end -->/g;
  const rounds = [];
  let match;
  while ((match = pattern.exec(region))) {
    rounds.push({ id: match[1], name: decodeURIComponent(match[2]), html: match[3], defaults: {}, slots: [] });
  }
  return rounds;
}

function parseQuizDocument(html) {
  const status = markerStatus(html);
  for (const [name, present] of Object.entries(status)) {
    if (!present) throw new Error(`Missing or invalid quiz-editor ${name} markers`);
  }
  return {
    html,
    model: {
      titleHtml: readRange(html, 'title'),
      roundListHtml: readRange(html, 'roundList'),
      rounds: parseRounds(html)
    }
  };
}

function replaceRange(html, name, contents) {
  const [start, end] = MARKERS[name];
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || startIndex >= endIndex) {
    throw new Error(`Missing or invalid quiz-editor ${name} markers`);
  }
  return `${html.slice(0, startIndex + start.length)}\n${contents}\n${html.slice(endIndex)}`;
}

function renderRounds(rounds) {
  return rounds.map((round) => {
    const name = encodeURIComponent(round.name);
    return `<!-- quiz-editor:round id="${round.id}" name="${name}":start -->\n${round.html}\n<!-- quiz-editor:round:end -->`;
  }).join('\n');
}

function renderQuizDocument(document, model) {
  let result = replaceRange(document.html, 'title', model.titleHtml);
  result = replaceRange(result, 'roundList', model.roundListHtml);
  return replaceRange(result, 'rounds', renderRounds(model.rounds));
}

module.exports = { markerStatus, parseQuizDocument, renderQuizDocument };
