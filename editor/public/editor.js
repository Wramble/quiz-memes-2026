let html = "",
  media = [],
  ri = 0,
  si = 0,
  all = false;
const w = document.querySelector("#workspace"),
  s = document.querySelector("#status");
new EventSource("/api/live-reload").addEventListener("reload", () =>
  location.reload(),
);
const R = () => [
  ...html.matchAll(
    /<!-- quiz-editor:round id="[^"]+" name="([^"]*)":start -->\s*([\s\S]*?)\s*<!-- quiz-editor:round:end -->/g,
  ),
];
function S(t, u = 1) {
  let a = [],
    d = 0,
    p = -1;
  for (const m of t.matchAll(/<\/?section\b[^>]*>/g)) {
    if (m[0][1] != "/") {
      if (!d++) p = m.index;
    } else if (!--d) a.push({ i: p, t: t.slice(p, m.index + m[0].length) });
  }
  if (u && a.length == 1) {
    let q = t.indexOf(">") + 1;
    return S(t.slice(q, t.lastIndexOf("</section>")), 0).map((x) => ({
      ...x,
      i: x.i + q,
    }));
  }
  return a;
}
function put(i, n, v) {
  html = html.slice(0, i) + v + html.slice(i + n);
}
function view(p) {
  const f = document.createElement("iframe"),
    round = R()[ri]?.[2] || "";
  f.className = "slide-frame";
  f.srcdoc = `<!doctype html><base href="${location.origin}/"><link rel="stylesheet" href="dist/reset.css"><link rel="stylesheet" href="dist/reveal.css"><link rel="stylesheet" href="dist/theme/blood.css"><div class="reveal"><div class="slides">${round}</div></div><script type="module">import Reveal from '/dist/reveal.esm.js';const r=new Reveal();r.initialize({embedded:true,controls:false,progress:false,center:true}).then(()=>r.slide(0,${si}));</script>`;
  p.replaceChildren(f);
}
function draw() {
  if (all) {
    w.innerHTML =
      '<section class="panel" style="grid-column:1/3"><textarea id="a" style="width:100%;height:90%"></textarea></section>';
    let a = document.querySelector("#a");
    a.value = html;
    a.oninput = () => (html = a.value);
    return;
  }
  let r = R(),
    q = r[ri],
    x = q ? S(q[2]) : [];
  w.innerHTML = `<aside class="panel"><h3>Темы</h3>${r.map((z, i) => `<button data-r="${i}">${decodeURIComponent(z[1])}</button>`).join("")}<h3>Слайды</h3>${x.map((z, i) => `<button data-s="${i}">Слайд ${i + 1}</button>`).join("")}</aside><section class="panel"><div id="preview"></div><div class="bottom"><textarea id="code"></textarea><div class="media-list"><h3>Медиа</h3>${media.map((m) => `<div class="media" draggable data-m="${m}">${m}</div>`).join("")}</div></div></section>`;
  let c = document.querySelector("#code"),
    p = document.querySelector("#preview"),
    z = x[si];
  c.value = z?.t || "";
  view(p);
  let save = (v) => {
    let n = S(R()[ri][2])[si];
    put(R()[ri].index + R()[ri][0].indexOf(R()[ri][2]) + n.i, n.t.length, v);
    s.textContent = "Несохранённые изменения";
  };
  c.oninput = () => {
    save(c.value);
    view(p);
  };
  document.querySelectorAll("[data-r]").forEach(
    (b) =>
      (b.onclick = () => {
        ri = +b.dataset.r;
        si = 0;
        draw();
      }),
  );
  document.querySelectorAll("[data-s]").forEach(
    (b) =>
      (b.onclick = () => {
        si = +b.dataset.s;
        draw();
      }),
  );
  document
    .querySelectorAll(".media")
    .forEach(
      (e) =>
        (e.ondragstart = (z) =>
          z.dataTransfer.setData("text/plain", e.target.dataset.m)),
    );
  p.ondragover = (e) => e.preventDefault();
  p.ondrop = (e) => {
    e.preventDefault();
    let m = e.dataTransfer.getData("text/plain"),
      tag = /\.(mp4|mov|webm)$/i.test(m)
        ? `<video controls src="${m}"></video>`
        : /\.(mp3|wav|ogg)$/i.test(m)
          ? `<audio controls src="${m}">`
          : `<img src="${m}">`,
      v = c.value.replace("</section>", tag + "</section>");
    save(v);
    c.value = v;
    view(p);
  };
}
document.querySelector("#document-mode").onclick = () => {
  all = !all;
  draw();
};
document.querySelector("#save").onclick = async () => {
  let p = await (
    await fetch("/api/document", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ html }),
    })
  ).json();
  s.textContent = p.error || "Сохранено";
};
(async () => {
  html = (await (await fetch("/api/document")).json()).html;
  media = (await (await fetch("/api/media")).json()).files;
  draw();
})();
