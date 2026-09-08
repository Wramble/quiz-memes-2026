const TEMPLATES = [
  { id: 'question-text', kind: 'question', label: 'Текстовый вопрос', html: '<section><h2>Текст вопроса</h2></section>' },
  { id: 'question-image', kind: 'question', label: 'Вопрос с изображением', html: '<section data-autoslide="40000" data-autoslide-auto><h2>Текст вопроса</h2><img src="media/" height="900px"></section>' },
  { id: 'question-video', kind: 'question', label: 'Вопрос с видео', html: '<section stop-audio><h2>Текст вопроса</h2><video preload="none" controls data-autoplay src="media/" height="900px"></video></section>' },
  { id: 'question-audio', kind: 'question', label: 'Вопрос с аудио', html: '<section stop-audio><h2>Текст вопроса</h2><audio preload="none" controls data-autoplay src="media/"></audio></section>' },
  { id: 'answer-text', kind: 'answer', label: 'Текстовый ответ', html: '<section><h2 class="fragment fade-up">Ответ</h2></section>' },
  { id: 'answer-media', kind: 'answer', label: 'Ответ с медиа', html: '<section><img src="media/" height="900px"><h2 class="fragment fade-up">Ответ</h2></section>' }
];

module.exports = { TEMPLATES };
