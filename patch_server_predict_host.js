const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const targetHost = "const isPlayingHost = config?.gameMode === 'trivia' || config?.gameMode === 'draw' || (config?.gameMode === 'buzzer' && config?.answerMode === 'written');";
const replaceHost = "const isPlayingHost = config?.gameMode === 'predict' || config?.gameMode === 'trivia' || config?.gameMode === 'draw' || (config?.gameMode === 'buzzer' && config?.answerMode === 'written');";

if (content.includes(targetHost)) {
  content = content.replace(targetHost, replaceHost);
  fs.writeFileSync('server.js', content);
  console.log('Host logic replaced successfully.');
} else {
  console.log('Host target not found.');
}
