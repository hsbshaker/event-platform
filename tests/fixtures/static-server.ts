import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

/**
 * A tiny local static server for the layout fixtures: the card's stylesheet and fonts exactly as
 * the app serves them (`/fonts/card/*` from `public/fonts/card`, `card-fonts.css` with its
 * root-relative `url()`s untouched), plus in-memory pages and artwork. Served over HTTP rather than
 * `file://` so fonts load as they do for guests.
 */

export const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const FONT_DIR = path.join(REPO_ROOT, "public/fonts/card");
const CARD_FONTS_CSS = path.join(REPO_ROOT, "src/styles/card-fonts.css");

export interface StaticServer {
  origin: string;
  /** Serve `body` at `pathname` (e.g. `/page/x.html`). */
  put(pathname: string, body: string, type: string): void;
  close(): Promise<void>;
}

export async function startStaticServer(): Promise<StaticServer> {
  const files = new Map<string, { body: string; type: string }>();
  const server: Server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url ?? "/", "http://fixture").pathname;
      try {
        const memory = files.get(pathname);
        if (memory) {
          res.writeHead(200, { "content-type": memory.type, "cache-control": "no-store" });
          res.end(memory.body);
          return;
        }
        if (pathname === "/card-fonts.css") {
          res.writeHead(200, { "content-type": "text/css; charset=utf-8" });
          res.end(await readFile(CARD_FONTS_CSS));
          return;
        }
        const font = /^\/fonts\/card\/([A-Za-z0-9]+-normal-\d+\.woff2)$/.exec(pathname);
        if (font) {
          res.writeHead(200, { "content-type": "font/woff2" });
          res.end(await readFile(path.join(FONT_DIR, font[1])));
          return;
        }
        res.writeHead(404).end();
      } catch {
        res.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    put: (pathname, body, type) => files.set(pathname, { body, type }),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
