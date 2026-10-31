# Cumple Chas

Personal memory album built with HTML, CSS and vanilla JavaScript.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/#para-chas. Internet access is required for the Supabase browser client and the shared message database. The gallery uses local image files.

## Guest photo uploads

The **Sumar** sheet accepts batches of up to five JPEG, PNG or WebP files. `js/photo-upload.js` contains reusable validation, stable-ID, payload, batch and browser-compression helpers. `js/guest-photos.js` owns the upload form, per-photo previews/captions/status, guest-photo loading and album mapping. `js/supabase-client.js` reuses the existing public client for the `guest-photos` bucket and `public.photos`.

Before upload, each image is decoded in the browser with its embedded orientation, resized proportionally so its longest edge is at most **1920 px**, drawn onto a canvas and encoded as **WebP at quality 0.84**. If the browser cannot produce WebP, it falls back to **JPEG at quality 0.86**. No original image is sent first. The compressed result must remain below the bucket's 10 MB limit.

Every object path is generated as `uploads/<crypto.randomUUID()>.webp` (or `.jpg` for the fallback). Uploads always use `upsert: false`. Storage succeeds before the row is inserted into `public.photos`; the row contains `storage_path`, the optional `caption`, `uploader_name` or `null`, and `is_anonymous`. The insert returns the database UUID. If that insert fails, the client does not attempt a forbidden delete: it logs the storage path for administrative cleanup, warns the guest not to resend that item, and leaves the possible orphan documented here.

Rows are loaded newest first into the dedicated **Lo que ustedes sumaron** section. They never enter or affect the curated 19-photo **El álbum** grid, its filters, random button or numbering. A guest row with UUID `<uuid>` gets application/comment ID `guest-<uuid>`. That stable value is passed unchanged to the existing `photo_comments.photo_id` reads and writes, so guest photos use the same modal, named/anonymous comments, drafts, pagination and failure handling as original photos. Previous/next navigation stays within whichever collection was opened.

Batch progress is item-based (preparing, uploading, registering, finished), because the Supabase browser upload API does not expose byte progress. When only part of a batch succeeds, successful items are locked and skipped on retry; connection/upload failures remain with their preview and caption. A post-upload metadata failure is not automatically retried because doing so would create another Storage object.

Manual upload test:

1. Start the local server, open the site on a phone-sized viewport, tap **Sumar**, and choose one supported photo. Confirm its preview, add context, enter a name, and submit. Watch the explicit preparation, numbered upload and album-registration stages.
2. Confirm the large **¡Listo!** state appears. Test **Subir otra**, then upload again and use **Ver las fotos compartidas**; the sheet should close, the dedicated guest section should scroll into view and the new memory should be briefly highlighted. The curated grid must still contain exactly its 19 original memories. Open the guest photo and verify its caption, uploader, guest-only previous/next navigation, and named then anonymous comments. Reload and confirm both photo and comments persist.
3. Repeat with **Sin nombre** and verify the album shows **Anónimo**, not the previously typed name.
4. Select five photos and remove one before submitting. Then try selecting six at once, or four followed by two more; the selection must be rejected with the five-photo explanation.
5. Try a non-image or unsupported HEIC/GIF file. It must not upload and the UI must explain the accepted formats.
6. In developer tools, inspect a compressed upload: its longest dimension is at most 1920 px, normally uses WebP, is much smaller than the original, and the Storage request does not overwrite. Inspect the following `photos` insert payload and returned UUID.
7. Simulate partial failure by taking the browser offline during a multi-photo batch. Restore connectivity and retry: completed items must not upload again, while retryable items remain available.
8. Block only the `photos` insert after allowing Storage. Confirm the friendly warning, the technical console entry with `storagePath`, and that the browser makes no DELETE request. Clean that orphan later with administrative credentials if needed.
9. Block the guest-photo SELECT and reload. The 19 originals must remain usable and unchanged while the separate guest section shows an honest error state.

## Para Chas messages

The official supabase-js v2 browser client is loaded from a pinned jsDelivr CDN URL in `index.html`. Project URL and publishable key live together in `js/supabase-client.js`. This is public browser configuration; database access remains governed by the existing Supabase grants and RLS policies.

`js/messages.js` handles validation, submission states and rendering. It reads `public.messages` newest first, in pages of 50, and inserts only `name`, `content` and `is_anonymous`. IDs are not displayed. No authentication session, update or delete operations are used.

To test manually:

1. Open **Para Chas**, type a message and a name, and click **Enviar mi notita**. The button is disabled while sending. After success, the form clears and the list refreshes.
2. Reload the page to confirm the message was saved. It will be visible to anyone who can access the album.
3. For another message, tick **Sin nombre**. It appears as **Anónimo** and is sent with `name: null` and `is_anonymous: true`. Otherwise a nonblank name is required.
4. Try blank/whitespace messages and a missing name without **Sin nombre**; neither should be sent. Maximum lengths are 1000 characters for a message and 50 for a name.
5. In browser developer tools, switch the network offline and try sending. The draft should remain, controls should become usable again, and a friendly error should appear. Restore connectivity and use **Actualizar** to reload messages. If a response was lost, check the list before resending.
6. For a read-error check, block requests to the project's `/rest/v1/messages` endpoint and click **Actualizar**. Unblock requests and retry.

