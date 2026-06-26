const https = require('https');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function start() {
  try {
    console.log('Fetching Giphy search page...');
    const html = await fetchPage('https://giphy.com/stickers/fire-circle');
    console.log('Page length:', html.length);
    
    // Find all media URLs or sticker IDs in the page
    // Giphy uses structured JSON data or links like giphy.com/stickers/name-id or media.giphy.com/media/id/giphy.gif
    const idRegex = /giphy\.com\/stickers\/[a-zA-Z0-9-]*?([a-zA-Z0-9]{10,25})/g;
    const ids = [];
    let match;
    while ((match = idRegex.exec(html)) !== null) {
      ids.push(match[1]);
    }
    
    console.log('Found IDs:', [...new Set(ids)]);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

start();
