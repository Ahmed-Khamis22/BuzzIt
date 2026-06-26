const sharp = require('sharp');
const path = require('path');

const srcDir = 'C:\\Users\\ahmed\\.gemini\\antigravity-ide\\brain\\31faa7a8-3f36-4b80-9f56-ac50663be658';
const destDir = 'g:\\Projects\\BuzzIt\\buzzit\\assets\\store';

const images = [
  { src: 'cover_moez_v3_1781879764486.png', dest: 'cover_moez.png' },
  { src: 'cover_gaming_v3_1781879774569.png', dest: 'cover_gaming.png' },
  { src: 'cover_bedouin_v3_1781879783975.png', dest: 'cover_bedouin.png' },
  { src: 'cover_pyramids_v3_1781879800550.png', dest: 'cover_pyramids.png' },
  { src: 'cover_cyberpunk_v3_1781879813099.png', dest: 'cover_cyberpunk_cairo.png' },
];

async function processImages() {
  for (const img of images) {
    try {
      const srcPath = path.join(srcDir, img.src);
      const destName = img.dest.replace('.png', '_v3.png');
      const destPath = path.join(destDir, destName);
      
      // Crop start: X=0, Y=235, W=1024, H=554 (Aspect Ratio ~ 1.85:1)
      await sharp(srcPath)
        .extract({ left: 0, top: 235, width: 1024, height: 554 })
        .toFile(destPath);
      console.log(`Successfully cropped and saved ${destName}`);
    } catch (e) {
      console.error(`Error processing ${img.src}:`, e.message);
    }
  }
}

processImages();