Manual submissions create real messages. Automated tests use mocks and do not write to the live database. If a write succeeds but the following read fails, the page confirms the save and offers a list refresh instead of suggesting a duplicate submission.

## Checks

No dependency installation is needed:

```sh
node tests/messages.test.cjs
node tests/photo-comments.test.cjs
node tests/voice-messages.test.cjs
node tests/party.test.cjs
node tests/guest-photos.test.cjs
node --check js/app.js
node --check js/photos.js
node --check js/photo-upload.js
node --check js/guest-photos.js
node --check js/photo-comments.js
node --check js/messages.js
node --check js/supabase-client.js
node --check js/voice-recorder.js
node --check js/voice-data.js
node --check js/voice-messages.js
git diff --check
```

The automated tests cover message validation, named/anonymous payloads, submission locking, form reset, list refresh and pagination, network/read/insert failures, timeout handling, stale read protection and rendering user text safely. They use a small DOM fixture rather than a browser layout engine.

## Photo comments / context

Photo data lives in `js/photos.js`. Every seed photo has an explicit permanent application ID, `chas-memory-001` through `chas-memory-019`. IDs are written into each record, never calculated from position, displayed gallery number or filename. Preserve the ID when reordering or changing an image path. Never reuse an existing ID for a different memory. Future guest photos must get new permanent IDs. The tests lock down the seed ID-to-photo mapping.

`js/app.js` keeps the existing modal, titles, captions, gallery filters and previous/next navigation. It sets the selected photo ID and emits `memory:change`. `js/photo-comments.js` handles the conversation and keeps unsent drafts separate for each photo, in memory until the page reloads. Navigation and close/reopen retain drafts. Late reads and writes cannot overwrite another photo's content or draft.

The `chasPhotoCommentsApi` adapter in `js/supabase-client.js` reuses the same Supabase client and publishable configuration as birthday messages:

- SELECT from `public.photo_comments`, filtered with `.eq('photo_id', photoId)`, newest first, in pages of 50. Database IDs are not displayed.
- INSERT only `photo_id`, `name`, `content`, `is_anonymous`. A named comment needs a nonblank name; anonymous comments use `name: null` and `is_anonymous: true`.
- No UPDATE/DELETE operations or changes to RLS. A successful insert is followed by a separate refresh, so a failed refresh cannot be mistaken for a failed save.

To test locally:

1. Start the server above, open http://localhost:8000/#album, and select a photo. Check its large image, caption, honest empty state or existing comments, and previous/next buttons. On mobile the existing modal fills the screen.
2. Add a comment and a name. After sending, the form clears, success appears and comments refresh immediately. Reload and reopen that photo to verify persistence.
3. Open another photo: its comments must be separate. Try an anonymous comment; it should display **Anónimo**. Blank text or a missing name without **Sin nombre** must not submit.
4. In browser developer tools, inspect the `/rest/v1/photo_comments` request: the filter must contain the permanent `chas-memory-…` ID, never the filename. The POST body must contain that same `photo_id`.
5. Switch offline or block the comments endpoint and submit. The draft should survive the failure and navigation to another photo and back. Unblock requests, use **Actualizar**, and check the list before resending if the response was lost.
6. Move between photos quickly while requests are pending. Comments and drafts must stay attached to their own photo. Verify the existing **Para Chas** messages still load and submit normally.

Manual submissions are real public comments. Automated tests use mocks and do not write to Supabase. Comment tests cover permanent IDs, modal navigation, scoped reads, named/anonymous validation, safe rendering, successful and failed inserts, per-photo drafts, read retries, stale responses and navigating during a pending submission. Existing message tests remain unchanged.

Voice messages are available in **Para Chas** (see below). No Netlify configuration is included.


## Voice messages

**Para Chas** now offers **Escribir una notita** and **Grabar un audio**. Voice recording requires a browser with `MediaRecorder`, microphone access and a secure context: HTTPS, or localhost on the same device. A phone visiting a computer's plain HTTP LAN IP generally cannot use the microphone; use HTTPS to test from a phone. Text messages remain available when recording is unsupported or permission is denied.

### Code and lifecycle

