/**
 * generate_cover_gifs_custom.js
 * Generates custom, tailored animated GIFs for each specific cover.
 * High-value premium animations (e.g. racing cars, spaceships).
 * Run: node generate_cover_gifs_custom.js
 */

const { createCanvas, loadImage } = require('canvas');
const GIFEncoder = require('gif-encoder-2');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../buzzit/assets/store');
const OUT_DIR = ASSETS_DIR;

const COVERS = [
  { id: 'fantasy',   input: 'cover_cartoon_fantasy.png',   output: 'cover_cartoon_fantasy.gif' },
  { id: 'cyberpunk', input: 'cover_cartoon_cyberpunk.png', output: 'cover_cartoon_cyberpunk.gif' },
  { id: 'space',     input: 'cover_cartoon_space.png',     output: 'cover_cartoon_space.gif' },
  { id: 'racing',    input: 'cover_cartoon_racing.png',    output: 'cover_cartoon_racing.gif' },
  { id: 'arcade',    input: 'cover_cartoon_arcade.png',    output: 'cover_cartoon_arcade.gif' },
];

const W = 480;
const H = 180;
const TOTAL_FRAMES = 40;   
const FRAME_DELAY = 50;    

async function generateCoverGif(cover) {
  const srcPath = path.join(ASSETS_DIR, cover.input);
  if (!fs.existsSync(srcPath)) return;

  console.log(`  Crafting PREMIUM custom ${cover.output} ...`);
  const img = await loadImage(srcPath);

  const encoder = new GIFEncoder(W, H, 'neuquant', true);
  const stream = fs.createWriteStream(path.join(OUT_DIR, cover.output));
  encoder.createReadStream().pipe(stream);

  encoder.start();
  encoder.setRepeat(0);      
  encoder.setDelay(FRAME_DELAY);
  encoder.setQuality(10);    

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // We handle Racing specially because it loads its own sprites
  if (cover.id === 'racing') {
    const emptyTrackImg = await loadImage(path.join(ASSETS_DIR, 'cover_cartoon_racing_empty.png'));
    const carSpriteImg = await loadImage(path.join(ASSETS_DIR, 'sprite_cartoon_car.png'));
    
    // Pre-process car sprite to remove white background
    const spriteCanvas = createCanvas(carSpriteImg.width, carSpriteImg.height);
    const sCtx = spriteCanvas.getContext('2d');
    sCtx.drawImage(carSpriteImg, 0, 0);
    const imgData = sCtx.getImageData(0, 0, spriteCanvas.width, spriteCanvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 240 && data[i+1] > 240 && data[i+2] > 240) {
        data[i+3] = 0; // Make white transparent
      }
    }
    sCtx.putImageData(imgData, 0, 0);

    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const t = f / TOTAL_FRAMES; 
      ctx.clearRect(0, 0, W, H);
      
      // Draw panning background
      const panX = Math.sin(t * Math.PI * 2) * 10; 
      ctx.drawImage(emptyTrackImg, panX - 10, 0, W + 20, H);
      
      ctx.save();
      
      // Speed lines
      for (let i = 0; i < 30; i++) {
        const y = ((i * 17) % 100) / 100 * H;
        const xOffset = (t * 5 + i * 0.1) % 1.0 * (W * 1.5); 
        const x = W - xOffset + 100;
        const length = (i % 5 + 3) * 20;
        const alpha = (Math.sin(i * 123) * 0.5 + 0.5) * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + length, y);
        ctx.strokeStyle = i % 2 === 0 ? `rgba(0, 255, 255, ${alpha})` : `rgba(255, 0, 255, ${alpha})`; 
        ctx.lineWidth = (i % 3) + 1;
        ctx.stroke();
      }

      // Draw Car 1
      const car1X = W - ((t * 1.5) % 1.0) * (W * 1.5);
      const car1Y = H * 0.5;
      const carW = 120;
      const carH = (carW / carSpriteImg.width) * carSpriteImg.height;
      
      ctx.translate(car1X, car1Y);
      
      // Bobbing
      const bob = Math.sin(t * Math.PI * 20) * 2;
      
      // Drop Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(carW/2, carH - 5 + bob, carW/2.5, 5, 0, 0, Math.PI*2);
      ctx.fill();
      
      ctx.drawImage(spriteCanvas, 0, bob, carW, carH);
      
      ctx.restore();
      encoder.addFrame(ctx);
    }
  } else {
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const t = f / TOTAL_FRAMES; 
      
      // Draw base image 
      ctx.clearRect(0, 0, W, H);
      // Slight panning background for dynamic feel
      const panX = Math.sin(t * Math.PI * 2) * 5; 
      ctx.drawImage(img, panX - 10, 0, W + 20, H);

      // Apply premium moving object effects based on cover type
      switch (cover.id) {
        case 'fantasy':
          drawPremiumFantasy(ctx, t);
          break;
        case 'cyberpunk':
          drawPremiumCyberpunk(ctx, t);
          break;
        case 'space':
          drawPremiumSpace(ctx, t);
          break;
        case 'arcade':
          drawPremiumArcade(ctx, t);
          break;
      }

      encoder.addFrame(ctx);
    }
  }

  encoder.finish();
  await new Promise(resolve => stream.on('finish', resolve));
}

// ================= PREMIUM CUSTOM EFFECTS =================

function drawPremiumRacing() { /* No-op now */ }

