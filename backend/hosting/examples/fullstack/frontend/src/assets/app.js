const form = document.querySelector('#items-form');
const list = document.querySelector('#items');
const status = document.querySelector('#status');

async function loadItems() {
  const response = await fetch('/api/items/');
  if (!response.ok) throw new Error(`Loading items failed (${response.status}).`);
  const { items } = await response.json();
  list.replaceChildren(...items.map(({ name }) => {
    const item = document.createElement('li');
    item.textContent = name;
    return item;
  }));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = 'Saving...';
  try {
    const response = await fetch('/api/items/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.elements.name.value }),
    });
    if (!response.ok) throw new Error(`Saving item failed (${response.status}).`);
    form.reset();
    await loadItems();
    status.textContent = 'Item saved.';
  } catch (error) {
    status.textContent = error.message;
  }
});

loadItems().catch((error) => { status.textContent = error.message; });
