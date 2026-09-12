// Design-quality review protocol. Reviewer instances receive the unlabeled sheet and return groups and ratings as JSON.
// `--reviewers N --kind ai` runs N independent model reviewers (an AI proxy; NOT the human test). Human reviewers use the same sheet and the same form (human-test-form.md).
// Usage: node judge.js <sheet.png> <itemsCount> [--reviewers 5] [--model claude-sonnet-5] [--out file.json]
const { execFile } = require("child_process"), fs = require("fs"), path = require("path");
const [sheet, countArg] = process.argv.slice(2); const N = Number(countArg || 40);
const REV = process.argv.includes("--reviewers") ? Number(process.argv[process.argv.indexOf("--reviewers") + 1]) : 5;
const MODEL = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "claude-sonnet-5";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "judge-results.json";
const FORM = `You are reviewing ${N} first screens of event websites, shown as a numbered grid in the image at ${path.resolve(sheet)}. Read the image first.
Task 1 (template grouping): group any screens that feel like the same underlying template or layout skeleton (ignore color; the image is grayscale on purpose; ignore type choice unless it is the only difference). Screens with a unique layout form their own group of one.
Task 2 (design quality): rate each screen from 1 to 5, where 5 means "a designer clearly composed this" and 1 means "this looks like an accident or a broken layout". Consider hierarchy, balance, whitespace, legibility, and whether the first screen has one clear dominant object.
Return JSON only: {"groups": [[1,7],[2],[3,9,14],...], "ratings": {"1": 4, "2": 3, ...}, "notes": "one sentence"}. Every number from 1 to ${N} must appear exactly once in groups and once in ratings.`;
function ask(i) { return new Promise(res => execFile("claude", ["-p", FORM, "--model", MODEL, "--output-format", "json", "--no-session-persistence", "--tools", "Read", "--allowedTools", "Read", "--max-turns", "3"], { maxBuffer: 32 * 1024 * 1024, timeout: 300000 }, (err, stdout) => { let text = ""; try { text = JSON.parse(stdout).result || ""; } catch (e) { text = stdout; } fs.writeFileSync(OUT.replace(/\.json$/, "") + `-reviewer${i + 1}.txt`, text); const s = text.indexOf("{"), e = text.lastIndexOf("}"); let j = null; try { j = JSON.parse(text.slice(s, e + 1)); } catch (x) {} res({ reviewer: i + 1, ok: !!j, result: j, error: err ? String(err).slice(0, 120) : null }); })); }
(async () => {
  const results = []; for (let i = 0; i < REV; i++) results.push(await ask(i));   // sequential: independent contexts, no shared state
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); console.log(results.map(r => `${r.reviewer}: ${r.ok ? `${r.result.groups.length} groups, mean rating ${(Object.values(r.result.ratings).reduce((a, b) => a + Number(b), 0) / Object.keys(r.result.ratings).length).toFixed(2)}` : "invalid " + (r.error || "")}`).join("\n"));
})();
