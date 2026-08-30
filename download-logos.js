const fs = require('fs');
const https = require('https');
const path = require('path');

// Map: filename -> jsdelivr slug
const needed = {
  'amazon.svg':   'amazondotcom',
  'adobe.svg':    'adobe',
  'linkedin.svg': 'linkedin',
  'microsoft.svg': 'windowsxp', // fallback
  'oracle.svg':   'oracle',
  'x.svg':        'x',
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if ([301,302,307,308].includes(response.statusCode)) {
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error('Status ' + response.statusCode + ' for ' + url));
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

const BASE = 'https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/';
const FALLBACK_BASE = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/';

async function run() {
  const tryList = [
    ['amazon.svg',    ['amazondotcom', 'amazon']],
    ['adobe.svg',     ['adobe']],
    ['linkedin.svg',  ['linkedin']],
    ['microsoft.svg', ['microsoftwindows', 'windows']],
    ['oracle.svg',    ['oracle']],
    ['x.svg',         ['x', 'twitter']],
    ['salesforce.svg',['salesforce']],
    ['walmart.svg',   ['walmart']],
  ];

  for (const [filename, slugs] of tryList) {
    const dest = path.join(__dirname, 'logos', filename);
    let ok = false;
    for (const slug of slugs) {
      const url = BASE + slug + '.svg';
      try {
        await download(url, dest);
        console.log('Downloaded ' + filename + ' (slug: ' + slug + ')');
        ok = true;
        break;
      } catch (e) {
        // try next slug
      }
    }
    if (!ok) {
      console.error('FAILED to download ' + filename);
    }
  }
}

run();
