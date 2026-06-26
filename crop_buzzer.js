const { Jimp } = require('jimp');

async function cropBuzzer() {
  const path = 'G:\\Projects\\BuzzIt\\buzzit\\assets\\red_buzzer.png';
  console.log('Loading image...');
  const image = await Jimp.read(path);
  console.log('Autocrop transparent borders...');
  image.autocrop();
  console.log('Saving cropped image back...');
  await image.write(path);
  console.log('Done!');
}

cropBuzzer().catch(console.error);