- `js/voice-recorder.js` owns microphone access, MIME detection and the MediaRecorder lifecycle. It tries the first format reported by `MediaRecorder.isTypeSupported()` from WebM/Opus, WebM, MP4, Ogg/Opus, Ogg, MPEG. If none is advertised, it lets the browser select its default, then verifies the actual recording MIME type. MP4 uses `.m4a`, WebM `.webm`, Ogg `.ogg`, and MPEG `.mp3`. Codec parameters are removed from the Blob's content type to match the bucket's allowed base MIME types; the audio is not transcoded.
- Recording has a visible timer, a warning after 105 seconds and automatic stopping at the two-minute ceiling (scheduled with a 100 ms safety margin). Elapsed time is independently checked: recordings longer than 120 seconds, including delayed/background timer cases, are rejected rather than mislabeled. Valid durations are stored as integer seconds rounded up. Recordings shorter than one second are rejected.
- Stopping releases every microphone track and makes a local Blob URL available for listening, pausing, discarding or re-recording. It never uploads. Switching to text or hiding the page stops an active recording. Discarding, re-recording, successful submission and leaving the page revoke local URLs; pending permission requests are cancelled logically and late microphone streams are released.
- `js/voice-data.js` validates the signature, MIME, 1–120 second duration and 10 MB size limit, generates `uploads/<crypto.randomUUID()>.<extension>`, and orchestrates publishing. A nonanonymous message needs a trimmed name of up to 50 characters. Anonymous messages always send `name: null` and `is_anonymous: true`.
- The `chasVoiceMessagesApi` in `js/supabase-client.js` reuses the existing publishable client. First it uploads to the public **voice-messages** bucket with `upsert: false`. Only after Storage confirms success does it insert `storage_path`, `name`, `is_anonymous`, `duration_seconds` into `public.audio_messages`. No authentication, update or delete operations are added.
- `js/voice-messages.js` manages the tabs, recording controls, preview, explicit-send form and clear **✓ Audio guardado** success panel. Saved recordings are fetched newest first in pages of 50. Cards display safe author text (or **Anónimo**), duration, date and a native audio player with no autoplay and no eager audio download. URLs are derived from the bucket and `storage_path`; IDs and paths are not printed in the UI.

### Failures and possible orphan files

A Storage failure prevents metadata insertion, preserves the local preview and allows retrying the **same** unique path without overwrite. If that retry reports an existing object, sending is blocked because the earlier response may have been lost. Technical details and the path are logged for review.

If Storage succeeds but metadata registration fails (including an uncertain network response), the file can become an **orphan object**. The client does not delete it or automatically send it again. It logs `storage_path` for administrative review/cleanup, keeps the preview playable and disables resending that draft. Check the saved-message list before recording another. A lost response may mean the row was actually created. Manual administrative review must determine whether cleanup is appropriate; no admin UI or DELETE permission is implemented.

If an insert is confirmed but the subsequent list refresh fails, the success panel remains visible and the list offers **Actualizar**. No second upload is needed.

### Exact manual test procedure

1. From this directory run `python3 -m http.server 8000`, then open **http://localhost:8000/#para-chas** on the same computer. Use an HTTPS-served copy for iOS Safari / Android Chrome testing; do not configure Netlify for this step.
2. Verify the existing text-message form still reads and sends normally. Select **Grabar un audio**. Press **Grabar** and allow microphone access. Verify the recording indicator, timer and obvious **Detener** button. Stop after several seconds. The microphone indicator should turn off.
3. Play, pause and listen to the local preview. In developer tools, verify no Storage upload occurred just by recording or stopping. Use **Descartar** and **Grabar de nuevo** to test a fresh take.
4. Record again, leave the name empty and press **Enviar mi audio**. Verify name validation and that no upload starts. Enter a name, then explicitly send. Watch **Subiendo tu audio…**, the registration stage and **✓ Audio guardado**. Use **Escuchar mensajes**; the new card should show your name and an audio player. Reload to verify persistence.
5. Use **Grabar otro**, record and select **Sin nombre**. Send and check **Anónimo**. Inspect the requests: the POST to `audio_messages` follows Storage success and includes a null name, true anonymity, an integer duration and a unique Storage path. Manual sends create real public recordings.
6. Record for the full two minutes: check the warning near the end, automatic stop, local playback and duration no greater than 2:00. Switch to text or put the browser in the background mid-recording; capture must stop, without uploading automatically.
7. Deny microphone permission, then restore it through browser settings and retry. Also test a missing/busy microphone and an unsupported/insecure browser context. A friendly message should appear and text messages must remain usable.
8. Record a take, then switch the network offline before sending. The preview and signature must remain after the upload error. Restore connectivity and retry. A retry reuses the original path; it never overwrites or creates a second object automatically.
9. To test metadata failure deliberately, use browser request blocking for `/rest/v1/audio_messages` while leaving Storage reachable, then send a test take. This can create a real orphan file: the UI must show a friendly failure, preserve playback, block resending and log the path. Do not change RLS or add delete permission. Review the logged path administratively afterward. Automated tests cover this case without creating real objects.
10. Block only the audio SELECT request (or go offline and click **Actualizar**) to check friendly list-load failure and recovery. Test saved playback in both iOS Safari and Android Chrome; format support is browser-dependent and there is no transcoding.

