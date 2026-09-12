// Compile, verify and render every adversarial fixture (repair → geometry verification → screenshot); report overflow.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const A = require("./fixtures/adversarial.js"), { compile, FULL_CAPS } = require("./compile.js"), { verify } = require("./verify.js");
global.window = global; require("../proof-a1/sites.js"); const { VOCAB } = require("../proof-a1/vocab.js");
const CH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", H = path.resolve("harness.html");
fs.mkdirSync("specs/adv", { recursive: true }); fs.mkdirSync("shots/adv", { recursive: true });
const di = { family: "editorial", tonalDirection: "light", typography: "heritage_caslon_karla", typographyCategory: "heritage", typographyObject: VOCAB.typography.heritage_caslon_karla, density: "balanced", composition: { asymmetry: "gentle", hierarchy: "editorial", rhythm: "continuous", sectionContrast: "low", ornament: "restrained" } };
const ps = { border: "hairline", card: "outlined", button: "solid_square", borderWeight: 1, displayTracking: 0 };
const rows = []; const specs = [];
A.structural.forEach((f, i) => {
  const id = String(i + 1).padStart(2, "0"); const c = compile({ raw: f.tree, caps: f.caps || FULL_CAPS, designIntent: di, pageSystem: ps, seed: i + 1, id, source: "adversarial" });
  const specPath = path.resolve(`specs/adv/${id}.js`); const spec = verify(c.spec, specPath);
  execFileSync(CH, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1400,4600", `--screenshot=shots/adv/${id}-1280-gray.png`, `file://${H}?spec=${specPath}&w=1280&vh=800&gray=1`], { stdio: "ignore" });
  execFileSync(CH, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=600,6400", `--screenshot=shots/adv/${id}-390-gray.png`, `file://${H}?spec=${specPath}&w=390&vh=844&gray=1`], { stdio: "ignore" });
  const v = spec.verified; const row = { id, name: f.name, repairValid: c.repairValid, violations: c.violationsBefore, repairs: spec.repairSummary, overflowDesktop: v.desktop.pageOverflow || v.desktop.overflowingElements > 0 || v.desktop.textOverflow > 0, overflowMobile: v.mobile.pageOverflow || v.mobile.overflowingElements > 0 || v.mobile.textOverflow > 0, fitDemotions: v.fitDemotions };
  rows.push(row); specs.push({ title: `${id} · ${f.name}`, spec }); console.log(JSON.stringify(row));
});
fs.writeFileSync("specs/adv/set.js", "window.SPECS = " + JSON.stringify(specs) + ";\n");
fs.writeFileSync("fixtures/adversarial-render.json", JSON.stringify(rows, null, 1));
console.log("repairValid:", rows.filter(r => r.repairValid).length, "/", rows.length, " overflow desktop:", rows.filter(r => r.overflowDesktop).length, " mobile:", rows.filter(r => r.overflowMobile).length);
