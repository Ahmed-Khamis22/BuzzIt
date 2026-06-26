async function test() {
  try {
    const res = await fetch('http://localhost:4000/api/store/items');
    const data = await res.json();
    console.log('API returned items count:', data.length);
    const types = {};
    data.forEach(item => {
      types[item.type] = (types[item.type] || 0) + 1;
      if (item.type === 'cover') {
        console.log(`- API Cover: ${item.name} (isAvailable: ${item.isAvailable})`);
      }
    });
    console.log('API items by type:', types);
  } catch (err) {
    console.error('API call failed:', err.message);
  }
}

test();
