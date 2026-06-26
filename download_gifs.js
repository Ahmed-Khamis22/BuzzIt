const fs = require('fs');
const path = require('path');
const https = require('https');

const GIFS = {
  border_fire: '3o72EX5Qz9tSDWZOfK',
  border_neon: '3o7qE1YN7aBOFPRw8E',
  border_diamond: 'l2QDQW4MrxOKL2OaA',
  border_matrix: '3o7qE589u8L4S75h1e',
  border_gold_rush: '3o7qE4xN6kYxZfGpxq',
  border_ocean: 'l0HlIDU1B7D14mS40',
};

const outputDir = path.join(__dirname, '../buzzit/assets/store');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function downloadFromUrl(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadFromUrl(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Status ${res.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
    }).on('error', reject);
  });
}

async function downloadGif(id, dest) {
  const urls = [
    `https://i.giphy.com/${id}.gif`,
    `https://media.giphy.com/media/${id}/giphy.gif`,
    `https://media0.giphy.com/media/${id}/giphy.gif`,
    `https://media1.giphy.com/media/${id}/giphy.gif`,
    `https://media2.giphy.com/media/${id}/giphy.gif`,
    `https://media3.giphy.com/media/${id}/giphy.gif`,
    `https://i.giphy.com/media/${id}/giphy.gif`
  ];

  for (const url of urls) {
    try {
      await downloadFromUrl(url, dest);
      return url; // success!
    } catch (err) {
      // try next url
    }
  }
  throw new Error(`Failed to download from all GIPHY endpoints`);
}

async function start() {
  console.log('Downloading transparent animated GIF assets for borders...');
  for (const [name, id] of Object.entries(GIFS)) {
    const dest = path.join(outputDir, `${name}.gif`);
    console.log(`Downloading ${name} (ID: ${id}) -> ${dest}`);
    try {
      const successfulUrl = await downloadGif(id, dest);
      console.log(`Successfully downloaded ${name}.gif from ${successfulUrl}`);
    } catch (err) {
      console.error(`Error downloading ${name}:`, err.message);
    }
  }
  console.log('All downloads completed!');
}

start();
