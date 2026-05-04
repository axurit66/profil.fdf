/**
 * Point d'entrée pour hébergeurs (ex. Plesk) qui exigent un fichier de démarrage
 * `server.js` au lieu de `next start` seul.
 * Exécuter `npm run build` avant de démarrer en production.
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";

const app = next({ dev, dir: __dirname, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    return handle(req, res, parsedUrl);
  }).listen(port, hostname, (err) => {
    if (err) {
      throw err;
    }
    console.log(`> Prêt sur http://${hostname}:${port} (mode ${dev ? "dev" : "production"})`);
  });
});
