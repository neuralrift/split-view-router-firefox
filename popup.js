async function refresh() {
  try {
    const mode = await browser.runtime.sendMessage({type: "getMode"});
    document.getElementById('ctrl').classList.toggle('active', mode === 'ctrl');
    document.getElementById('simple').classList.toggle('active', mode === 'simple');
    document.getElementById('ctrl').setAttribute('aria-pressed', String(mode === 'ctrl'));
    document.getElementById('simple').setAttribute('aria-pressed', String(mode === 'simple'));
  } catch (e) {
    // Background unavailable — leave mode buttons in neutral state.
  }

  try {
    const routing = await browser.runtime.sendMessage({type: "getRouting"});
    const btn = document.getElementById('toggle');
    btn.classList.toggle('on', routing);
    btn.setAttribute('aria-checked', String(routing));
    btn.querySelector('.toggle-state').textContent = routing ? 'On' : 'Off';
  } catch (e) { console.error(e); }

  const list = document.getElementById('list');
  list.replaceChildren();

  let pairs;
  try {
    pairs = await browser.runtime.sendMessage({type: "getPairs"});
  } catch (e) {
    const err = document.createElement('div');
    err.className = 'small';
    err.textContent = 'Extension is reloading…';
    list.appendChild(err);
    return;
  }

  if (!pairs || !pairs.length) {
    const empty = document.createElement('div');
    empty.className = 'small';
    empty.textContent = 'No pairs. Select 2 tabs → right-click → Pair selected tabs as split';
    list.appendChild(empty);
    return;
  }

  pairs.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pair';
    const b = document.createElement('b');
    b.textContent = p.leftTitle;
    const span = document.createElement('span');
    span.className = 'small';
    span.textContent = `→ ${p.rightTitle}`;
    div.append(b, span);
    if (p.paused) {
      const tag = document.createElement('span');
      tag.className = 'small paused';
      tag.textContent = ' (paused)';
      div.appendChild(tag);
    }
    list.appendChild(div);
  });
}

async function send(msg) {
  try { await browser.runtime.sendMessage(msg); } catch (e) { console.error(e);  }
}

document.getElementById('ctrl').onclick = async () => {
  await send({type: "setMode", mode: 'ctrl'});
  refresh();
};
document.getElementById('simple').onclick = async () => {
  await send({type: "setMode", mode: 'simple'});
  refresh();
};
document.getElementById('clear').onclick = async () => {
  await send({type: "unpairAll"});
  refresh();
};
document.getElementById('toggle').onclick = async () => {
  const routing = await browser.runtime.sendMessage({type: "getRouting"});
  await send({type: "setRouting", enabled: !routing});
  refresh();
};

refresh();
