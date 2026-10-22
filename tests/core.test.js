import { describe, it, expect } from 'vitest';
import core from '../lib/core.js';

const tab = (id, index, splitViewId = -1, windowId = 1) => ({id, index, splitViewId, windowId, title: `t${id}`});

describe('splitInfo', () => {
  const tabs = [tab(10, 0), tab(11, 1, 7), tab(12, 2, 7), tab(13, 3)];

  it('finds the right partner for the left tab', () => {
    expect(core.splitInfo(tabs[1], tabs)).toMatchObject({splitViewId: 7, role: 'left', partner: {id: 12}});
  });
  it('marks the higher-index tab as right', () => {
    expect(core.splitInfo(tabs[2], tabs)).toMatchObject({role: 'right', partner: {id: 11}});
  });
  it('returns null outside a split', () => {
    expect(core.splitInfo(tabs[0], tabs)).toBeNull();
    expect(core.splitInfo({id: 1, index: 0, windowId: 1}, tabs)).toBeNull();
  });
  it('returns null when the partner is missing', () => {
    expect(core.splitInfo(tabs[1], tabs.slice(0, 2))).toBeNull();
  });
});

describe('listSplits', () => {
  it('groups split members per window, left first', () => {
    const tabs = [tab(2, 5, 3), tab(1, 4, 3), tab(5, 0, 3, 2), tab(6, 1, 3, 2), tab(9, 6)];
    const splits = core.listSplits(tabs);
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({left: {id: 1}, right: {id: 2}});
    expect(splits[1]).toMatchObject({windowId: 2, left: {id: 5}, right: {id: 6}});
  });
});

describe('clickMatchesMode', () => {
  const ev = (o) => ({button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o});
  it('simple mode routes plain left clicks only', () => {
    expect(core.clickMatchesMode('simple', ev())).toBe(true);
    for (const k of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      expect(core.clickMatchesMode('simple', ev({[k]: true}))).toBe(false);
    }
    expect(core.clickMatchesMode('simple', ev({button: 1}))).toBe(false);
  });
  it('ctrl mode routes ctrl/cmd clicks only', () => {
    expect(core.clickMatchesMode('ctrl', ev())).toBe(false);
    expect(core.clickMatchesMode('ctrl', ev({ctrlKey: true}))).toBe(true);
    expect(core.clickMatchesMode('ctrl', ev({metaKey: true}))).toBe(true);
  });
});

describe('findAnchor', () => {
  it('finds an anchor inside an open shadow root via composedPath', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({mode: 'open'});
    shadow.innerHTML = '<a href="https://example.com/x"><span id="inner">go</span></a>';
    let found = null;
    document.addEventListener('click', (e) => { found = core.findAnchor(e); e.preventDefault(); }, {capture: true, once: true});
    shadow.getElementById('inner').dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    expect(found && found.getAttribute('href')).toBe('https://example.com/x');
    host.remove();
  });
});

describe('routableUrl', () => {
  const a = (href, attrs = {}) => {
    const el = document.createElement('a');
    el.setAttribute('href', href);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const here = document.location.href;
  it('accepts http(s) links', () => {
    expect(core.routableUrl(a('https://example.com/a'), here)).toBe('https://example.com/a');
  });
  it('rejects javascript:, mailto: and downloads', () => {
    expect(core.routableUrl(a('javascript:void(0)'), here)).toBeNull();
    expect(core.routableUrl(a('mailto:x@y.z'), here)).toBeNull();
    expect(core.routableUrl(a('https://example.com/f.zip', {download: ''}), here)).toBeNull();
  });
  it('rejects same-document fragment links', () => {
    expect(core.routableUrl(a('#'), here)).toBeNull();
    expect(core.routableUrl(a('#section'), here)).toBeNull();
  });
  it('accepts a fragment link to another page', () => {
    expect(core.routableUrl(a('https://example.com/other#s'), 'https://example.com/page')).toBe('https://example.com/other#s');
  });
});