Run `node tests/voice-messages.test.cjs` for mocked recorder, MIME, permissions, size/duration, author payload, path, upload/metadata failure, playback rendering, UI lifecycle and adapter tests. Automated tests never create live recordings or Storage objects. Browser/microphone behavior still needs the real-device checks above.

Deferred: Netlify, QR codes, authentication, moderation/admin tools, audio editing/deletion and likes.


## Party layer

A compact **Un ratito de fiesta** section follows **Para Chas**. The handwritten header link jumps to it. Existing albums, upload flows, comments, messages and voice recording remain separate and usable.

- `js/celebration.js` handles the welcome dialog and the existing hero confetti button. It writes only the `chas:welcome:v1` flag to `sessionStorage` when the welcome is first shown. **Entrar** (or Escape) dismisses it, restores focus and makes a small confetti burst. Reloads and section navigation do not show it again in that session. If storage is blocked, entry still works, although a later reload may show the panel again. Reduced motion disables the drop/exit animation and confetti particles. Confetti has a shared 2.5-second cooldown and is limited to 28 small, noninteractive particles.
- `js/party-data.js` contains ten prompts with explicit permanent descriptive IDs, eight roulette challenges, selection/rotation helpers and payload validation. Preserve prompt IDs when changing wording or order. Roulette outcomes stay local and are never sent to Supabase.
- `js/party.js` animates the wheel, announces the selected challenge and routes **Hacerlo** to the existing upload dialog, voice tab, text form, a photo detail, or the innocent-gossip question. It never records, uploads or submits on the guest's behalf. The toast challenge is a social action with no pretend website operation. Reduced-motion mode shows the random outcome immediately.
- The `chasPartyAnswersApi` in `js/supabase-client.js` shares the existing publishable client. It SELECTs real `party_answers` rows newest first, in pages of 50, and INSERTs `prompt_id`, `answer`, `name`, `is_anonymous`. Named posts need a trimmed nonempty name (up to 50 characters); answers allow up to 1000 characters. Anonymous posts send `name: null` and `is_anonymous: true`. The UI explicitly says the name will not be displayed or saved with that answer; it makes no promise of absolute technical anonymity.
- Discovery shows one actual saved answer at a time, with its question and safe author text. **Ver otra respuesta** chooses another loaded row without immediately repeating the same one. **Buscar más respuestas** loads another page when available. Empty states and errors never manufacture cards, counters or responses. IDs are used internally only. Errors keep drafts; a confirmed write followed by a failed refresh is reported as saved.
- The inspected serious portrait was renamed from `WhatsApp Image 2026-10-29 at 17.25.10.jpeg` to `assets/images/chas/chas-serious.jpeg`. It appears only as a small “te leo” joke beside the game, never as a curated or guest memory. The 19 seed photo IDs and assets are unchanged.

### Exact manual party test

1. Run `python3 -m http.server 8000`, then open http://localhost:8000 in a fresh session. To reset just the welcome flag for testing, run `sessionStorage.removeItem('chas:welcome:v1')` in the browser console and reload.
2. Check the welcome drops in, **Entrar** exits cleanly and confetti appears briefly. Refresh and navigate between sections: the panel must stay dismissed. Escape should also allow entry. A new session should show the welcome again.
3. Tap **Un poquito de fiesta** in the hero repeatedly: only one burst should occur within 2.5 seconds. Emulate `prefers-reduced-motion: reduce` in browser developer tools and repeat; no confetti particles, welcome movement or wheel animation should run.
4. Follow **¿un ratito de fiesta?** or scroll below the saved voice messages. Spin the wheel: it should rotate, stop with the selected sector beneath the pointer and announce a challenge. Double tapping while it spins must not start a second spin.
5. Try **Hacerlo** for photo, audio, note and comment outcomes. They should open or scroll to the existing feature without sending anything or requesting the microphone automatically. The innocent-gossip outcome selects its game question. The toast outcome is an offline invitation.
6. In **Chisme o verdad**, try a blank answer or a missing name. Neither should publish. Type an answer, change questions and return: the unsent answer is retained for that question during this page visit.
7. Submit a named answer, then an unnamed one. Confirm success, cleared form and real answer cards after refresh. Inspect the `party_answers` POST: unnamed answers must have `name: null`, `is_anonymous: true`. Manual submissions are real public records.
8. Use **Ver otra respuesta** to discover different saved cards. With an empty table, verify the honest invitation to leave the first answer. No example answers should appear. Check the small serious portrait is absent from the hero and both photo collections.
9. Go offline before submitting. The draft must remain and the error must be friendly. Restore connectivity, click **Actualizar** and check for your answer before resending if the response was lost.
10. Check on a narrow phone screen, keyboard navigation and reduced-motion mode. Retest a text message, photo comment, guest photo upload and voice recording to confirm those flows still behave as before.

