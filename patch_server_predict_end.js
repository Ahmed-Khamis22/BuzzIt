const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');
content = content.replace(/\r\n/g, '\n');

const target = `  if (room.buzzTimeout) { clearTimeout(room.buzzTimeout); room.buzzTimeout = null; }
  if (room.triviaTimer) { clearTimeout(room.triviaTimer); room.triviaTimer = null; }
  if (room.drawRoundTimer) { clearTimeout(room.drawRoundTimer); room.drawRoundTimer = null; }`;

const replace = `  if (room.buzzTimeout) { clearTimeout(room.buzzTimeout); room.buzzTimeout = null; }
  if (room.triviaTimer) { clearTimeout(room.triviaTimer); room.triviaTimer = null; }
  if (room.drawRoundTimer) { clearTimeout(room.drawRoundTimer); room.drawRoundTimer = null; }
  if (room.predictTimer) { clearTimeout(room.predictTimer); room.predictTimer = null; }`;

if (content.includes(target)) {
  content = content.replace(target, replace);
  fs.writeFileSync('server.js', content);
  console.log('End game timer replaced successfully.');
} else {
  console.log('End game timer target not found.');
}
