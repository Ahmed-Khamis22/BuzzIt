const https = require('https');

const url = 'https://api.giphy.com/v1/stickers/search?api_key=dc6zaTOxFJmzC&q=fire+circle&limit=5';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('SUCCESS! Found GIPHY search results:');
      if (json.data && json.data.length > 0) {
        json.data.forEach((item, index) => {
          console.log(`[${index}] ID: ${item.id}, Title: ${item.title}`);
          console.log(`    URL: ${item.images.original.url}`);
        });
      } else {
        console.log('No stickers found in search.');
      }
    } catch (err) {
      console.error('Failed to parse JSON:', err.message);
      console.log('Data was:', data);
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err.message);
});
