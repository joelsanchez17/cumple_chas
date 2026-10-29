'use strict';

(() => {
  // Public browser configuration. RLS controls all database access.
  // Never put database passwords, service-role or secret keys here.
  const SUPABASE_CONFIG = Object.freeze({
    url: 'https://iscxoxbxcticmnoiygus.supabase.co',
    publishableKey: 'sb_publishable_Sx9GMP0G7j74mWd2kNhxhA_fdULbTSS',
  });
  const PAGE_SIZE = 50;
  const REQUEST_TIMEOUT_MS = 15000;
  let client;

  function getClient() {
    if (!client) {
      if (!window.supabase?.createClient) throw new Error('Supabase browser client unavailable');
      client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey, {
        db: { schema: 'public' },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    }
    return client;
  }

  async function request(buildQuery) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const { data, error } = await buildQuery(getClient()).abortSignal(controller.signal);
      if (error) throw error;
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.chasMessagesApi = Object.freeze({
    pageSize: PAGE_SIZE,
    // IDs are used only for stable ordering; they are never rendered.
    read(offset = 0) {
      return request((db) => db.from('messages')
        .select('name,content,is_anonymous,created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1));
    },
    create({ name, content, is_anonymous }) {
      // Separate INSERT from the subsequent read, so a refresh failure cannot
      // turn a confirmed write into an apparent send failure (and duplicate).
      return request((db) => db.from('messages').insert({ name, content, is_anonymous }));
    },
  });
  // Photo comments share the exact same client, public key and timeout handling.
  window.chasPhotoCommentsApi = Object.freeze({
    pageSize: PAGE_SIZE,
    read(photoId, offset = 0) {
      return request((db) => db.from('photo_comments')
        .select('photo_id,name,content,is_anonymous,created_at')
        .eq('photo_id', photoId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1));
    },
    create({ photo_id, name, content, is_anonymous }) {
      return request((db) => db.from('photo_comments').insert({ photo_id, name, content, is_anonymous }));
    },
  });
  const PHOTO_BUCKET = 'guest-photos';
  window.chasGuestPhotosApi = Object.freeze({
    read() {
      return request((db) => db.from('photos')
        .select('id,storage_path,uploader_name,caption,is_anonymous,created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }));
    },
    publicUrl(storagePath) {
      return getClient().storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
    },
    async upload(storagePath, blob) {
      const { data, error } = await getClient().storage.from(PHOTO_BUCKET).upload(storagePath, blob, {
        contentType: blob.type,
        cacheControl: '3600',
        upsert: false,
      });
      if (error) throw error;
      return data;
    },
    create(payload) {
      return request((db) => db.from('photos').insert(payload)
        .select('id,storage_path,uploader_name,caption,is_anonymous,created_at')
        .single());
    },
  });
})();
