const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'leetcode_company_questions_15companies.csv');
const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);

// Format: Company,ID,Title,Difficulty,Acceptance,Frequency,LeetCodeLink
// We only need slug -> difficulty (one entry per slug is enough)
const meta = {}; // slug -> { difficulty, title }

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const parts = line.split(',');
  // parts: [Company, ID, Title, Difficulty, Acceptance, Frequency, LeetCodeLink]
  // But Title can't have commas in this dataset (LeetCode titles don't have commas)
  if (parts.length < 7) continue;

  const difficulty = parts[3].trim(); // Easy/Medium/Hard
  const url = parts[parts.length - 1].trim(); // last field
  const slug = url.replace('https://leetcode.com/problems/', '').replace(/\/$/, '');

  if (!slug || !difficulty) continue;
  if (meta[slug]) continue; // already have it

  meta[slug] = difficulty;
}

fs.writeFileSync(
  path.join(__dirname, 'problemMeta.json'),
  JSON.stringify(meta, null, 2)
);

console.log(`Done! ${Object.keys(meta).length} slugs with difficulty`);

// Spot check
const sample = Object.entries(meta).slice(0, 5);
sample.forEach(([slug, diff]) => console.log(slug, '->', diff));
