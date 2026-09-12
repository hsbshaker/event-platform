// Human design-quality test sheets: 20 model heroes + 20 library heroes, shuffled, unlabeled, grayscale, both widths. Key in human-test-key.txt (do not show reviewers).
const fs = require("fs"); const { PNG } = (() => { try { return require("pngjs"); } catch (e) { return {}; } })();
const run = process.argv[2] || "zero"; const R = JSON.parse(fs.readFileSync(`model/${run}/results-verified.json`, "utf8")).filter(r => !r.fallback);
const L = require("./library.js"); const rnd = (() => { let a = 20260915; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
const model = [...R].sort(() => rnd() - .5).slice(0, 20).map(r => ({ kind: "model", id: r.id, f1280: `shots/${run}/${r.id}-1280-gray.png`, f390: `shots/${run}/${r.id}-390-gray.png` }));
const lib = [...L.heroKeys].sort(() => rnd() - .5).slice(0, 20).map(k => ({ kind: "library", id: k, f1280: `shots/heroes/${k}-1280.png`, f390: `shots/heroes/${k}-390.png` }));
const items = [...model, ...lib].sort(() => rnd() - .5);
fs.writeFileSync("human-test-key.txt", items.map((x, i) => `${String(i + 1).padStart(2, "0")}\t${x.kind}\t${x.id}`).join("\n") + "\n");
fs.writeFileSync("human-test-items.json", JSON.stringify(items));
console.log("items", items.length, "model", model.length, "library", lib.length);
