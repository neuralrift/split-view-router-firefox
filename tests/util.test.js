import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const utilCode = fs.readFileSync(path.join(__dirname, '../lib/util.js'), 'utf8');
eval(utilCode + '\nglobal.originOf = originOf;\nglobal.getPairSplitState = getPairSplitState;\nglobal.getUnpairThisTabState = getUnpairThisTabState;\nglobal.getUnpairAllState = getUnpairAllState;\nglobal.getPauseResumeMenuState = getPauseResumeMenuState;'); // Injects into global scope

describe('util.js', () => {
  it('originOf returns correct origin for standard HTTP/HTTPS URLs', () => {
    expect(originOf('https://example.com/path')).toBe('https://example.com');
    expect(originOf('http://test.org:8080/')).toBe('http://test.org:8080');
  });

  it('originOf handles invalid or empty inputs gracefully', () => {
    expect(originOf(null)).toBe('?');
    expect(originOf(undefined)).toBe('?');
    expect(originOf('')).toBe('?');
    expect(originOf('not-a-url')).toBe('?');
  });

  it('originOf handles about: and local protocols', () => {
    expect(originOf('about:blank')).toBe('about:blank');
    expect(originOf('file:///C:/test.txt')).toBe('file:');
  });

  it('U1: originOf returns data: for data: URLs', () => {
    expect(originOf('data:text/html,test')).toBe('data:');
  });

  it('U2: originOf handles blob: URLs', () => {
    // In many environments, blob: origin is the inner origin
    const res = originOf('blob:https://example.com/uuid');
    expect(res === 'https://example.com' || res === 'blob:').toBe(true);
  });

  it('U3: originOf returns protocol for extension URLs if origin is null', () => {
    const res = originOf('moz-extension://uuid/options.html');
    expect(res === 'moz-extension://uuid' || res === 'moz-extension:').toBe(true);
  });

  it('U4: originOf returns ? for non-string types', () => {
    expect(originOf(123)).toBe('?');
    expect(originOf({})).toBe('?');
    expect(originOf([])).toBe('?');
  });

  it('U5: originOf strips userinfo', () => {
    expect(originOf('https://u:p@example.com/')).toBe('https://example.com');
  });
});

describe('util.js state logic', () => {
  it('getPairSplitState returns correct state for tab counts', () => {
    expect(getPairSplitState(0, false).enabled).toBe(false);
    expect(getPairSplitState(1, false).enabled).toBe(false);
    expect(getPairSplitState(2, false).enabled).toBe(true);
    expect(getPairSplitState(3, false).enabled).toBe(false);
    expect(getPairSplitState(2, true).enabled).toBe(false);
  });

  it('U6: getPairSplitState titles match documented strings', () => {
    expect(getPairSplitState(2, false).title).toBe("Pair selected tabs as split");
    expect(getPairSplitState(2, true).title).toBe("Selected tabs are already paired");
    expect(getPairSplitState(1, false).title).toBe("Pair split (select exactly 2 tabs first)");
  });

  it('getUnpairThisTabState returns correct state', () => {
    expect(getUnpairThisTabState(true).enabled).toBe(true);
    expect(getUnpairThisTabState(false).enabled).toBe(false);
  });

  it('U7: getUnpairThisTabState / getUnpairAllState titles', () => {
    expect(getUnpairThisTabState(true).title).toBe("Unpair this tab");
    expect(getUnpairAllState(true).title).toBe("Unpair all");
  });

  it('getPauseResumeMenuState returns correct state', () => {
    expect(getPauseResumeMenuState(false, false).enabled).toBe(false);
    expect(getPauseResumeMenuState(true, false).title).toBe('Pause routing');
    expect(getPauseResumeMenuState(true, true).title).toBe('Resume routing');
  });
});