`node tests/party.test.cjs` tests welcome-session behavior, reduced motion, confetti cooldown, all wheel outcomes and pointer alignment, action routing, stable question IDs, anonymous/named payloads, real-answer rendering, empty states, drafts and failure handling. All automated data calls are mocked; tests never create live Supabase answers.

## Shared celebrations and interface languages

The header language picker offers **ES, EN, FR, DE, PT, 中文**. Spanish is the default, regardless of browser locale. The selection updates `<html lang>` immediately and is saved under `localStorage['chas:language']`; unsupported values are ignored. If storage is blocked, switching still works for the current visit.

- `js/translations.js` is the base catalogue and `js/translations-fr.js` adds complete French copy: 419 stable keys across Spanish, English, French, informal German, Portuguese and Simplified Chinese. Keep the existing keys when editing wording; add new keys rather than renumbering `copy.cNNN` entries. Seed captions, questions, wheel challenges, accessibility labels, validations and error/success states are included.
- `js/i18n.js` binds Spanish interface source phrases to catalogue keys and retains each node's original source in WeakMaps. A batched MutationObserver translates newly inserted text and accessibility attributes, so open photo details, upload progress, recording states, roulette results and questions switch without reload or resetting drafts. New interface copy needs a catalogue entry; unmapped text is left unchanged rather than displaying a raw key. `t()` throws for missing keys, and tests check catalogue completeness and current static copy.
- Explicit `data-i18n-html` keys translate complete authored headings with trusted markup. `data-i18n-text` / `data-i18n-aria-label` / `data-i18n-alt` and JSON `data-i18n-params` support ambiguous labels and opaque guest parameters. A parameter `{ "key": "copy.c145" }` localizes an anonymous label; a string parameter remains untouched. `explicitOnly` catalogue entries prevent curated labels from accidentally matching identical guest captions or names.
- Guest content and real author nodes have `translate="no"`; input/textarea values and audio are never translated. Names/captions embedded in interface labels remain opaque parameters. Dates use the chosen locale. Changing language never modifies Supabase data or replays an action.
- `js/celebration.js` reuses the existing confetti button and displays the exact shared count. The adapter in `js/supabase-client.js` makes an exact-count HEAD SELECT on `public.celebrations`; every deliberate **Celebrar a Chas** click makes one INSERT with a fresh UUID, then rereads the count. Only the existing publishable client is used. No UPDATE, DELETE, fake count, automatic retry or realtime subscription is added. Other visitors' celebrations appear on reload or after another successful celebration.
- Confetti and button submissions have a 2.5-second cooldown; an outstanding request keeps the button disabled longer if necessary. Welcome-entry confetti never inserts a celebration. Failed inserts leave the known count unchanged; a failed refresh after a confirmed insert explicitly says it was saved. A lost insert response is reported as unconfirmed, with no optimistic increment.

### Exact manual test procedure

1. Run `python3 -m http.server 8000` in the repository root. Open **http://localhost:8000/** with internet access. For a clean language test, run `localStorage.removeItem('chas:language')` in the browser console and reload: the site should start in Spanish even if the browser language differs.
2. Select **EN**, **DE**, **PT**, **中文**, then **ES**. Check navigation, headings, seed captions, form placeholders, accessibility labels, questions and wheel challenges. Inspect `<html lang>`. Reload after selecting a language: it must remain selected. Repeat with localStorage blocked: switching should still work during the visit.
3. Open a seed photo, then a guest photo. Switch language while the detail stays open. The interface/caption for curated photos should change; guest captions, comments and names must stay exactly as submitted. Type a draft and switch again: it should remain untouched. Verify the same behavior for birthday messages and saved game answers.
4. Open **Sumar**, select a supported photo and type a caption. Switch language before publishing; controls/placeholders should change while the caption/name remain. Check validation and upload states. Try the audio recorder on localhost (HTTPS on a phone); switch language with the local preview visible. It must stay playable and must not upload just because the language changed. Explicit manual submissions create real public records/files.
5. Spin the roulette and switch languages while the challenge is visible. Check the selected game question and saved-answer discovery without reloading. Existing action routing, uploads, messages, comments and voice submission should remain usable.
6. Note the initial shared celebration count. After leaving the welcome dialog and its cooldown, press **Celebrar a Chas** once. Expect confetti, subtle confirmation, and the real updated total. Rapid taps must not create extra requests within 2.5 seconds. Inspect Network: one INSERT to `celebrations`, followed by an exact-count HEAD read; no UPDATE/DELETE. Open a second tab/reload to verify the shared total. Manual clicks create real celebration rows.
7. Go offline and press the celebration button after its cooldown. Confetti may run; the total must not increase and friendly feedback must appear. Restore connectivity and reload to resolve any uncertain response. For the confirmed-write/read-failure case, block only HEAD reads to `celebrations` while leaving its POST enabled: the UI must distinguish a saved celebration from an unavailable total.
8. Check a narrow phone viewport, keyboard focus, the language selector and reduced-motion mode. Confetti animation remains suppressed with reduced motion; the shared insertion still works.

