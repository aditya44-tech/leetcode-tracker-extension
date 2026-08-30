const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'leetcode_company_questions_15companies.csv');
const outPath = path.join(__dirname, 'companyData.json');

const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
const header = lines[0]; // Company,ID,Title,Difficulty,Acceptance,Frequency,LeetCodeLink

const data = {}; // slug -> Set of companies
const companies = new Set();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // CSV is comma-separated. Title may not have commas but let's be safe.
  // Format: Company,ID,Title,Difficulty,Acceptance,Frequency,LeetCodeLink
  const firstComma = line.indexOf(',');
  const rest1 = line.slice(firstComma + 1);
  const secondComma = rest1.indexOf(',');
  const rest2 = rest1.slice(secondComma + 1);
  
  const company = line.slice(0, firstComma).trim();
  const id = rest1.slice(0, secondComma).trim();
  
  // LeetCodeLink is the last field - extract slug from URL
  const url = line.split(',').pop().trim();
  const slug = url.replace('https://leetcode.com/problems/', '').replace(/\/$/, '').trim();

  if (!slug || !company) continue;

  companies.add(company);

  if (!data[slug]) data[slug] = new Set();
  data[slug].add(company);
}

// Convert sets to sorted arrays
const output = {};
for (const [slug, companySet] of Object.entries(data)) {
  output[slug] = [...companySet].sort();
}

fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(`Done! ${Object.keys(output).length} problem slugs`);
console.log(`Companies found: ${[...companies].sort().join(', ')}`);
