const path = require('path');
const jimp = require('jimp');

const badgeDir = 'g:\\Projects\\BuzzIt\\buzzit\\assets\\badges';
const files = [
  'badge_first_blood.png',
  'badge_speedster.png',
  'badge_survivor.png',
  'badge_mastermind.png'
];

async function checkCornerPixels() {
  const JimpClass = jimp.Jimp || jimp;
  for (const file of files) {
    const filePath = path.join(badgeDir, file);
    try {
      const image = await JimpClass.read(filePath);
      // Sample the pixel at (0, 0)
      const idx = 0;
      const r = image.bitmap.data[idx + 0];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      const a = image.bitmap.data[idx + 3];
      console.log(`${file} (0,0) pixel: R=${r}, G=${g}, B=${b}, A=${a}`);
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }
}

checkCornerPixels();
