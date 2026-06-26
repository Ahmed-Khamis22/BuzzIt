const path = require('path');
const jimp = require('jimp');

const badgeDir = 'g:\\Projects\\BuzzIt\\buzzit\\assets\\badges';
const file = 'badge_survivor.png';

async function checkSurvivor() {
  const JimpClass = jimp.Jimp || jimp;
  const image = await JimpClass.read(path.join(badgeDir, file));
  console.log(`Width: ${image.bitmap.width}, Height: ${image.bitmap.height}`);
  
  // Sample pixels at corners and edges
  console.log('Corner (0,0):', image.bitmap.data.slice(0, 4));
  console.log('Center:', image.bitmap.data.slice(image.bitmap.width * image.bitmap.height * 2 - 2, image.bitmap.width * image.bitmap.height * 2 + 2));
}

checkSurvivor();
