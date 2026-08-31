const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'leetcode_questions_grouped_by_company.csv');
const outJsonPath = path.join(__dirname, 'companyData.json');
const outJsPath = path.join(__dirname, 'companyData.js');

// Minimal CSV parser that handles quoted fields
function parseCSVLine(line) {
  const parts = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts;
}

const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/);
const header = parseCSVLine(lines[0]);
// Expected: ID,Title,Difficulty,Acceptance,Companies,CompanyCount,AvgFrequency,LeetCodeLink
console.log('Header fields:', header);

const idxCompanies = header.indexOf('Companies');
const idxURL = header.indexOf('LeetCodeLink');
const idxDifficulty = header.indexOf('Difficulty');
const idxTitle = header.indexOf('Title');
const idxID = header.indexOf('ID');

if (idxCompanies === -1 || idxURL === -1) {
  console.error('ERROR: Could not find Companies or LeetCodeLink columns in header!');
  process.exit(1);
}

const data = {};        // slug -> [companies]
const problemMeta = {}; // slug -> { difficulty, title, id }
const allCompanies = new Set();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const parts = parseCSVLine(line);

  const companiesRaw = parts[idxCompanies] || '';
  const url = parts[idxURL] || '';
  const difficulty = idxDifficulty !== -1 ? parts[idxDifficulty] : '';
  const title = idxTitle !== -1 ? parts[idxTitle] : '';
  const id = idxID !== -1 ? parts[idxID] : '';

  // Extract slug from URL: https://leetcode.com/problems/two-sum -> two-sum
  const slug = url.replace('https://leetcode.com/problems/', '').replace(/\/$/, '').trim();
  if (!slug) continue;

  // Parse companies: "Adobe, Amazon, Apple" -> ["Adobe", "Amazon", "Apple"]
  const companies = companiesRaw
    .split(',')
    .map(c => c.trim())
    .filter(Boolean)
    .sort();

  for (const c of companies) allCompanies.add(c);

  data[slug] = companies;

  if (difficulty || title) {
    problemMeta[slug] = { difficulty, title, id };
  }
}

// Write companyData.json (used by content.js via fetch)
fs.writeFileSync(outJsonPath, JSON.stringify(data, null, 2));
console.log(`companyData.json written: ${Object.keys(data).length} problem slugs`);

// Write companyData.js (used by popup.html as a <script> tag — sets window.COMPANY_DATA)
fs.writeFileSync(outJsPath, 'window.COMPANY_DATA = ' + JSON.stringify(data) + ';');
console.log(`companyData.js written: ${Object.keys(data).length} problem slugs`);

console.log(`Companies found (${allCompanies.size}): ${[...allCompanies].sort().join(', ')}`);
console.log(`Sample entry: two-sum ->`, data['two-sum']);
