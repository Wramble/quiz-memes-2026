# Quiz editor: design

## Goal

Add a local graphical editor for this custom Reveal.js quiz. It will edit only
the quiz title, the round list, and the marked round area of `index.html` while
leaving the existing Reveal.js layout, styles, scripts, and arbitrary
unmarked slides intact. The editor is also able to show and save the complete
HTML document for one-off quiz-specific changes.

## Entry point and file boundaries

Add a separate `npm run editor` command that starts a small Node.js HTTP
server and opens or serves the editor page. Do not extend `gulp-connect`:
it is a static server and cannot provide the needed read/write API.

The server is local-only. It can:

- read `index.html`;
- create a timestamped backup before each successful write;
- list files below `media/` as project-relative paths;
- write `index.html`.

It must reject every request whose resolved path is outside the repository or
outside `media/` for media-listing endpoints. It must not upload, transform,
rename, or delete media.

## Persistent document contract

The editor owns only these comment-delimited ranges:

```html
<!-- quiz-editor:title:start -->
<h2>...</h2>
<!-- quiz-editor:title:end -->

<!-- quiz-editor:round-list:start -->
...
<!-- quiz-editor:round-list:end -->

<!-- quiz-editor:rounds:start -->
<!-- quiz-editor:round id="stable-id" name="Round name":start -->
<section>...</section>
<!-- quiz-editor:round:end -->
<!-- quiz-editor:rounds:end -->
```

The initial migration adds these markers around the existing quiz title,
round-list items, and round container sections currently bounded by the
existing `<!-- start -->` and `<!-- finish -->` comments. It does not change
the surrounding Reveal.js structure, scripts, CSS, or media references.

Each later generated round has a stable generated ID. The round name is
escaped in the comment attribute and is treated as metadata; the visible HTML
remains the source for user-facing text. The parser preserves the complete
inner HTML of a marked round so custom sections and markup are not discarded.

If source-mode editing removes or damages an owned marker, saving the full
document remains possible. Structured editing reports the affected portion as
unavailable until valid markers are restored.

## Editor model and UI

The editor page has three views sharing one in-memory document:

1. **Quiz view** edits the title and ordered round list. Creating a round asks
   for its name, number of questions, default answer time, and default slide
   behaviour. It creates empty question/answer slots; it does not silently
   choose a template or media.
2. **Slide view** edits a selected question or answer slot. It offers separate
   question and answer template lists, a media browser backed by `media/`, a
   structured attribute editor, and an adjacent HTML editor for that section.
3. **Source view** displays the complete assembled `index.html` and can save
   it as a whole. It supports special cases such as an extra video after score
   calculation, even where no structured control exists.

Changing a round's defaults affects only future empty slots. Existing slides
store only their explicit overrides and therefore retain their effective
behaviour until changed by the user. A slide can override every round default
independently.

The structured attributes cover standard Reveal data attributes and the
quiz-specific attributes already used in this project, including
`data-autoslide`, `data-autoslide-auto`, `data-auto-animate`,
`data-transition`, `q-num`, `start-audio`, `stop-audio`, `volumehalf`, and
`volumefull`. It also supports arbitrary attribute name/value pairs and
boolean attributes, so the form never limits the HTML that can be produced.

Templates are extracted from the current quiz as separate question and answer
examples, then supplemented with small neutral templates: text, image, video,
audio, timer question, and answer/reveal. Selecting a template fills only a
previously empty slot unless the user explicitly chooses to replace its HTML.
The section HTML can always be edited directly after template selection.

## Read, edit, and save flow

On load, the editor fetches the document and parses the owned regions into a
structured model plus the untouched document text. It displays an actionable
parse error rather than guessing if a required region is malformed.

Structured changes update the model and regenerate only the owned regions on
save. Source changes replace the in-memory full document; saving validates
basic HTML and reports marker availability before writing. The server creates
a timestamped `index.html.bak-...` backup, then performs an atomic replace
where the platform permits it. Failed parsing, validation, or write operations
leave the original file unchanged.

Media selection inserts a normalized `media/...` path into the active section
HTML. The browser may preview a selected image, video, or audio file, but no
media content is copied or modified.

## Testing and verification

Automated Node tests cover:

- title, round-list, and round marker parsing;
- generation that replaces only owned ranges and preserves arbitrary content
  outside them;
- defaults and per-slide overrides;
- template insertion for empty question and answer slots;
- media-path traversal rejection and API validation;
- backup creation and failure behaviour.

Manual verification covers starting the editor, loading the current quiz,
creating a round and blank slots, choosing a question/answer template,
selecting existing media, editing per-slide audio/timer settings, saving,
reloading the editor, and running the produced `index.html` through the
existing Reveal.js static server.

## Out of scope

- Editing Reveal.js scripts, CSS, dependencies, or global configuration from
  structured controls.
- Uploading, optimizing, deleting, or moving media.
- Supporting simultaneous editing sessions or remote network access.
