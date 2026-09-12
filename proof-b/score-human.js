// Scores reviewer results (human or AI proxy) against human-test-key.txt. Usage: node score-human.js <results.json>
const fs = require("fs"); const R = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).filter(r => r.ok);
const key = Object.fromEntries(fs.readFileSync("human-test-key.txt", "utf8").trim().split("\n").map(l => { const [n, kind, id] = l.split("\t"); return [Number(n), { kind, id }]; }));
const modelIds = Object.keys(key).filter(k => key[k].kind === "model").map(Number), libIds = Object.keys(key).filter(k => key[k].kind === "library").map(Number);
const per = R.map(r => { const rat = r.result.ratings; const m = modelIds.map(i => Number(rat[i])).filter(x => x), l = libIds.map(i => Number(rat[i])).filter(x => x);
  const groups = r.result.groups; const modelGroups = groups.filter(g => g.some(i => modelIds.includes(i))); const mixed = modelGroups.filter(g => g.some(i => libIds.includes(i))).length; const largestModel = Math.max(...groups.map(g => g.filter(i => modelIds.includes(i)).length));
  return { reviewer: r.reviewer, groups: groups.length, modelDesignedRate: m.filter(x => x >= 4).length / m.length, libraryDesignedRate: l.filter(x => x >= 4).length / l.length, modelMean: m.reduce((a, b) => a + b, 0) / m.length, libraryMean: l.reduce((a, b) => a + b, 0) / l.length, modelGroups: modelGroups.length, mixedGroups: mixed, largestModelGroup: largestModel }; });
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = { reviewers: per.length, medianModelDesignedRate: med(per.map(p => p.modelDesignedRate)), medianLibraryDesignedRate: med(per.map(p => p.libraryDesignedRate)), medianGroups: med(per.map(p => p.groups)), medianMixedGroups: med(per.map(p => p.mixedGroups)), maxModelGroup: Math.max(...per.map(p => p.largestModelGroup)), pass: med(per.map(p => p.modelDesignedRate)) >= .7 && Math.max(...per.map(p => p.largestModelGroup)) <= 3 };
console.log(JSON.stringify({ per, summary }, null, 1));
