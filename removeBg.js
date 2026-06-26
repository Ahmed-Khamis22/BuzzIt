const jimp = require('jimp');

const inputPath = 'C:\\Users\\ahmed\\.gemini\\antigravity-ide\\brain\\31faa7a8-3f36-4b80-9f56-ac50663be658\\buzzit_raw_logo_1781778770013.png';
const outputPath = 'g:\\Projects\\BuzzIt\\buzzit\\assets\\custom_logo.png';

async function removeWhiteBackground() {
  try {
    const JimpClass = jimp.Jimp || jimp;
    const image = await JimpClass.read(inputPath);
    
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      
      // If the pixel is very close to white
      if (red > 240 && green > 240 && blue > 240) {
        this.bitmap.data[idx + 3] = 0; // Set alpha to 0 (transparent)
      }
    });

    image.write(outputPath, (err) => {
      if (err) throw err;
      console.log('Successfully saved transparent logo to', outputPath);
    });
  } catch (err) {
    console.error('Error processing image:', err);
  }
}

removeWhiteBackground();
