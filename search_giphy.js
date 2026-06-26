const https = require('https');

function search(query) {
  const url = `https://api.giphy.com/v1/stickers/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query)}&limit=15`;
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log("Raw response keys:", Object.keys(json));
        if (json.data && json.data.length > 0) {
          console.log(`Results for [${query}]:`);
          json.data.forEach((item, index) => {
            console.log(`[${index}] Title: ${item.title}`);
            console.log(`    ID: ${item.id}`);
            console.log(`    URL: ${item.images.original.url}`);
          });
        } else {
          console.log('No data found. Full JSON response:', JSON.stringify(json, null, 2));
        }
      } catch (err) {
        console.error('Parse error:', err);
      }
    });
  });
}

const args = process.argv.slice(2);
const q = args.length > 0 ? args.join(' ') : 'neon frame';
search(q);