Run **`node --test tests/*.test.cjs`** for all suites. `tests/i18n-celebrations.test.cjs` covers the real catalogue and a small DOM fixture, language defaults/persistence, live dynamic translation, all six locales, guest-content boundaries, singular/plural templates, exact count reads, inserts, cooldown and failure states. All automated Supabase calls are mocked: tests create no real records. Browser layout, native microphone permissions and device playback still require the manual checks above.

## Production-readiness audit — 2026-10-30

Only small safety fixes were needed: a local SVG favicon, narrow-screen wrapping for translated header text, normal mobile flow for the handwritten hero annotation so it cannot overlap the celebration count, and slightly darker text in three locations to meet contrast requirements. No backend schemas, RLS, features or dependencies were changed.

Validation completed:

- All **90 automated tests** passed: guest photos 12, internationalization/celebrations 11, messages 12, party 17, photo comments 15, voice 23. JavaScript syntax and `git diff --check` passed.
- Chromium exercised the real page and Supabase browser SDK. Live reads of all six tables succeeded with zero rows, displaying honest empty states and retaining all 19 curated memories. Automated browser writes and Storage uploads were intercepted; no real records/files were created.
- Browser checks covered welcome/session behavior, counter insert/read/cooldown, roulette, game answers, named/anonymous messages, per-photo comments/drafts, actual browser image compression, native MediaRecorder with a simulated microphone, local/saved audio playback, upload failure/retry and failed-read/insert recovery. Guest content stayed unchanged during language switching.
- All five languages were checked at **320, 375, 393, 768 and 1280 px**, with no page overflow after the fixes. The open photo modal, upload form, audio preview and current game result retained their state while switching language. Language preference survived reload.
- axe-core WCAG A/AA checks found **zero violations** in the mobile welcome, homepage, photo detail and populated-page snapshots. No uncaught JavaScript errors or normal-load console errors occurred; deliberately simulated failures produced the expected technical diagnostics.
- All 19 curated image URLs responded successfully. Static HTML has 146 unique IDs, valid ARIA/label targets and alt attributes on every image. No `Zone.Identifier` files, private credentials, service-role JWTs, database passwords or PostgreSQL URLs were detected in the current repository files. The publishable key remains intentionally public.

Remaining verification before/after hosting: real iOS Safari and Android Chrome microphone permissions, speaker playback and device layouts; HTTPS on the deployment origin; one intentional end-to-end production submission for each integration if desired. Live INSERT/RLS and Storage write permissions were not exercised by this audit. There were no saved guest images/audio to verify against Storage after the cleanup. Public submissions still rely on the existing RLS/validation and client cooldown; authentication, moderation and server-side rate limiting remain outside this frontend scope. The celebration total refreshes on load/after celebrating, without realtime subscriptions. Existing upload-orphan recovery limitations are documented above.

The browser audit tools were installed only in `/tmp`; the site remains dependency-free vanilla HTML/CSS/JavaScript. Browser evidence supplements the repository tests and does not replace real-device checks.

## Installable album (PWA)

The site can be installed from a supported browser on **HTTPS**, or tested on localhost. Deploy at the origin root: the manifest, start URL, scope and worker registration use `/`. No Netlify configuration is included. Installation does not change Supabase, RLS, schemas or Storage policies.

### Files and app identity

- `manifest.webmanifest`: permanent app ID `/`, **El álbum de Chas**, short name **Chas**, Spanish description/default language, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, paper theme/background `#fff7ec`.
- The photo app icons use the existing hero portrait `assets/images/chas/WhatsApp Image 2026-10-29 at 15.02.07 (2).jpeg` (1536×2048): Chas smiling outdoors in a white shirt and dark jacket. Normal icons crop source coordinates **x=300, y=320, side=1040 px**, keeping her face, hair and upper shoulders. The maskable variant uses a wider **x=110, y=110, side=1360 px** square so her facial features stay within the central safe circle under Android masks. All crops preserve the original proportions and expression without text, overlays or generated content. Exports: `chas-photo-192.png`, `chas-photo-512.png`, `chas-photo-maskable-512.png` and `apple-touch-icon-photo.png` (180×180). The PNGs use lossless RGB compression (about 57–366 KiB each), retaining natural skin tones without palette dithering. The original photograph and existing browser favicon are unchanged; obsolete star-based launcher assets were removed.
- `index.html` links the manifest and Apple icon and sets the Apple app title. The existing viewport/theme metadata remains. Modern iOS uses the manifest's standalone display; obsolete app-capable tags and device-specific splash screens were not added.
- `js/pwa.js` contains registration, optional installation guidance, standalone detection and the offline notice. The translation catalogues keep the `pwa.*` keys complete in ES/EN/FR/DE/PT/zh-CN. `css/style.css` adds only small styles for these optional controls/notices.

### Cache and update policy