function drawPremiumSpace(ctx, t) {
  ctx.save();
  // Flying spaceship shooting lasers
  const shipX = (W * 0.2) + Math.sin(t * Math.PI * 2) * 20; 
  const shipY = (H * 0.5) + Math.cos(t * Math.PI * 4) * 15; 
  
  ctx.translate(shipX, shipY);
  
  // Ship Thruster
  const thrustScale = Math.random() * 0.5 + 0.5;
  ctx.fillStyle = '#00FFFF';
  ctx.shadowColor = '#00FFFF';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(-20 - (30 * thrustScale), -5);
  ctx.lineTo(-20 - (30 * thrustScale), 5);
  ctx.fill();
  
  // Ship Body
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#E0E0E0';
  ctx.beginPath();
  ctx.ellipse(0, 0, 25, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Cockpit
  ctx.fillStyle = '#FF00FF';
  ctx.beginPath();
  ctx.ellipse(10, -3, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Firing Lasers
  if (t % 0.2 < 0.1) {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00FF00';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(W, 0);
    ctx.stroke();
  }

  // Passing stars for parallax speed
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'white';
  for(let i=0; i<15; i++) {
    let sx = ((i * 50) - (t * W * 2)) % W;
    if (sx < 0) sx += W;
    let sy = (i * 30) % H;
    ctx.fillRect(sx, sy, 3, 1);
  }
  ctx.restore();
}

function drawPremiumFantasy(ctx, t) {
  ctx.save();
  // Draw a flying magical glowing orb / fairy circling the screen
  const cx = W / 2;
  const cy = H / 2;
  const rx = W * 0.4;
  const ry = H * 0.3;
  const angle = t * Math.PI * 2 * 2; // two full rotations
  
  const fairyX = cx + Math.cos(angle) * rx;
  const fairyY = cy + Math.sin(angle * 2) * ry; // Figure 8 path

  ctx.fillStyle = '#FFD700';
  ctx.shadowColor = '#FFA500';
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(fairyX, fairyY, 6 + Math.sin(t*Math.PI*10)*2, 0, Math.PI*2);
  ctx.fill();

  // Fairy trail
  ctx.shadowBlur = 0;
  for(let i=1; i<=10; i++) {
    const pastAngle = angle - (i * 0.1);
    const px = cx + Math.cos(pastAngle) * rx;
    const py = cy + Math.sin(pastAngle * 2) * ry;
    ctx.fillStyle = `rgba(255, 215, 0, ${1 - i/10})`;
    ctx.beginPath();
    ctx.arc(px, py, 4 - (i*0.3), 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPremiumCyberpunk(ctx, t) {
  ctx.save();
  // Flying hovercar across neon city
  const carX = -50 + ((t * 1.5) % 1.0) * (W + 100); // left to right
  const carY = (H * 0.4) + Math.sin(t * Math.PI * 6) * 5;

  ctx.translate(carX, carY);
  
  // Neon Trail
  ctx.fillStyle = '#FF00FF';
  ctx.shadowColor = '#FF00FF';
  ctx.shadowBlur = 10;
  ctx.fillRect(-60, 2, 50, 2);

  // Hovercar Body
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.moveTo(-15, 0);
  ctx.lineTo(20, 0);
  ctx.lineTo(10, -10);
  ctx.lineTo(-10, -10);
  ctx.closePath();
  ctx.fill();

  // Hover pads glowing
  ctx.fillStyle = '#00FFFF';
  ctx.shadowColor = '#00FFFF';
  ctx.shadowBlur = 5;
  ctx.beginPath(); ctx.ellipse(-10, 2, 4, 2, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(15, 2, 4, 2, 0, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

function drawPremiumArcade(ctx, t) {
  ctx.save();
  // Pac-man style chasing animation
  const startX = -100;
  const endX = W + 100;
  const x = startX + t * (endX - startX); // moves across
  const y = H * 0.8;

  // Draw dots to be eaten
  ctx.fillStyle = '#FFD700';
  for(let i=0; i<10; i++) {
    const dotX = (i * 50);
    if (dotX > x) {
      ctx.beginPath(); ctx.arc(dotX, y, 4, 0, Math.PI*2); ctx.fill();
    }
  }

  // Draw Chaser (Ghost)
  ctx.translate(x - 60, y);
  ctx.fillStyle = '#FF0000'; // Red ghost
  ctx.beginPath();
  ctx.arc(0, -10, 15, Math.PI, 0); // top dome
  ctx.lineTo(15, 15);
  // wavy bottom
  ctx.lineTo(5, 10); ctx.lineTo(0, 15); ctx.lineTo(-5, 10); ctx.lineTo(-15, 15);
  ctx.closePath();
  ctx.fill();
  // Ghost eyes
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(-6, -12, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -12, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'blue';
  ctx.beginPath(); ctx.arc(-4, -12, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(8, -12, 2, 0, Math.PI*2); ctx.fill();

  // Draw Hero (Pac-man shape)
  ctx.translate(60, 0);
  ctx.fillStyle = '#FFFF00';
  const mouthAngle = (Math.sin(t * Math.PI * 20) * 0.5 + 0.5) * 0.25 * Math.PI;
  ctx.beginPath();
  ctx.arc(0, 0, 15, mouthAngle, Math.PI * 2 - mouthAngle);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}


async function main() {
  console.log('🎬 Generating PREMIUM animated cover GIFs...\n');
  for (const cover of COVERS) {
    await generateCoverGif(cover);
  }
  console.log('\n✅ All premium custom cover GIFs generated!');
}

main().catch(console.error);
