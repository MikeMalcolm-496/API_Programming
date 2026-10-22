// Found-item photos, stored in the Supabase Storage bucket "found-items".
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('../db');
const { staffOnly } = require('../middleware/auth');
const { UUID_RE, fail, serverError } = require('../lib/shared');

const router = express.Router();
const BUCKET = 'found-items';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed.')),
});
const handleUpload = (req, res, next) =>
  upload.array('files', 5)(req, res, (e) => (e ? fail(res, 400, 'invalid_request', e.message) : next()));

// Created lazily so the API (and its tests) still start when Supabase is not configured.
let client;
function storage() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set');
    }
    client = require('@supabase/supabase-js').createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return client.storage.from(BUCKET);
}

const IMAGE_COLUMNS = `id AS "imageId", found_item_id AS "itemId", url, is_primary AS "isPrimary", uploaded_at AS "uploadedAt"`;

// POST /found-items/:itemId/images   multipart field name: "files" (up to 5)
router.post('/found-items/:itemId/images', staffOnly, handleUpload, async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!UUID_RE.test(itemId)) return fail(res, 404, 'not_found', `No found item exists with ID ${itemId}.`);
    if (!req.files || req.files.length === 0) return fail(res, 400, 'invalid_request', 'Attach at least one image in the "files" field.');
    const exists = await db.query('SELECT 1 FROM found_items WHERE id = $1', [itemId]);
    if (exists.rowCount === 0) return fail(res, 404, 'not_found', `No found item exists with ID ${itemId}.`);

    const saved = [];
    for (const f of req.files) {
      const key = `${itemId}/${crypto.randomUUID()}.${EXT[f.mimetype]}`;
      const up = await storage().upload(key, f.buffer, { contentType: f.mimetype });
      if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`);
      const url = storage().getPublicUrl(key).data.publicUrl;
      const { rows } = await db.query(
        `INSERT INTO found_item_images (found_item_id, storage_key, url) VALUES ($1, $2, $3) RETURNING ${IMAGE_COLUMNS}`,
        [itemId, key, url]);
      saved.push(rows[0]);
    }
    return res.status(201).json(saved);
  } catch (err) {
    return serverError(res, err);
  }
});

// GET /found-items/:itemId/images   (public, like the item details page)
router.get('/found-items/:itemId/images', async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!UUID_RE.test(itemId)) return fail(res, 404, 'not_found', `No found item exists with ID ${itemId}.`);
    const { rows } = await db.query(
      `SELECT ${IMAGE_COLUMNS} FROM found_item_images WHERE found_item_id = $1 ORDER BY uploaded_at ASC`, [itemId]);
    return res.json(rows);
  } catch (err) {
    return serverError(res, err);
  }
});

module.exports = router;
