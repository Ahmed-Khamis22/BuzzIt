/**
 * generate_cover_gifs.js
 * Generates animated GIF files for each cover image.
 * Each GIF has a shimmer sweep + subtle pulse effect.
 * Run: node generate_cover_gifs.js
 */

const { createCanvas, loadImage } = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../buzzit/assets/store');
const OUT_DIR = ASSETS_DIR;

const COVERS = [
  { input: 'cover_moez_v3.png',            output: 'cover_moez.gif' },
  { input: 'cover_gaming_v3.png',           output: 'cover_gaming.gif' },
  { input: 'cover_bedouin_v3.png',          output: 'cover_bedouin.gif' },
  { input: 'cover_pyramids_v3.png',         output: 'cover_pyramids.gif' },
  { input: 'cover_cyberpunk_cairo_v3.png',  output: 'cover_cyberpunk_cairo.gif' },
];

// GIF canvas dimensions — keep reasonable for mobile
const W = 480;
const H = 180;
const TOTAL_FRAMES = 40;   // frames per GIF
const FRAME_DELAY = 60;    // ms between frames (~16fps)

async function generateCoverGif({ input, output }) {
  const srcPath = path.join(ASSETS_DIR, input);
  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠ Skipping ${input} — file not found`);
    return;
  }

  console.log(`  Generating ${output} ...`);
  const img = await loadImage(srcPath);

  const encoder = new GIFEncoder(W, H, 'neuquant', true);
  const outPath = path.join(OUT_DIR, output);
  const stream = fs.createWriteStream(outPath);
  encoder.createReadStream().pipe(stream);

  encoder.start();
  encoder.setRepeat(0);      // loop forever
  encoder.setDelay(FRAME_DELAY);
  encoder.setQuality(12);    // 1=best, 20=worst

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const t = f / TOTAL_FRAMES; // 0..1

    // ── Draw base image (slightly scaled for subtle zoom-in Ken Burns)
    const scale = 1 + 0.06 * Math.sin(t * Math.PI); // zoom 1x → 1.06x → 1x
    const dx = (W * (1 - scale)) / 2;
    const dy = (H * (1 - scale)) / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, dx, dy, W * scale, H * scale);

    // ── Dark overlay for depth
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, W, H);

    // ── Sweeping shimmer (diagonal light streak)
    const shimmerPos = (t * 1.6 - 0.3) * W; // goes from -30% to 130% of width
    const shimmerGrad = ctx.createLinearGradient(shimmerPos - 60, 0, shimmerPos + 60, H);
    shimmerGrad.addColorStop(0,   'rgba(255,255,255,0)');
    shimmerGrad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
    shimmerGrad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    shimmerGrad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    shimmerGrad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.save();
    ctx.transform(1, 0, -0.3, 1, 0, 0); // skew to make it diagonal
    ctx.fillStyle = shimmerGrad;
    ctx.fillRect(shimmerPos - 80, 0, 160, H);
    ctx.restore();

    // ── Bottom cinematic fade
    const bottomGrad = ctx.createLinearGradient(0, H * 0.55, 0, H);
    bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bottomGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, 0, W, H);

    encoder.addFrame(ctx);
  }

  encoder.finish();
  await new Promise(resolve => stream.on('finish', resolve));
  const size = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`  ✓ ${output} — ${size} KB`);
}

async function main() {
  console.log('🎬 Generating animated cover GIFs...\n');
  for (const cover of COVERS) {
    await generateCoverGif(cover);
  }
  console.log('\n✅ All cover GIFs generated!');
}

main().catch(console.error);
