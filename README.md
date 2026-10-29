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

Rows are loaded newest first and their public Storage URLs are rendered after the 19 unchanged original memories. A guest row with UUID `<uuid>` gets application/comment ID `guest-<uuid>`. That stable value is passed unchanged to the existing `photo_comments.photo_id` reads and writes, so guest photos use the same modal, named/anonymous comments, drafts, pagination and failure handling as original photos.

Batch progress is item-based (preparing, uploading, registering, finished), because the Supabase browser upload API does not expose byte progress. When only part of a batch succeeds, successful items are locked and skipped on retry; connection/upload failures remain with their preview and caption. A post-upload metadata failure is not automatically retried because doing so would create another Storage object.

Manual upload test:

1. Start the local server, open the site on a phone-sized viewport, tap **Sumar**, and choose one supported photo. Confirm its preview, add context, enter a name, and submit. Watch the explicit preparation, numbered upload and album-registration stages.
2. Confirm the large **¡Listo!** state appears. Test **Subir más fotos**, then upload again and use **Ver en el álbum**; the sheet should close, the album should scroll into view and the new memory should be briefly highlighted. Open it and verify its caption, uploader, previous/next navigation, and named then anonymous comments. Reload and confirm both photo and comments persist.
3. Repeat with **Sin nombre** and verify the album shows **Anónimo**, not the previously typed name.
4. Select five photos and remove one before submitting. Then try selecting six at once, or four followed by two more; the selection must be rejected with the five-photo explanation.
5. Try a non-image or unsupported HEIC/GIF file. It must not upload and the UI must explain the accepted formats.
6. In developer tools, inspect a compressed upload: its longest dimension is at most 1920 px, normally uses WebP, is much smaller than the original, and the Storage request does not overwrite. Inspect the following `photos` insert payload and returned UUID.
7. Simulate partial failure by taking the browser offline during a multi-photo batch. Restore connectivity and retry: completed items must not upload again, while retryable items remain available.
8. Block only the `photos` insert after allowing Storage. Confirm the friendly warning, the technical console entry with `storagePath`, and that the browser makes no DELETE request. Clean that orphan later with administrative credentials if needed.
9. Block the guest-photo SELECT and reload. The 19 originals must remain usable with an honest guest-photo error state.

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
node tests/guest-photos.test.cjs
node --check js/app.js
node --check js/photos.js
node --check js/photo-upload.js
node --check js/guest-photos.js
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

Audio and other contribution types are not implemented. No Netlify configuration is included.