`sw.js` uses versioned **`chas-album-shell-v5`** and **`chas-album-images-v5`** caches. Install precaches the HTML, CSS, every local JS file, manifest, launcher icons/favicon, hero portrait and small serious portrait. Successful activation claims clients and deletes only obsolete `chas-album-*` caches, preserving unrelated caches on the origin.

Subsequent allowlisted static requests are **network first** with HTTP revalidation (`cache: 'no-cache'`); a network failure or static-host 5xx can fall back to the saved response. Full/unavailable cache storage does not prevent a successful network response. Curated JPEGs under `/assets/images/chas/` are cached only as requested, bounded to **21 entries** (the current local image collection is about 6 MB). This is not a download of the whole gallery at install time. Photos never opened/cached may be unavailable offline.

**Not cached or intercepted:** Supabase requests of any kind, live records/counts, guest photos, saved voice files, CDN scripts/fonts, unknown same-origin endpoints and every non-GET request. There is no offline write queue, background sync, upload retry queue or automatic replay. An offline visitor can open a previously cached shell and see its local content; shared-data reads and submissions fail honestly through the existing UI. A translated notice follows the browser's connection indicator. A connection indicator is only a hint; existing per-feature errors also handle a reachable network with an unavailable backend. The externally hosted Supabase SDK is not precached; reconnect/reload if it could not load offline. Fonts fall back to the existing local/system stack.

For **each release changing the shell or its cache list, bump `VERSION` in `sw.js`**. Registration uses `updateViaCache: 'none'`. A new worker installs in the background and waits; it does not reload an open page or interrupt a recording/upload/draft. On the next normal page load, `js/pwa.js` asks an already waiting worker to activate. Activation removes obsolete app caches. No controller-change reload is used. Static network-first requests also prevent indefinite stale shell responses while online. If the update finishes installing after that load, it activates on a later load or after old clients close, following the normal lifecycle.

### Installation behavior

Android: **Instalar en Android** appears beneath the hero after the welcome closes. An explicit click opens the native install prompt when `beforeinstallprompt` is available. Until then it explains Chrome's **⋮ → Install app / Add to Home screen** menu; it never claims that an installation took place. On desktop, the install action still appears only when the browser offers a native prompt. Acceptance, `appinstalled` and standalone mode hide the panel. Declining/dismissing suppresses it for the session.

iPhone/iPad: Safari outside standalone mode gets a dismissible **Compartir → Añadir a pantalla de inicio** hint below the hero. Other detected iOS browsers/in-app browsers show an instruction to open the album in Safari first. Desktop-mode iPad is recognized through touch capability. **Ahora no** stores `chas:pwa-install-dismissed:v1` in sessionStorage; restricted storage still permits in-memory dismissal. The site cannot inspect whether an iOS app is installed separately while Safari remains open; guidance is always suppressed when running standalone. The website cannot trigger Safari's Add to Home Screen confirmation automatically.

### Exact manual checks after deployment

**Android / Chrome**

1. Open the deployed **HTTPS root URL** in Chrome, with internet access. Complete the birthday welcome. Look beneath the hero for **Instalar en Android**. Tap it: it opens the native installation when available or explains the Chrome menu. Browser eligibility/timing varies; the Chrome menu's **Install app / Add to Home screen** is also available when supported. A missing native event must show guidance rather than pretend to install.
2. Tap the install action, accept Chrome's prompt, then launch **Chas** from the home screen. Verify the correct photo icon and standalone window without normal browser navigation chrome. The install CTA must be absent. Test a named/anonymous message, photo comment, guest photo, voice message and celebration intentionally if real production writes are desired.
3. Open the site in an ordinary browser tab again. Test declining the install prompt when offered; there should be no repeated prompt in that session. Existing birthday welcome/session behavior must remain independent.

**iPhone / iPad / Safari**

1. Open the deployed HTTPS URL in **Safari**. Finish the welcome, find the subtle guidance beneath the hero and switch languages to check that it translates. **Ahora no** should hide it during the current Safari session.
2. Use Safari's **Share → Add to Home Screen**, confirm **Chas** and add it. If iOS offers an **Open as Web App** option, leave it enabled. Launch the home-screen icon and verify the standalone appearance, correct icon and absence of install guidance.
3. Test portrait/landscape, the bottom navigation, dialogs, microphone permission, recording and saved playback. Repeat on an iPad in desktop browsing mode. Native installation and permissions need a real device; a desktop UA simulation is not a substitute.

**DevTools / offline / updates**

