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
node --check js/app.js
node --check js/messages.js
node --check js/supabase-client.js
git diff --check
```

The automated tests cover message validation, named/anonymous payloads, submission locking, form reset, list refresh and pagination, network/read/insert failures, timeout handling, stale read protection and rendering user text safely. They use a small DOM fixture rather than a browser layout engine.

Photo uploads, photo comments, audio and other contribution flows remain frontend previews. No Netlify configuration is included.
