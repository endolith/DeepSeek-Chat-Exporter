# DeepSeek Chat Exporter – Break/Fix Guide

Purpose: When DeepSeek updates their frontend, DOM classes and React structure can change. Use this checklist to quickly restore exports without guesswork.

## 0) Built-in diagnostic (easiest)

1. On the DeepSeek chat page, click the **gear (⚙️)** on the exporter toolbar.
2. Click **"Copy diagnostic for Cursor"**.
3. Paste the copied text into a Cursor chat and ask the AI to update the script’s selectors and fiber paths. The diagnostic includes current config, container state, user-message probe, and instructions for React path probes.

(If the export is broken, scroll to the top of the chat so the first user message is in view before copying the diagnostic.)

## 1) What you’ll need (manual fix)

- Firefox + React Developer Tools extension (or Chrome)
- This repository open so you can edit `deepseek_chat_exporter.user.js`

## 2) Verify DOM selectors (change only if these fail)

The script’s current selectors are in the config at the top of `deepseek_chat_exporter.user.js`. The built-in diagnostic (step 0) prints them and whether they match. If they’re wrong, update `chatContainerSelector`, `userMessageSelector`, `thinkingChainSelector`, or the final-answer DOM filter logic accordingly.

## 3) Capture React paths with React DevTools (authoritative)

We don’t scrape rendered HTML. We extract the raw markdown/thinking from React `memoizedProps`.

Define a helper in the Console (paste once):

```javascript
window.__scanReact = (el, prop) => {
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return { error: 'No react fiber on element' };
  const start = el[fiberKey];
  const seen = new Set();
  const stack = [[start, '$0']];
  while (stack.length) {
    const [f, path] = stack.pop();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    const mp = f.memoizedProps;
    if (mp && Object.prototype.hasOwnProperty.call(mp, prop) && mp[prop]) {
      const preview = typeof mp[prop] === 'string' ? mp[prop].slice(0, 200) : '[non-string]';
      return { path, prop, preview, full: mp[prop] };
    }
    stack.push([f.child,   path + '.child']);
    stack.push([f.sibling, path + '.sibling']);
    stack.push([f.return,  path + '.return']);
  }
  return { error: `prop ${prop} not found from this node` };
};
```

Probe the two elements (right‑click → Inspect to set `$0`):

- Final answer: select the answer `div.ds-markdown`, run:

```javascript
__scanReact($0, 'markdown')
```

- Thinking: select the thinking `div.ds-markdown` inside the thinking container (see config `thinkingChainSelector`), run:

```javascript
__scanReact($0, 'content')
```

Record the returned `path` strings.

## 4) Update the script config

Open `deepseek_chat_exporter.user.js` and set:

```js
answerMarkdownPath: '<path from markdown probe>',
thinkingContentPath: '<path from content probe>'
```

Example (paths vary when the site updates):

```js
answerMarkdownPath: '$0.return.return.return',
thinkingContentPath: '$0.return.return.return.return'
```

If `userMessageSelector` is a single class (e.g. `._9663006`), the script treats the container child row itself as the message when it matches; no inner `.ds-markdown` is required.

## 5) Test

- Export to Markdown. In the Console you should see:
  - `Found final answer at path: config.answerMarkdownPath`
  - `Found thinking content at path: config.thinkingContentPath`
- The MD file should contain:
  - `## User` with your message
  - `## Assistant` with one `### Thought Process` block and the final answer markdown

## 6) If it still fails

- Redo the probes to confirm new paths.
- If DOM selectors changed, update those first (step 1).
- As a last resort, paste the two probe objects here in an issue or chat for help.

Notes:

- We intentionally avoid HTML→Markdown conversion. The script extracts the original markdown from React so we preserve code blocks, math, etc.
- The code prefers the configured path; it only falls back to a limited scanner to print a path you can copy into config next time.
