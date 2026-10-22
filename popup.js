const $ = (id) => document.getElementById(id);

async function refresh() {
  try {
    const mode = await chrome.runtime.sendMessage({type: "getMode"});
    $('ctrl').classList.toggle('active', mode === 'ctrl');
    $('simple').classList.toggle('active', mode === 'simple');
    $('ctrl').setAttribute('aria-pressed', String(mode === 'ctrl'));
    $('simple').setAttribute('aria-pressed', String(mode === 'simple'));
  } catch (e) {
    // Background unavailable — leave mode buttons in neutral state.
  }

  try {
    const routing = await chrome.runtime.sendMessage({type: "getRouting"});
    const btn = $('toggle');
    btn.classList.toggle('on', routing);
    btn.setAttribute('aria-checked', String(routing));
    btn.querySelector('.toggle-state').textContent = routing ? 'On' : 'Off';
  } catch (e) { console.error(e); }

  const list = $('list');
  list.replaceChildren();

  let splits;
  try {
    splits = await chrome.runtime.sendMessage({type: "getSplits"});
  } catch (e) {
    splits = null;
  }
  if (!splits) {
    const err = document.createElement('div');
    err.className = 'small';
    err.textContent = 'Extension is reloading…';
    list.appendChild(err);
    return;
  }

  if (!splits.length) {
    const empty = document.createElement('div');
    empty.className = 'small';
    empty.textContent = 'No split views. Right-click a tab → Add tab to new split view.';
    list.appendChild(empty);
    return;
  }

  splits.forEach(s => {
    const div = document.createElement('div');
    div.className = 'pair';
    const b = document.createElement('b');
    b.textContent = s.leftTitle;
    const span = document.createElement('span');
    span.className = 'small';
    span.textContent = `→ ${s.rightTitle}`;
    const pause = document.createElement('button');
    pause.className = 'pause';
    pause.textContent = s.paused ? 'Resume' : 'Pause';
    pause.onclick = async () => {
      await send({type: "setPaused", splitViewId: s.splitViewId, paused: !s.paused});
      refresh();
    };
    div.append(b, span, pause);
    if (s.paused) {
      const tag = document.createElement('span');
      tag.className = 'small paused';
      tag.textContent = ' (paused)';
      div.insertBefore(tag, pause);
    }
    list.appendChild(div);
  });
}

async function send(msg) {
  try { await chrome.runtime.sendMessage(msg); } catch (e) { console.error(e); }
}

$('ctrl').onclick = async () => {
  await send({type: "setMode", mode: 'ctrl'});
  refresh();
};
$('simple').onclick = async () => {
  await send({type: "setMode", mode: 'simple'});
  refresh();
};
$('toggle').onclick = async () => {
  const routing = await chrome.runtime.sendMessage({type: "getRouting"});
  await send({type: "setRouting", enabled: !routing});
  refresh();
};

refresh();