1. In Chrome DevTools → **Application → Manifest**, inspect identity, scope, start URL, display mode, icon previews and maskable safe area. Resolve any installability errors reported by that browser. Under **Application → Service Workers**, verify `/sw.js`, root scope and activated status. Under **Cache Storage**, inspect the two `chas-album-*` caches: there must be no Supabase/CDN URLs or guest records/media.
2. Load once online and wait for the worker to activate (`await navigator.serviceWorker.ready` in the console). Visit a few original photos. In DevTools Network, choose **Offline**, then reload. The basic album/hero and offline notice should appear; only images previously saved by the worker are expected to display. Try submitting a draft: it must remain after the friendly error, without a false success. Restore connectivity and reload; nothing should be submitted automatically.
3. Switch all six languages with the offline notice or install guidance visible. Verify translated labels and unchanged guest content/drafts. For a fresh installation-hint test only, run `sessionStorage.removeItem('chas:pwa-install-dismissed:v1')` and reload. This does not clear the birthday welcome flag.
4. On a staging deployment, change a harmless static asset and bump `VERSION` in `sw.js`. With an old page open, use `await (await navigator.serviceWorker.getRegistration()).update()` or DevTools **Update**. The new worker should wait and the open draft should remain. Reload normally: the waiting worker should activate, current static content should load and old app caches should disappear. Never clear caches/unregister on a visitor's behalf. DevTools **Update on reload** can override normal lifecycle behavior; turn it off when checking the actual update flow.
5. Recheck live Supabase features with Network inspection: reads go to Supabase, deliberate submissions make their ordinary network requests, and none appear in the service worker caches. Manual production submissions are real; automated tests below do not create any.

### Automated verification

Run `node --test tests/*.test.cjs` for the full suite. The **15 new PWA tests** cover manifest/PNG dimensions and references, cache asset completeness, activation cleanup, waiting updates, API/mutation bypass, network-first/offline fallback, cache limits/storage failures, safe registration, Android CTA states, iOS/iPad hints/dismissal, standalone detection, connection feedback and all five translation catalogues. They use mocks and never mutate Supabase.

Chromium checks additionally parsed the manifest, loaded all icons, activated the real worker, reopened the cached shell offline, verified a failed offline submission retains its draft, translated the offline notice, checked no reconnect replay, and simulated a v2 release activating on the next load while preserving the previous page's draft. Android prompt/iOS UA tests exercise the UI, not actual OS installation. No browser tooling or runtime dependencies were added to the repository.

Platform references: [MDN: install prompt event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event), [WebKit: Home Screen web apps and manifest display](https://webkit.org/blog/13878/), [web.dev: worker lifecycle and waiting updates](https://web.dev/articles/service-worker-lifecycle).

Final verification for this PWA change: **105/105 tests passed** (90 existing + 15 PWA), all JavaScript syntax checks and `git diff --check` passed. Chromium completed **8 PWA checks and 13 existing-flow check groups**, with zero uncaught page exceptions, zero overflow cases across the 25 language/viewport combinations, and zero axe violations in the four sampled views. All browser writes were intercepted; no real Supabase mutations occurred.

Photo-icon revision: manifest, Apple metadata and shell-cache references now point to the photo-specific filenames. Only the cache version was bumped to v2; service worker strategy, Supabase, install logic and translations remain unchanged.


## Personal details: Cusco, Machu Picchu and Violetta

The existing celebration ribbon now says **de Cusco para el mundo**, and the third **Muy, muy Chas** note mentions **mi Cusco** alongside her people. Existing Peru references remain. A 100×10 inline SVG divider with five small colored diamonds and a 42×3 corner accent use deeper red, blue, green, purple and marigold as textile-inspired details; no cultural meanings are assigned to their colors or shapes.

An original 94×47 inline SVG mountain/terrace sketch labeled **Machu Picchu** sits inside the third note. It is decorative, secondary and locally authored. The first note adds **Y sí, tengo mi lado Violetta. ♪** as a small personal reference; no promotional imagery, logos, characters, music files or external Violetta assets were added. Both updated phrases and the new captions use the six-language catalogue, preserving proper names.

The service-worker cache version moves from **v2 to v3** because cached HTML/CSS/translations changed. No new cache URLs are required for inline SVGs, and the caching strategy is unchanged. All four photo PWA icons are byte-for-byte unchanged (SHA-256 verified), as are the manifest and Supabase/install logic.

Validation: **105/105 automated tests**, JavaScript syntax and `git diff --check` passed. Chromium checked all five languages at 320, 375, 393, 768 and 1280 px: zero page overflow, matching translated details, zero uncaught exceptions, a valid manifest and an active v3 shell cache. The five mobile about-section axe checks reported zero violations. Browser Supabase calls were mocked; no real mutations were made.

Install-action refinement: the Android action and iOS guidance now sit beneath the hero, respect welcome/dismissal/standalone state, and work in all five interface languages. Cache version is **v4**; caching strategy, photo icons and Supabase are unchanged. Two additional state tests cover Android menu fallback/native transition and iOS browser guidance.

Verification of the install-action refinement: **107/107 tests passed**. Chromium covered Android, Safari iPhone and an iPhone in-app UA across five languages at 320/393 px (30 combinations), checking native-prompt fallback/acceptance, welcome gating, dismissal, translations and no layout overflow or uncaught exceptions. All Supabase writes were blocked.
