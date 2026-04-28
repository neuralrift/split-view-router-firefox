const $ = (id) => document.getElementById(id);

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 1500);
}

function renderState(d) {
  const el = $('state');
  el.replaceChildren();

  const addKV = (k, v, pillClass) => {
    const row = document.createElement('div');
    row.className = 'kv';
    const b = document.createElement('b');
    b.textContent = k;
    row.appendChild(b);
    if (pillClass) {
      const p = document.createElement('span');
      p.className = `pill ${pillClass}`;
      p.textContent = v;
      row.appendChild(p);
    } else {
      const span = document.createElement('span');
      span.textContent = v;
      row.appendChild(span);
    }
    el.appendChild(row);
  };

  addKV('Extension', `${d.extension.name} v${d.extension.version}`);
  addKV('Mode', d.state.mode, d.state.mode === 'simple' ? 'on' : 'warn');
  addKV('Routing', d.state.routing ? 'On' : 'Off', d.state.routing ? 'on' : 'err');
  addKV('Debugging', d.state.logging ? 'On' : 'Off', d.state.logging ? 'on' : 'warn');
  addKV('Pairs', String(d.state.pairs.length));

  if (d.state.pairs.length) {
    const wrap = document.createElement('div');
    wrap.style.marginTop = '8px';
    d.state.pairs.forEach((p) => {
      const div = document.createElement('div');
      div.className = 'pair';
      const title = document.createElement('div');
      title.className = 'pair-title';
      title.textContent = `${p.leftTitle ?? '(unknown)'} → ${p.rightTitle ?? '(unknown)'}`;
      const meta = document.createElement('div');
      meta.className = 'pair-meta';
      meta.textContent = `IDs ${p.leftId} → ${p.rightId}${p.paused ? ' · paused' : ''}`;
      div.append(title, meta);
      wrap.appendChild(div);
    });
    el.appendChild(wrap);
  }
}

function renderLog(entries) {
  const el = $('log');
  el.replaceChildren();
  $('log-count').textContent = String(entries.length);

  if (!entries.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = 'No events recorded yet.';
    el.appendChild(empty);
    return;
  }

  entries.slice().reverse().forEach((e) => {
    const row = document.createElement('div');
    row.className = 'row-log';

    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = `[${fmtTime(e.t)}] `;

    const src = document.createElement('span');
    src.className = 'src';
    src.textContent = `${e.src} `;

    const lvl = document.createElement('span');
    lvl.className = `lvl-${e.lvl}`;
    lvl.textContent = `${e.lvl.toUpperCase()} `;

    const msg = document.createElement('span');
    msg.textContent = e.msg;

    row.append(ts, src, lvl, msg);

    if (e.data && Object.keys(e.data).length) {
      const data = document.createElement('span');
      data.style.color = '#94a3b8';
      data.textContent = ` ${JSON.stringify(e.data)}`;
      row.appendChild(data);
    }

    el.appendChild(row);
  });
}

async function refresh() {
  try {
    const d = await browser.runtime.sendMessage({type: "getDiagnostics"});
    if (!d) {
      $('state').textContent = 'Could not read diagnostics.';
      return;
    }
    renderState(d);
    renderLog(d.log || []);
    const btn = $('toggle-logging');
    btn.textContent = d.state.logging ? 'Stop debugging' : 'Start debugging';
    btn.dataset.enabled = String(d.state.logging);
  } catch (e) {
    $('state').textContent = `Error: ${e.message || e}`;
  }
}

function copyViaTextarea(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

$('copy').addEventListener('click', async () => {
  let text;
  try {
    const d = await browser.runtime.sendMessage({type: "getDiagnostics"});
    text = JSON.stringify(d, null, 2);
  } catch (e) {
    showToast(`Failed to gather diagnostics: ${e.message || e}`);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
    return;
  } catch (e) { console.error(e);  }
  if (copyViaTextarea(text)) {
    showToast('Copied to clipboard');
  } else {
    showToast('Copy failed — clipboard access denied');
  }
});

$('clear').addEventListener('click', async () => {
  try {
    await browser.runtime.sendMessage({type: "clearLog"});
    showToast('Log cleared');
    refresh();
  } catch (e) {
    showToast(`Clear failed: ${e.message || e}`);
  }
});

$('refresh').addEventListener('click', refresh);

$('toggle-logging').addEventListener('click', async () => {
  const btn = $('toggle-logging');
  const wasEnabled = btn.dataset.enabled === 'true';
  try {
    await browser.runtime.sendMessage({type: "setLogging", enabled: !wasEnabled});
    showToast(wasEnabled ? 'Debugging stopped' : 'Debugging started');
    refresh();
  } catch (e) {
    showToast(`Failed: ${e.message || e}`);
  }
});

browser.storage.onChanged.addListener((ch) => {
  if (ch.log || ch.pairs || ch.mode || ch.routing || ch.paused || ch.logging) refresh();
});

refresh();
