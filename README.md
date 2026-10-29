# Cumple Chas

Personal memory album built with HTML, CSS and vanilla JavaScript.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/#para-chas. Internet access is required for the Supabase browser client and the shared message database. The gallery uses local image files.

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
node --check js/app.js
node --check js/photos.js
node --check js/photo-comments.js
node --check js/messages.js
node --check js/supabase-client.js
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

Photo uploads, audio and other contribution flows remain frontend previews. No Netlify configuration is included.
