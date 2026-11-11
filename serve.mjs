// run it: node serve.mjs, then open http://localhost:8765 to play the 16-bit Sky Hop
// a browser won't load the game's modules straight from a file, so this hands out the folder's own files, and only to this computer
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const PORT = Number(process.env.PORT) || 8765;
const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };

createServer(async (req, res) => {
    try {
        const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        const name = path === "/" ? "index.html" : path.slice(1);
        // a plain file name in this folder, nothing above it or beside it
        const type = /^[\w.-]+$/.test(name) && TYPES[extname(name)];
        if (!type) throw new Error("not a game file");
        const body = await readFile(new URL(name, import.meta.url));
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
        res.end(body);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
    }
})
    .on("error", (err) => {
        console.error(err.code === "EADDRINUSE" ? `Port ${PORT} is taken. If Sky Hop is already running, just open http://localhost:${PORT}; otherwise set PORT to another number and run it again.` : err.message);
        process.exit(1);
    })
    .listen(PORT, "127.0.0.1", () => console.log(`Sky Hop is at http://localhost:${PORT}`));
