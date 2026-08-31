const https = require('https');

const username = 'test'; // Any user

const postData = JSON.stringify({
  query: `
    query recentSubmissions($username: String!, $limit: Int!) {
      recentSubmissionList(username: $username, limit: $limit) {
        id
        titleSlug
        timestamp
        statusDisplay
      }
    }
  `,
  variables: { username: "a", limit: 20 }
});

const options = {
  hostname: 'leetcode.com',
  port: 443,
  path: '/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': postData.length
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", data.substring(0, 300));
  });
});

req.on('error', (e) => {
  console.error(e);
});

req.write(postData);
req.end();
