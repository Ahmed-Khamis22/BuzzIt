const { Jimp } = require('jimp');

async function removeBackground() {
  const inputPath = 'C:\\Users\\ahmed\\.gemini\\antigravity-ide\\brain\\7ca59509-3b82-4a5f-b1c3-add4f399c975\\red_buzzer_icon_1782064900938.png';
  const outputPath = 'G:\\Projects\\BuzzIt\\buzzit\\assets\\red_buzzer.png';

  console.log('Loading image from', inputPath);
  const image = await Jimp.read(inputPath);

  // Get background color from corners
  const bgR = image.bitmap.data[0];
  const bgG = image.bitmap.data[1];
  const bgB = image.bitmap.data[2];
  
  console.log(`Background color detected: R=${bgR}, G=${bgG}, B=${bgB}`);

  console.log('Processing pixels...');
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    const dist = Math.sqrt(
      Math.pow(r - bgR, 2) +
      Math.pow(g - bgG, 2) +
      Math.pow(b - bgB, 2)
    );

    // If close to background color, or very close to black
    if (dist < 45 || (r < 20 && g < 20 && b < 20)) {
      this.bitmap.data[idx + 3] = 0;
    }
  });

  console.log('Saving to', outputPath);
  await image.write(outputPath);
  console.log('Done!');
}

removeBackground().catch(console.error);
