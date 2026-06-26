const fs = require('fs');

function isPremium(item) {
  const BLACKLIST = ['sex', '🔞', 'hentai', 'fap', 'cum', 'pussy', 'brothel', 'cuckold', 'milf', 'naughty', 'lust', 'college', 'body', 'cam', 'cossacks', 'hitler', 'bdsm'];
  const name = (item.name || '').toLowerCase();
  const game = (item.gameName || '').toLowerCase();
  return !BLACKLIST.some(word => name.includes(word) || game.includes(word));
}

async function start() {
  const frames = JSON.parse(fs.readFileSync('steam_frames.json', 'utf8'));
  const avatarFrames = frames.filter(f => f.itemType === 'Avatar Frame' && isPremium(f));
  
  const KEYWORDS = {
    magic: ['magic', 'mystic', 'rune', 'spell', 'witch', 'wizard', 'artifact', 'arcane', 'runes'],
    cosmic: ['cosmic', 'galaxy', 'space', 'nebula', 'starry', 'astral', 'stars'],
    ice: ['ice', 'frost', 'frozen', 'snow', 'glacier', 'cold', 'winter'],
    toxic: ['toxic', 'poison', 'acid', 'slime', 'biohazard', 'corrosive']
  };
  
  const results = {};
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    results[cat] = avatarFrames.filter(f => {
      const name = (f.name || '').toLowerCase();
      const game = (f.gameName || '').toLowerCase();
      return words.some(w => name.includes(w) || game.includes(w));
    });
    console.log(`Category [${cat}]: Found ${results[cat].length} frames`);
    results[cat].slice(0, 5).forEach((item, i) => {
      console.log(`  [${i}] ${item.name} (${item.gameName})`);
      console.log(`      URL: ${item.imageUrl}`);
    });
  }
}

start();
