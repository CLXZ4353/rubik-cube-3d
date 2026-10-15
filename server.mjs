// Tiny static file server (no dependencies).
//   node server.mjs            -> http://localhost:8000
//   PORT=3000 node server.mjs  -> http://localhost:3000

import { createServer } from 'node:http';
import { createReadStream, openSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.map': 'application/json; charset=utf-8',
  '.pdb': 'application/octet-stream',
};

// The worker asks for /data/<name>.pdb?v=<tablesVersion>, so the URL itself
// changes when the tables change -> the bytes can be cached forever. Everything
// else (index.html, pdb_meta.json, ...) must stay revalidatable.
const isImmutable = (pathname, ext) => pathname.startsWith('/data/') && ext === '.pdb';

// "bytes=START-END", "bytes=START-" or "bytes=-LAST"; null -> serve whole file,
// false -> unsatisfiable. Multi-range requests are rare here: we answer the
// single-range form only, so a multi-range line serves the whole file.
function parseRange(header, size) {
  const m = header && /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m) return null;
  if (m[1] === '') {
    if (m[2] === '') return null; // "bytes=-" is the whole file
    const length = Math.min(Number(m[2]), size);
    return length > 0 ? { start: size - length, length } : false;
  }
  const start = Number(m[1]);
  if (start >= size) return false;
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  return end >= start ? { start, length: end - start + 1 } : false;
}

// Error pages never inherit the file's MIME type (a 404 for a .pdb used to be
// octet-stream) and always carry the isolation headers, so COOP/COEP do not
// disappear on the error path.
const SECURITY = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
function sendError(res, code, msg, extra = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache', ...SECURITY, ...extra });
  res.end(msg);
}

// decodeURIComponent throws URIError on malformed escapes ('/%zz'), and new URL
// throws on a bad URL; both used to crash the async handler -> unhandled
// rejection -> Node exits. null means "bad request".
function parsePath(url) {
  try {
    return decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
 try {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  const parsed = parsePath(req.url);
  if (parsed === null) { sendError(res, 400, 'Bad request'); return; }
  let pathname = parsed;
  if (pathname === '/') pathname = '/index.html';
  const file = normalize(join(root, pathname));
  const rel = relative(root, file);
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  const ext = extname(file).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': isImmutable(pathname, ext) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Accept-Ranges': 'bytes',
    ...SECURITY,
  };

  let st;
  try {
    st = await stat(file);
  } catch {
    sendError(res, 404, 'Not found');
    return;
  }
  if (st.isDirectory()) {
    sendError(res, 404, 'Not found');
    return;
  }

  // Stream, never buffer: data/jointCE.pdb is 111 MB and two page loads at once
  // would otherwise put >200 MB of garbage in the heap.
  const range = parseRange(req.headers.range, st.size);
  if (range === false) {
    // No body: an advertised Content-Length would make the client wait for bytes
    // that are never sent, and the range spec says a bodiless 416 SHOULD say which
    // ranges it can serve (the */size form curl/aria2/ffmpeg log).
    sendError(res, 416, '', {
      'Content-Length': '0',
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes */${st.size}`,
    });
    return;
  }
  if (range) {
    // Content-Range requires 206: a 200 would let a proxy cache this 100-byte
    // slice as the whole 111 MB table.
    headers['Content-Range'] = `bytes ${range.start}-${range.start + range.length - 1}/${st.size}`;
    headers['Content-Length'] = String(range.length);
  } else {
    headers['Content-Length'] = String(st.size);
  }
  if (req.method === 'HEAD') {
    // HEAD answers the headers only. It must not open the file either: HEAD is
    // what every CDN/updater probe sends, and an fd left open per probe leaks
    // handles until the process dies with EMFILE.
    res.writeHead(range ? 206 : 200, headers);
    res.end();
    return;
  }

  // Open after the branches that send no body, but before the status line, so an
  // open failure (file swapped between stat and open, EACCES) is still a real 500
  // with headers.
  let fd;
  try {
    fd = openSync(file);
  } catch (err) {
    sendError(res, 500, `Cannot open ${file}: ${err.code}`);
    return;
  }

  res.writeHead(range ? 206 : 200, headers);
  const opts = range ? { fd, start: range.start, end: range.start + range.length - 1 } : { fd };
  const stream = createReadStream(file, opts);
  stream.on('error', (err) => {
    // The read can still fail after open (EACCES, disk): end the response so the
    // client sees the Content-Length mismatch instead of the process dying.
    console.error(`read error ${pathname}`, err?.message);
    try { res.end(); } catch { }
  });
  stream.pipe(res);
 } catch (err) {
  // An uncaught throw in an async handler is an unhandled rejection: Node prints
  // FATAL and exits, so one malformed request would take the server down.
  console.error('handler threw', err?.message);
  try {
    if (!res.headersSent) sendError(res, 500, 'Internal');
    else res.end();
  } catch { }
 }
});

server.listen(port, () => {
  console.log(`\n  Rubik's Cube 3D  ->  http://localhost:${port}\n`);
});
