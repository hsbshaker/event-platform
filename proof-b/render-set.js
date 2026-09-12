// Verify (DOM geometry, both breakpoints) and render every tree of a model run; write results-verified.json, specs/<run>/*.js, shots/<run>/*.png, sheets.
// Usage: node render-set.js <runName>   (reads model/<runName>/results.json)
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { verify } = require("./verify.js");
const run = process.argv[2]; const dir = path.join("model", run); const results = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
const CH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", H = path.resolve("harness.html");
fs.mkdirSync(path.join("specs", run), { recursive: true }); fs.mkdirSync(path.join("shots", run), { recursive: true });
const specs = [];
for (const r of results) {
  const specPath = path.resolve("specs", run, `${r.id}.js`);
  const spec = verify(r.spec, specPath); r.spec = spec; r.verified = spec.verified;
  for (const [w, vh, win, suf] of [[1280, 800, "1400,4600", "1280-gray"], [390, 844, "600,6400", "390-gray"], [390, 844, "600,6400", "390-color"]]) {
    execFileSync(CH, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--window-size=${win}`, `--screenshot=shots/${run}/${r.id}-${suf}.png`, `file://${H}?spec=${specPath}&w=${w}&vh=${vh}${suf.endsWith("gray") ? "&gray=1" : ""}`], { stdio: "ignore" });
  }
  specs.push({ title: `${r.id} · ${r.designIntent.family} · ${r.designIntent.tonalDirection}${r.fallback ? " · FALLBACK" : ""}${r.selectorFallback ? " · collision kept" : ""}`, spec });
  console.log(r.id, JSON.stringify(spec.verified));
}
fs.writeFileSync(path.join("specs", run, "set.js"), "window.SPECS = " + JSON.stringify(specs) + ";\n");
fs.writeFileSync(path.join(dir, "results-verified.json"), JSON.stringify(results, null, 1));
console.log("done", run, results.length);
