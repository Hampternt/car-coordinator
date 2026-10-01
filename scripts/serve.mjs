// Static server for docs/, shared by the tests and the screenshot run.
// A real origin (not file://) is needed: the File System Access and clipboard
// APIs, and the share-link path, all behave differently otherwise.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../docs/', import.meta.url));
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  // Breadify self-hosts its faces; a wrong type here makes a browser refuse
  // them and quietly resize the whole printed page.
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

// `root` serves another checkout's docs/ instead: the upgrade check serves an
// old build and this one on the same port, one after the other.
export async function startServer(port = 0, root = ROOT) {
  const server = createServer(async (req, res) => {
    try {
      // decodeURIComponent throws on a malformed escape like '/%'. Inside the
      // try that is a 404; outside it, it rejects with nobody listening and
      // Node tears the whole test run down.
      const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(port, r));
  return {
    base: `http://localhost:${server.address().port}/`,
    // Resolves once the port is free again, for a server started after it.
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections(); }),
  };
}

// `node scripts/serve.mjs [port]` runs it as a plain dev server for docs/.
// The test and screenshot runs import startServer() instead and keep port 0,
// so several of them can run at once without fighting over a port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { base } = await startServer(Number(process.argv[2]) || 5173);
  console.log(`Serving docs/ at ${base}`);
}
