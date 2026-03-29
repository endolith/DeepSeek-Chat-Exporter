// ==UserScript==
// @name         DeepSeek Chat Exporter (Markdown & PDF & PNG - English improved version)
// @namespace    https://github.com/endolith/DeepSeek-Chat-Exporter
// @version      1.9.0
// @description  Export DeepSeek chat history to Markdown, PDF and PNG formats
// @author       HSyuf/Blueberrycongee/endolith
// @license      MIT
// @homepageURL  https://github.com/endolith/DeepSeek-Chat-Exporter
// @supportURL   https://github.com/endolith/DeepSeek-Chat-Exporter/issues
// @downloadURL  https://raw.githubusercontent.com/endolith/DeepSeek-Chat-Exporter/main/deepseek_chat_exporter.user.js
// @updateURL    https://raw.githubusercontent.com/endolith/DeepSeek-Chat-Exporter/main/deepseek_chat_exporter.user.js
// @match        https://chat.deepseek.com/*
// @grant        GM_addStyle
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// ==/UserScript==

(function () {
  'use strict';

  // =====================
  // Configuration
  // =====================
  const config = {
      chatContainerSelector: '.ds-virtual-list-visible-items', // Container holding all messages
      userMessageSelector: '._9663006',  // User message row (content is element textContent; no inner .ds-markdown on share view)
      aiClassPrefix: '_4f9bf79',           // AI message related class prefix
      aiReplyContainer: '_43c05b5',        // Main container for AI replies
      searchHintSelector: '._5255ff8._4d41763', // Search/thinking time
      thinkingChainSelector: '.ds-think-content',  // Thinking chain container (stable marker class)
      finalAnswerSelector: '.ds-message .ds-markdown:last-child', // Final answer
      titleSelector: '.afa34042.e37a04e4.e0a1edb7', // Chat title (update if missing)
      // Fiber navigation paths discovered via __scanReact($0, prop)
      // Update these when the site changes; they allow deterministic extraction
      answerMarkdownPath: '$0.return.return.return', // memoizedProps.markdown
      thinkingContentPath: '$0.return.return.return.return', // memoizedProps.content
      exportFileName: 'DeepSeek',          // Changed from DeepSeek_Chat_Export
      // Header strings used in exports
      userHeader: 'User',
      assistantHeader: 'Assistant',
      thoughtsHeader: 'Thought Process',
  };

  /** New issue URL when exports fail after DeepSeek changes the site (GitHub issue #7). */
  const EXPORTER_ISSUES_NEW_URL = 'https://github.com/endolith/DeepSeek-Chat-Exporter/issues/new';

  let __exportFailedNoticeEscapeHandler = null;

  function hideExportFailedNotice() {
      const el = document.getElementById('ds-exporter-error-notice');
      if (el) {
          el.classList.remove('ds-exporter-error-notice--visible');
      }
      if (__exportFailedNoticeEscapeHandler) {
          document.removeEventListener('keydown', __exportFailedNoticeEscapeHandler);
          __exportFailedNoticeEscapeHandler = null;
      }
  }

  /**
   * In-page failure UI (same visual family as the sweep notice) so the issue URL is a real link.
   * @param {string} [detail] - Short reason shown above the issue link
   */
  function alertExportFailed(detail) {
      let root = document.getElementById('ds-exporter-error-notice');
      if (!root) {
          root = document.createElement('div');
          root.id = 'ds-exporter-error-notice';
          root.className = 'ds-exporter-error-notice';
          root.setAttribute('role', 'alertdialog');
          root.setAttribute('aria-modal', 'true');
          root.setAttribute('aria-labelledby', 'ds-exporter-error-heading');
          root.addEventListener('click', (ev) => {
              if (ev.target === root) {
                  hideExportFailedNotice();
              }
          });
          document.body.appendChild(root);
      }
      root.replaceChildren();

      const box = document.createElement('div');
      box.className = 'ds-exporter-notice-panel ds-exporter-error-notice__panel';

      const h2 = document.createElement('h2');
      h2.id = 'ds-exporter-error-heading';
      h2.className = 'ds-exporter-error-notice__title';
      h2.textContent = 'DeepSeek Chat Exporter could not complete this export.';
      box.appendChild(h2);

      const d = detail != null ? String(detail).trim() : '';
      if (d) {
          const pDetail = document.createElement('p');
          pDetail.className = 'ds-exporter-error-notice__detail';
          pDetail.textContent = d;
          box.appendChild(pDetail);
      }

      const pHint = document.createElement('p');
      pHint.className = 'ds-exporter-error-notice__hint';
      pHint.textContent =
          'DeepSeek sometimes changes class names or React internals; the script may need updated selectors.';
      box.appendChild(pHint);

      const pLink = document.createElement('p');
      pLink.className = 'ds-exporter-error-notice__linkline';
      const a = document.createElement('a');
      a.href = EXPORTER_ISSUES_NEW_URL;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'File an issue on GitHub';
      pLink.appendChild(a);
      pLink.appendChild(document.createTextNode(' (opens in a new tab)'));
      box.appendChild(pLink);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ds-exporter-error-notice__dismiss';
      btn.textContent = 'OK';
      btn.addEventListener('click', hideExportFailedNotice);
      box.appendChild(btn);

      root.appendChild(box);

      if (__exportFailedNoticeEscapeHandler) {
          document.removeEventListener('keydown', __exportFailedNoticeEscapeHandler);
      }
      __exportFailedNoticeEscapeHandler = (ev) => {
          if (ev.key === 'Escape') {
              hideExportFailedNotice();
          }
      };
      document.addEventListener('keydown', __exportFailedNoticeEscapeHandler);

      root.classList.add('ds-exporter-error-notice--visible');
      requestAnimationFrame(() => {
          btn.focus();
      });
  }

  // For future maintainers: see BREAK_FIX_GUIDE.md for step-by-step recovery
  // when DOM classes or React fiber structure change.

  // User preferences with defaults
  const preferences = {
      convertLatexDelimiters: GM_getValue('convertLatexDelimiters', false),
  };

  // Register menu command for toggling LaTeX delimiter conversion
  GM_registerMenuCommand('Toggle LaTeX Delimiter Conversion', () => {
      preferences.convertLatexDelimiters = !preferences.convertLatexDelimiters;
      GM_setValue('convertLatexDelimiters', preferences.convertLatexDelimiters);
      alert(`LaTeX delimiter conversion is now ${preferences.convertLatexDelimiters ? 'enabled' : 'disabled'}`);
  });

  let __exportPNGLock = false;  // Global lock to prevent duplicate clicks

  // =====================
  // Tool functions
  // =====================
  /**
   * Gets the message content if the node contains a user message, null otherwise.
   * Uses node.matches() first because querySelector only searches descendants; when the row
   * itself is the user message element (e.g. ._9663006), the node is the content.
   * @param {HTMLElement} node - The DOM node to check
   * @returns {string|null} The user message content if found, null otherwise
   */
  function getUserMessage(node) {
      const messageDiv = node.matches(config.userMessageSelector) ? node : node.querySelector(config.userMessageSelector);
      return messageDiv ? messageDiv.textContent.trim() : null;
  }

  /**
   * Checks if a DOM node represents an AI message
   * @param {HTMLElement} node - The DOM node to check
   * @returns {boolean} True if the node is an AI message
   */
  function isAIMessage(node) {
      return node.classList.contains(config.aiClassPrefix);
  }

  /**
   * Extracts search or thinking time information from a node
   * @param {HTMLElement} node - The DOM node to extract from
   * @returns {string|null} Markdown formatted search/thinking info or null if not found
   */
  function extractSearchOrThinking(node) {
      const hintNode = node.querySelector(config.searchHintSelector);
      return hintNode ? `**${hintNode.textContent.trim()}**` : null;
  }


  /**
   * Navigate a React fiber from a DOM element using a path string
   * Path format mirrors React DevTools output from __scanReact, e.g. "$0.return.child.sibling"
   * Returns the fiber located at the end of the path, or null.
   */
  function navigateFiberPathFromElement(element, pathString) {
      if (!element || !pathString) return null;
      const fiberKey = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
      if (!fiberKey) return null;
      let fiber = element[fiberKey];
      // Normalize path: drop leading "$0." or "$0"
      const cleaned = pathString.replace(/^\$0\.*/, '');
      if (!cleaned) return fiber;
      const steps = cleaned.split('.');
      for (const step of steps) {
          if (!step) continue;
          fiber = fiber ? fiber[step] : null;
          if (!fiber) return null;
      }
      return fiber;
  }

  /**
   * When the user stops generation mid-stream, React still stores partial markdown with an
   * odd number of ``` fence lines, so the last fenced code block never closes. That breaks
   * downstream Markdown/renderers (GitHub issue #8). Append a closing fence when needed.
   * @param {string} markdown
   * @returns {string}
   */
  function closeUnclosedFencedCodeBlocks(markdown) {
      if (typeof markdown !== 'string' || markdown.length === 0) return markdown;
      const lines = markdown.split(/\r?\n/);
      let inThreeBacktickFence = false;
      for (const line of lines) {
          // CommonMark: up to 3 spaces indent, then a code fence run (we only normalize ```).
          const m = line.match(/^ {0,3}(```+)/);
          if (!m) continue;
          if (m[1].length === 3) inThreeBacktickFence = !inThreeBacktickFence;
      }
      if (inThreeBacktickFence) return markdown + '\n```';
      return markdown;
  }

  /**
   * DeepSeek keeps only visible rows under `.ds-virtual-list-visible-items`; off-screen turns are
   * unmounted. Find the scrollable ancestor that drives that list so we can sweep scrollTop.
   * @param {HTMLElement} el
   * @returns {HTMLElement|null}
   */
  function findScrollParent(el) {
      let p = el;
      for (let i = 0; i < 30 && p; i++) {
          const st = window.getComputedStyle(p);
          const oy = st.overflowY;
          if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight + 2) {
              return p;
          }
          p = p.parentElement;
      }
      return null;
  }

  /**
   * Prefer a stable per-message index from the row or React ancestors (virtual list item index).
   * @param {HTMLElement} node
   * @returns {number|null}
   */
  function tryGetMessageOrdinal(node) {
      if (!node || node.nodeType !== 1) return null;
      const dataIdx = node.getAttribute('data-index');
      if (dataIdx != null && dataIdx !== '' && /^\d+$/.test(dataIdx)) return parseInt(dataIdx, 10);
      const withData = node.querySelector('[data-index]');
      if (withData) {
          const v = withData.getAttribute('data-index');
          if (v != null && /^\d+$/.test(v)) return parseInt(v, 10);
      }
      const fiberKey = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
      if (!fiberKey) return null;
      let fiber = node[fiberKey];
      for (let depth = 0; depth < 80 && fiber; depth++) {
          const mp = fiber.memoizedProps;
          if (mp && typeof mp === 'object') {
              for (const k of ['index', 'messageIndex', 'msgIndex', 'order']) {
                  const v = mp[k];
                  if (typeof v === 'number' && Number.isFinite(v)) return v;
              }
          }
          fiber = fiber.return;
      }
      return null;
  }

  function hashString(s) {
      let h = 0;
      for (let i = 0; i < s.length; i++) {
          h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      }
      return String(h);
  }

  function showVirtualListSweepNotice() {
      let el = document.getElementById('ds-exporter-sweep-notice');
      if (!el) {
          el = document.createElement('div');
          el.id = 'ds-exporter-sweep-notice';
          el.className = 'ds-exporter-sweep-notice ds-exporter-notice-panel';
          el.setAttribute('role', 'status');
          el.setAttribute('aria-live', 'polite');
          document.body.appendChild(el);
      }
      el.className = 'ds-exporter-sweep-notice ds-exporter-notice-panel';
      el.textContent = 'Loading entire conversation for export…';
      el.classList.add('ds-exporter-sweep-notice--visible');
  }

  function hideVirtualListSweepNotice() {
      const el = document.getElementById('ds-exporter-sweep-notice');
      if (el) el.classList.remove('ds-exporter-sweep-notice--visible');
  }

  /**
   * Strip controls from a cloned message row (print + PNG). KaTeX injects a MathML copy for
   * accessibility; html2canvas draws both, so formulas look duplicated unless .katex-mathml is removed.
   * @param {HTMLElement} clone
   */
  function stripCloneForPrintOrCapture(clone) {
      [
          'button',
          'input',
          'a[role="button"]',
          '.ds-message-feedback-container',
          '.eb23581b.dfa60d66',
          '[class*="message-actions"]',
          '[class*="MessageFeedback"]',
          '[class*="message-feedback"]',
          '[class*="message-footer"]',
          '[class*="MessageFooter"]',
          '[class*="ds-think-header"]',
          '[class*="ThinkHeader"]',
          '[class*="think-header"]',
          config.searchHintSelector,
      ].forEach(selector => {
          clone.querySelectorAll(selector).forEach(el => el.remove());
      });
      clone.querySelectorAll('.katex-mathml').forEach(el => el.remove());
      clone.querySelectorAll('.katex annotation').forEach(el => el.remove());
      clone.querySelectorAll('.katex-display').forEach(mathEl => {
          mathEl.style.transform = 'none';
          mathEl.style.position = 'relative';
      });
  }

  /**
   * KaTeX draws formulas with SVG paths; html2canvas often inherits dark-theme stroke/fill, so math
   * looks faint on a white PNG. Force visible strokes before rasterizing.
   * @param {HTMLElement} root
   */
  function applyPngKatexSvgFixes(root) {
      const ink = '#0d0d0d';
      root.querySelectorAll('.katex svg').forEach(svg => {
          svg.style.color = ink;
          svg.style.fill = ink;
          svg.style.stroke = ink;
          svg.style.opacity = '1';
      });
      root.querySelectorAll('.katex svg path, .katex svg line, .katex svg rect').forEach(el => {
          el.setAttribute('fill', ink);
          el.setAttribute('stroke', ink);
          el.style.fill = ink;
          el.style.stroke = ink;
      });
  }

  /**
   * DeepSeek’s stylesheet keys off `data-ds-dark-theme` on `html` / `body` (see site CSS variables).
   * PNG export clones live rows; with dark mode on, bubbles and code headers pick up dark inline styles.
   * Temporarily clear that attribute so the app paints in light theme before we sweep and rasterize,
   * then restore the user’s preference in `finally`.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async function withTemporaryLightThemeForCapture(fn) {
      /** @type {HTMLElement[]} */
      const hadDark = [];
      for (const el of [document.documentElement, document.body]) {
          if (el.hasAttribute('data-ds-dark-theme')) {
              hadDark.push(el);
          }
      }
      const stripDeepSeekDarkThemeAttr = () => {
          document.documentElement.removeAttribute('data-ds-dark-theme');
          document.body.removeAttribute('data-ds-dark-theme');
      };
      stripDeepSeekDarkThemeAttr();
      try {
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
          await new Promise(r => setTimeout(r, 280));
          stripDeepSeekDarkThemeAttr();
          return await fn();
      } finally {
          hadDark.forEach(el => el.setAttribute('data-ds-dark-theme', ''));
      }
  }

  /**
   * Builds a wrapper with User / Assistant / Thought Process headings around a deep-cloned row
   * so print uses the site-rendered DOM (markdown, math, code) instead of plain-text HTML.
   * @param {HTMLElement} node - live row from the virtual list
   * @returns {HTMLElement|null}
   */
  function buildPrintTurnWrapper(node) {
      const clone = node.cloneNode(true);
      stripCloneForPrintOrCapture(clone);

      const wrap = document.createElement('div');
      wrap.className = 'ds-exporter-print-turn';

      const userMessage = getUserMessage(node);
      if (userMessage != null) {
          const h2 = document.createElement('h2');
          h2.className = 'ds-exporter-print-role';
          h2.textContent = config.userHeader;
          wrap.appendChild(h2);
          wrap.appendChild(clone);
          return wrap;
      }

      if (isAIMessage(node)) {
          const h2 = document.createElement('h2');
          h2.className = 'ds-exporter-print-role';
          h2.textContent = config.assistantHeader;
          wrap.appendChild(h2);
          const think = clone.querySelector(config.thinkingChainSelector);
          if (think) {
              const h3 = document.createElement('h3');
              h3.className = 'ds-exporter-print-thoughts-heading';
              h3.textContent = config.thoughtsHeader;
              think.parentNode.insertBefore(h3, think);
          }
          wrap.appendChild(clone);
          return wrap;
      }

      return null;
  }

  /**
   * Scrolls the virtual list and collects one decorated clone per message (same coverage as markdown export).
   * @param {HTMLElement} chatContainer
   * @param {HTMLElement|null} scrollParent
   * @returns {Promise<HTMLElement[]>} wrappers in chat order
   */
  async function collectPrintTurnWrappers(chatContainer, scrollParent) {
      const settleMs = 80;
      const step = scrollParent ? Math.max(100, Math.floor(scrollParent.clientHeight * 0.3)) : 0;
      /** @type {Map<string, { orderKey: number, el: HTMLElement }>} */
      const best = new Map();

      const considerNode = (node, pos, i) => {
          const ord = tryGetMessageOrdinal(node);
          if (ord != null && Number.isFinite(ord) && best.has(`o:${ord}`)) {
              return;
          }
          const wrapper = buildPrintTurnWrapper(node);
          if (!wrapper) return;
          const orderKey = ord != null && Number.isFinite(ord) ? ord : pos * 10000 + i;
          const dedupeKey = ord != null && Number.isFinite(ord) ? `o:${ord}` : `h:${hashString(wrapper.textContent)}`;
          const prev = best.get(dedupeKey);
          if (!prev || orderKey < prev.orderKey) {
              best.set(dedupeKey, { orderKey, el: wrapper });
          }
      };

      if (!scrollParent || scrollParent.scrollHeight <= scrollParent.clientHeight + 4) {
          let i = 0;
          for (const node of chatContainer.children) {
              considerNode(node, 0, i);
              i++;
          }
      } else {
          // Start at the bottom and step upward so we do not jump scrollTop to 0 first; the thread
          // appears to scroll up through the viewport until the top is reached (same row coverage as top→down).
          showVirtualListSweepNotice();
          try {
              let scrollTop = null;
              for (let pass = 0; pass < 2000; pass++) {
                  const maxScroll = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
                  if (scrollTop === null) {
                      scrollTop = maxScroll;
                  }
                  const pos = Math.max(0, Math.min(scrollTop, maxScroll));
                  scrollParent.scrollTop = pos;
                  await new Promise(r => requestAnimationFrame(r));
                  await new Promise(r => setTimeout(r, settleMs));

                  let i = 0;
                  for (const node of chatContainer.children) {
                      considerNode(node, pos, i);
                      i++;
                  }

                  if (pos <= 0) break;
                  scrollTop = pos - step;
              }
          } finally {
              hideVirtualListSweepNotice();
          }
      }

      return Array.from(best.values())
          .sort((a, b) => a.orderKey - b.orderKey)
          .map(e => e.el);
  }

  /**
   * @param {HTMLElement} root
   * @param {HTMLElement[]} turns
   */
  function appendChatTitleAndTurns(root, turns) {
      const title = getChatTitle();
      const chatUrl = window.location.href;
      if (title && chatUrl) {
          const h1 = document.createElement('h1');
          h1.className = 'ds-exporter-print-title';
          const a = document.createElement('a');
          a.href = chatUrl;
          a.textContent = title;
          h1.appendChild(a);
          root.appendChild(h1);
      } else if (title) {
          const h1 = document.createElement('h1');
          h1.className = 'ds-exporter-print-title';
          h1.textContent = title;
          root.appendChild(h1);
      }

      turns.forEach((turn, idx) => {
          if (idx > 0) {
              const hr = document.createElement('hr');
              hr.className = 'ds-exporter-print-sep';
              root.appendChild(hr);
          }
          root.appendChild(turn);
      });
  }

  /**
   * DeepSeek-rendered DOM + section labels; opens the system print dialog (save as PDF).
   */
  async function printRenderedChat() {
      const chatContainer = document.querySelector(config.chatContainerSelector);
      if (!chatContainer) {
          alertExportFailed('Chat container not found. The page structure may have changed.');
          return;
      }

      const scrollParent = findScrollParent(chatContainer);
      const savedScroll = scrollParent ? scrollParent.scrollTop : 0;

      const turns = await collectPrintTurnWrappers(chatContainer, scrollParent);
      if (scrollParent) {
          scrollParent.scrollTop = savedScroll;
      }

      if (!turns.length) {
          alertExportFailed('No messages were found to print.');
          return;
      }

      const printRoot = document.createElement('div');
      printRoot.id = 'ds-exporter-print-root';

      appendChatTitleAndTurns(printRoot, turns);

      document.body.appendChild(printRoot);

      const cleanup = () => {
          printRoot.remove();
          window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 120000);

      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      window.print();
  }


  /**
   * Extracts and formats the AI's thinking chain as blockquotes
   * @param {HTMLElement} node - The DOM node containing the thinking chain
   * @param {boolean} [silent] - If true, do not alert on extraction failure (used while scrolling the virtual list)
   * @returns {string|null} Markdown formatted thinking chain with header or null if not found
   *
   * CRITICAL: This function MUST extract the raw markdown from React's internal state.
   * Converting HTML to markdown is fundamentally broken and loses formatting, LaTeX,
   * code blocks, and other essential content. The entire purpose of this script is
   * to get the original markdown before it's rendered to HTML.
   */
  function extractThinkingChain(node, silent) {
      // Prefer the inner ds-markdown within the thinking container as the base
      const markdownEl = node.querySelector('div.ds-markdown');
      const baseEl = markdownEl || node;

      const navFiber = navigateFiberPathFromElement(baseEl, config.thinkingContentPath);
      if (!navFiber || !navFiber.memoizedProps || !navFiber.memoizedProps.content) {
          if (!silent) {
              console.error('THINKING CHAIN BROKEN: Could not find memoizedProps.content at configured path');
              console.error('Please update config.thinkingContentPath using the BREAK_FIX_GUIDE.md');
              alertExportFailed('Could not read the thinking chain from the page (see console for details).');
          }
          return null;
      }

      const content = closeUnclosedFencedCodeBlocks(navFiber.memoizedProps.content);
      return `### ${config.thoughtsHeader}\n\n> ${content.split('\n').join('\n> ')}`;
  }

  /**
   * Extracts the final answer content from React fiber's memoizedProps
   * @param {HTMLElement} node - The DOM node containing the answer
   * @param {boolean} [silent] - If true, do not alert on extraction failure (used while scrolling the virtual list)
   * @returns {string|null} Raw markdown content or null if not found
   *
   * CRITICAL: This function MUST extract the raw markdown from React's internal state.
   * Converting HTML to markdown is fundamentally broken and loses formatting, LaTeX,
   * code blocks, and other essential content. The entire purpose of this script is
   * to get the original markdown before it's rendered to HTML.
   */
  function extractFinalAnswer(node, silent) {
      // Choose ds-markdown that is NOT inside the thinking container
      let answerNode = null;
      const candidates = node.querySelectorAll('div.ds-markdown');
      for (const el of candidates) {
          if (!el.closest(config.thinkingChainSelector)) { answerNode = el; break; }
      }
      if (!answerNode) {
          // Fallback to first ds-markdown
          answerNode = node.querySelector(config.finalAnswerSelector);
      }
      if (!answerNode) {
          console.debug('No answer node found');
          return null;
      }

      const navFiber = navigateFiberPathFromElement(answerNode, config.answerMarkdownPath);
      if (!navFiber || !navFiber.memoizedProps || !navFiber.memoizedProps.markdown) {
          if (!silent) {
              console.error('FINAL ANSWER BROKEN: Could not find memoizedProps.markdown at configured path');
              console.error('Please update config.answerMarkdownPath using the BREAK_FIX_GUIDE.md');
              alertExportFailed('Could not read assistant message markdown from the page (see console for details).');
          }
          return null;
      }

      return closeUnclosedFencedCodeBlocks(navFiber.memoizedProps.markdown);
  }

  /**
   * @param {HTMLElement} node
   * @param {{ silent?: boolean }} [options]
   * @returns {string|null}
   */
  function formatSingleMessageRow(node, options) {
      const silent = options && options.silent;
      const userMessage = getUserMessage(node);
      if (userMessage) {
          return `## ${config.userHeader}\n\n${userMessage}`;
      }
      if (!isAIMessage(node)) return null;
      let output = '';
      const searchHint = extractSearchOrThinking(node);
      if (searchHint) output += `${searchHint}\n\n`;

      const thinkingChainNode = node.querySelector(config.thinkingChainSelector);
      if (thinkingChainNode) {
          const thinkingChain = extractThinkingChain(thinkingChainNode, silent);
          if (thinkingChain) output += `${thinkingChain}\n\n`;
      }

      const finalAnswer = extractFinalAnswer(node, silent);
      if (finalAnswer) output += `${finalAnswer}\n\n`;
      if (!output.trim()) return null;
      return `## ${config.assistantHeader}\n\n${output.trim()}`;
  }

  /**
   * Walks scrollTop through the chat so every virtualized row mounts at least once; merges rows by
   * `tryGetMessageOrdinal` when present, otherwise by scroll position + content hash.
   * Sweeps bottom → top so the list scrolls upward through the viewport (no initial jump to scrollTop 0).
   * @param {HTMLElement} scrollParent
   * @param {HTMLElement} chatContainer
   * @returns {Promise<string[]>}
   */
  async function collectMessagesAcrossVirtualList(scrollParent, chatContainer) {
      // Tuned on chat.deepseek.com: virtual rows need a tick to mount after scrollTop changes.
      const settleMs = 80;
      const step = Math.max(100, Math.floor(scrollParent.clientHeight * 0.3));
      /** @type {Map<string, { orderKey: number, text: string }>} */
      const best = new Map();

      showVirtualListSweepNotice();
      try {
          let scrollTop = null;
          for (let pass = 0; pass < 2000; pass++) {
              const maxScroll = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
              if (scrollTop === null) {
                  scrollTop = maxScroll;
              }
              const pos = Math.max(0, Math.min(scrollTop, maxScroll));
              scrollParent.scrollTop = pos;
              await new Promise(r => requestAnimationFrame(r));
              await new Promise(r => setTimeout(r, settleMs));

              let i = 0;
              for (const node of chatContainer.children) {
                  const ord = tryGetMessageOrdinal(node);
                  // Rows reappear across many scroll steps; skip fiber extraction once we have this ordinal.
                  if (ord != null && Number.isFinite(ord) && best.has(`o:${ord}`)) {
                      i++;
                      continue;
                  }

                  const text = formatSingleMessageRow(node, { silent: true });
                  if (!text) {
                      i++;
                      continue;
                  }
                  const orderKey = ord != null && Number.isFinite(ord) ? ord : pos * 10000 + i;
                  const dedupeKey = ord != null && Number.isFinite(ord) ? `o:${ord}` : `h:${hashString(text)}`;
                  const prev = best.get(dedupeKey);
                  if (!prev || orderKey < prev.orderKey) {
                      best.set(dedupeKey, { orderKey, text });
                  }
                  i++;
              }

              if (pos <= 0) break;
              scrollTop = pos - step;
          }

          return Array.from(best.values())
              .sort((a, b) => a.orderKey - b.orderKey)
              .map(e => e.text);
      } finally {
          hideVirtualListSweepNotice();
      }
  }

  /**
   * Collects and formats all messages in the chat in chronological order.
   * When the chat uses a virtual list, scrolls through the thread so off-screen messages are included.
   * @returns {Promise<string[]>} Array of markdown formatted messages
   */
  async function getOrderedMessages() {
      const chatContainer = document.querySelector(config.chatContainerSelector);
      if (!chatContainer) {
          console.error('Chat container not found');
          return [];
      }

      const scrollParent = findScrollParent(chatContainer);
      const needsSweep = scrollParent && scrollParent.scrollHeight > scrollParent.clientHeight + 4;

      if (!needsSweep) {
          const messages = [];
          for (const node of chatContainer.children) {
              const formatted = formatSingleMessageRow(node, { silent: false });
              if (formatted) messages.push(formatted);
          }
          return messages;
      }

      const saved = scrollParent.scrollTop;
      try {
          return await collectMessagesAcrossVirtualList(scrollParent, chatContainer);
      } finally {
          scrollParent.scrollTop = saved;
      }
  }

  /**
   * Extracts the chat title from the page
   * @returns {string|null} The chat title if found, null otherwise
   */
  function getChatTitle() {
      const titleElement = document.querySelector(config.titleSelector);
      return titleElement ? titleElement.textContent.trim() : null;
  }

  /**
   * Generates the complete markdown content from all messages
   * @returns {Promise<string>} Complete markdown formatted chat history
   */
  async function generateMdContent() {
      const messages = await getOrderedMessages();
      const title = getChatTitle();
      const chatUrl = window.location.href;
      const titleForLink = title ? title.replace(/\\/g, '\\\\').replace(/]/g, '\\]') : '';
      let content = title && chatUrl ? `# [${titleForLink}](${chatUrl})\n\n` : title ? `# ${title}\n\n` : '';
      content += messages.length ? messages.join('\n\n---\n\n') : '';

      // Convert LaTeX formats only if enabled
      if (preferences.convertLatexDelimiters) {
          // Use replacement functions to properly handle newlines and whitespace
          content = content
              // Inline math: \( ... \) → $ ... $
              .replace(/\\\(\s*(.*?)\s*\\\)/g, (match, group) => `$${group}$`)

              // Display math: \[ ... \] → $$ ... $$
              .replace(/\\\[([\s\S]*?)\\\]/g, (match, group) => `$$${group}$$`);
      }

      return content;
  }

  /**
   * Creates a filename-safe version of a string
   * @param {string} str - The string to make filename-safe
   * @param {number} maxLength - Maximum length of the resulting string
   * @returns {string} A filename-safe version of the input string
   */
  function makeFilenameSafe(str, maxLength = 50) {
      if (!str) return '';
      return str
          .replace(/[^a-zA-Z0-9-_\s]/g, '') // Remove special characters
          .replace(/\s+/g, '_')             // Replace spaces with underscores
          .slice(0, maxLength)              // Truncate to maxLength
          .replace(/_+$/, '')               // Remove trailing underscores
          .trim();
  }

  /**
   * Generates a filename-safe ISO 8601 timestamp
   * @returns {string} Formatted timestamp YYYY-MM-DD_HH_MM_SS
   */
  function getFormattedTimestamp() {
      const now = new Date();
      return now.toISOString()
          .replace(/[T:]/g, '_')  // Replace T and : with _
          .replace(/\..+/, '');   // Remove milliseconds and timezone
  }

  // =====================
  // Export functions
  // =====================
  /**
   * Exports the chat history as a markdown file
   * Handles math expressions and creates a downloadable .md file
   */
  function exportMarkdown() {
      generateMdContent()
          .then((mdContent) => {
              if (!mdContent) {
                  alertExportFailed('No content was produced. Open a chat and try again.');
                  return;
              }

              const title = getChatTitle();
              const safeTitle = makeFilenameSafe(title, 30);
              const titlePart = safeTitle ? `_${safeTitle}` : '';

              const blob = new Blob([mdContent], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${config.exportFileName}${titlePart}_${getFormattedTimestamp()}.md`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 5000);
          })
          .catch((err) => {
              console.error('Markdown export failed:', err);
              alertExportFailed(err && err.message ? err.message : String(err));
          });
  }

  /**
   * Print / Save as PDF: sweeps the virtual list (like markdown export), injects User/Assistant/Thought labels,
   * and prints cloned live DOM so code/math match the site. Uses @media print to hide the rest of the page and our overlay.
   */
  function exportPDF() {
      printRenderedChat().catch((err) => {
          console.error('Print failed:', err);
          alertExportFailed(err && err.message ? err.message : String(err));
      });
  }

  /**
   * PNG: same pipeline as print/PDF — virtual-list sweep, User/Assistant/Thought labels, rendered DOM.
   * Built in the main document (not a blank iframe) so DeepSeek + KaTeX CSS apply; strip MathML duplicates for clean math.
   */
  async function exportPNG() {
      if (__exportPNGLock) return;
      __exportPNGLock = true;

      const chatContainer = document.querySelector(config.chatContainerSelector);
      if (!chatContainer) {
          alertExportFailed('Chat container not found. The page structure may have changed.');
          __exportPNGLock = false;
          return;
      }

      const scrollParent = findScrollParent(chatContainer);
      const savedScroll = scrollParent ? scrollParent.scrollTop : 0;
      let pngRoot = null;

      try {
          await withTemporaryLightThemeForCapture(async () => {
              const turns = await collectPrintTurnWrappers(chatContainer, scrollParent);
              if (scrollParent) {
                  scrollParent.scrollTop = savedScroll;
              }

              if (!turns.length) {
                  alertExportFailed('No messages were found to export.');
                  return;
              }

              pngRoot = document.createElement('div');
              pngRoot.id = 'ds-exporter-png-root';
              appendChatTitleAndTurns(pngRoot, turns);

              pngRoot.style.cssText = [
                  'position:fixed',
                  'left:-9999px',
                  'top:0',
                  'width:800px',
                  'box-sizing:border-box',
                  'background:#fff',
                  'z-index:-1',
                  'overflow:visible',
                  'margin:0',
                  'padding:20px',
              ].join(';');

              document.body.appendChild(pngRoot);

              applyPngKatexSvgFixes(pngRoot);

              await Promise.all([document.fonts.ready, new Promise(r => setTimeout(r, 400))]);

              const canvas = await html2canvas(pngRoot, {
                  scale: 2,
                  useCORS: true,
                  logging: false,
                  backgroundColor: '#ffffff',
                  onclone(clonedDoc) {
                      const cap = clonedDoc.getElementById('ds-exporter-png-root');
                      if (!cap) return;
                      cap.querySelectorAll('.katex-mathml').forEach(n => n.remove());
                      cap.querySelectorAll('.katex annotation').forEach(n => n.remove());
                      cap.querySelectorAll('.katex').forEach(k => {
                          k.style.color = '#0d0d0d';
                          k.style.setProperty('-webkit-text-fill-color', '#0d0d0d');
                      });
                      applyPngKatexSvgFixes(cap);
                  },
              });

              if (pngRoot.parentNode) {
                  pngRoot.remove();
              }
              pngRoot = null;

              await new Promise((resolve, reject) => {
                  canvas.toBlob(blob => {
                      if (!blob) {
                          reject(new Error('PNG export produced an empty image.'));
                          return;
                      }
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const title = getChatTitle();
                      const safeTitle = makeFilenameSafe(title, 30);
                      const titlePart = safeTitle ? `_${safeTitle}` : '';
                      a.download = `${config.exportFileName}${titlePart}_${getFormattedTimestamp()}.png`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 5000);
                      resolve();
                  }, 'image/png');
              });
          });
      } catch (err) {
          console.error('PNG export failed:', err);
          alertExportFailed(err.message || String(err));
      } finally {
          if (pngRoot && pngRoot.parentNode) {
              pngRoot.remove();
          }
          __exportPNGLock = false;
      }
  }

  // =====================
  // Diagnostic (for BREAK_FIX_GUIDE / Cursor chat)
  // =====================
  /**
   * Collects DOM and config state into a string you can paste into Cursor chat
   * so the AI can suggest updated selectors when the site changes.
   */
  function runDiagnostic() {
      const lines = [];
      lines.push('--- DeepSeek Chat Exporter diagnostic (paste this into Cursor chat) ---');
      lines.push('');
      lines.push('## Current config');
      lines.push('```json');
      lines.push(JSON.stringify({
          chatContainerSelector: config.chatContainerSelector,
          userMessageSelector: config.userMessageSelector,
          aiClassPrefix: config.aiClassPrefix,
          aiReplyContainer: config.aiReplyContainer,
          searchHintSelector: config.searchHintSelector,
          thinkingChainSelector: config.thinkingChainSelector,
          finalAnswerSelector: config.finalAnswerSelector,
          titleSelector: config.titleSelector,
          answerMarkdownPath: config.answerMarkdownPath,
          thinkingContentPath: config.thinkingContentPath,
      }, null, 2));
      lines.push('```');
      lines.push('');
      lines.push('## Theme (PNG export briefly clears `data-ds-dark-theme` on html/body)');
      lines.push(`- document.documentElement: ${document.documentElement.hasAttribute('data-ds-dark-theme') ? 'has data-ds-dark-theme' : 'no data-ds-dark-theme'}`);
      lines.push(`- document.body: ${document.body.hasAttribute('data-ds-dark-theme') ? 'has data-ds-dark-theme' : 'no data-ds-dark-theme'}`);
      lines.push('');

      const container = document.querySelector(config.chatContainerSelector);
      lines.push('## Container (.ds-virtual-list-visible-items or configured selector)');
      if (!container) {
          lines.push('Not found.');
      } else {
          lines.push('- className: ' + container.className);
          lines.push('- childCount: ' + container.children.length);
          const firstFew = [];
          for (let i = 0; i < Math.min(5, container.children.length); i++) {
              const el = container.children[i];
              firstFew.push({ index: i, tag: el.tagName, class: el.className, textPreview: el.textContent.trim().slice(0, 60) });
          }
          lines.push('- firstFewChildren: ' + JSON.stringify(firstFew, null, 2));
      }
      lines.push('');

      const userMatch = document.querySelector(config.userMessageSelector);
      lines.push('## User message selector match');
      lines.push(config.userMessageSelector + ' → ' + (userMatch ? 'found (class: ' + userMatch.className + ')' : 'null'));
      lines.push('(Script also uses node.matches(selector) so the row itself can be the content.)');
      lines.push('');

      const walk = (el) => {
          if (el.nodeType !== 1) return null;
          if (el.textContent.trim() === 'hi') return el;
          for (const c of el.children) { const f = walk(c); if (f) return f; }
          return null;
      };
      const hiEl = walk(document.body);
      lines.push('## Element with textContent "hi" (user message probe)');
      if (hiEl) {
          const chain = [];
          let p = hiEl;
          for (let i = 0; i < 6 && p; i++) {
              p = p.parentElement;
              if (p) chain.push(p.tagName + '.' + (p.className || '').trim().split(/\s+/).filter(Boolean).join('.'));
          }
          lines.push('- tag: ' + hiEl.tagName + ', class: ' + hiEl.className);
          lines.push('- ancestor chain (tag.classNames): ' + chain.join(' <- '));
      } else {
          lines.push('Not found (scroll to top of chat so "hi" is in view and run again).');
      }
      lines.push('');

      const aiBlocks = document.querySelectorAll('.' + config.aiClassPrefix);
      lines.push('## AI message blocks');
      lines.push('Selector ".' + config.aiClassPrefix + '" count: ' + aiBlocks.length);
      if (aiBlocks.length) lines.push('First AI block class: ' + aiBlocks[0].className);
      lines.push('');

      lines.push('## Thinking extraction health (first AI blocks)');
      if (aiBlocks.length === 0) {
          lines.push('No AI blocks found (so thinking extraction health can’t be evaluated).');
      } else {
          const maxToCheck = Math.min(2, aiBlocks.length);
          for (let i = 0; i < maxToCheck; i++) {
              const ai = aiBlocks[i];
              const thinkingNode = ai.querySelector(config.thinkingChainSelector);
              const thinkingNodesCount = ai.querySelectorAll(config.thinkingChainSelector).length;
              const markdownEl = thinkingNode ? thinkingNode.querySelector('div.ds-markdown') : null;
              const baseEl = markdownEl || thinkingNode || ai;
              let ok = false;
              let preview = null;
              const navFiber = navigateFiberPathFromElement(baseEl, config.thinkingContentPath);
              if (navFiber && navFiber.memoizedProps && typeof navFiber.memoizedProps.content === 'string') {
                  ok = true;
                  preview = navFiber.memoizedProps.content.slice(0, 80);
              }
              lines.push(
                  [
                      `AI[${i}]`,
                      `thinkingChainSelector=${config.thinkingChainSelector}`,
                      `thinkingNodeFound=${!!thinkingNode}`,
                      `thinkingNodesInAI=${thinkingNodesCount}`,
                      `memoizedProps.content@pathFound=${ok}`,
                      preview ? `contentPreview="${preview.replace(/\\n/g, ' ').trim()}"` : '',
                  ]
                      .filter(Boolean)
                      .join(' | ')
              );
          }
      }
      lines.push('');

      lines.push('## Final answer extraction health (first AI blocks)');
      if (aiBlocks.length === 0) {
          lines.push('No AI blocks found (so final answer extraction health can’t be evaluated).');
      } else {
          const maxToCheck = Math.min(2, aiBlocks.length);
          for (let i = 0; i < maxToCheck; i++) {
              const ai = aiBlocks[i];
              const dsMarkdownCount = ai.querySelectorAll('div.ds-markdown').length;

              // Mirror extractFinalAnswer(): pick the first ds-markdown not inside the thinking container.
              let answerNode = null;
              const candidates = ai.querySelectorAll('div.ds-markdown');
              for (const el of candidates) {
                  if (!el.closest(config.thinkingChainSelector)) {
                      answerNode = el;
                      break;
                  }
              }
              if (!answerNode) answerNode = ai.querySelector(config.finalAnswerSelector);

              const baseEl = answerNode || ai;
              let ok = false;
              let preview = null;
              const navFiber = navigateFiberPathFromElement(baseEl, config.answerMarkdownPath);
              if (navFiber && navFiber.memoizedProps && typeof navFiber.memoizedProps.markdown === 'string') {
                  ok = true;
                  preview = navFiber.memoizedProps.markdown.slice(0, 80);
              }

              lines.push(
                  [
                      `AI[${i}]`,
                      `finalAnswerSelector=${config.finalAnswerSelector}`,
                      `ds-markdown count in AI=${dsMarkdownCount}`,
                      `answerNodeFound=${!!answerNode}`,
                      `memoizedProps.markdown@pathFound=${ok}`,
                      preview ? `markdownPreview="${preview.replace(/\\n/g, ' ').trim()}"` : '',
                  ]
                      .filter(Boolean)
                      .join(' | ')
              );
          }
      }
      lines.push('');

      if (container && container.parentElement) {
          const p = container.parentElement;
          lines.push('## Virtual list parent');
          lines.push('- tag: ' + p.tagName + ', class: ' + p.className + ', childCount: ' + p.children.length);
      }
      lines.push('');

      const markdownEls = document.querySelectorAll('.ds-markdown');
      lines.push('## .ds-markdown elements');
      lines.push('Count: ' + markdownEls.length);
      const samples = [];
      for (let i = 0; i < Math.min(5, markdownEls.length); i++) {
          const el = markdownEls[i];
          samples.push({ class: el.className, parentClass: el.parentElement ? el.parentElement.className : null, text: el.textContent.trim().slice(0, 50) });
      }
      if (samples.length) lines.push(JSON.stringify(samples, null, 2));
      lines.push('');
      lines.push('## React fiber paths (if extraction is broken)');
      lines.push('In DevTools: right-click the final answer markdown block → Inspect. In console run: __scanReact($0, \'markdown\').');
      lines.push('Then right-click the thinking markdown block (inside thinking area) → Inspect. Run: __scanReact($0, \'content\').');
      lines.push('Paste the returned path strings so the script config can be updated.');
      lines.push('---');

      return lines.join('\n');
  }

  function copyDiagnostic() {
      const report = runDiagnostic();
      navigator.clipboard.writeText(report).then(() => {
          alert('Diagnostic copied to clipboard. Paste it into Cursor chat so the AI can suggest updated selectors.');
      }).catch(() => {
          prompt('Copy this diagnostic and paste into Cursor chat:', report);
      });
  }

  // =====================
  // Create Export Menu
  // =====================
  /**
   * Creates and attaches the export menu buttons to the page
   */
  function createExportMenu() {
      // Create main menu
      const menu = document.createElement("div");
      menu.className = "ds-exporter-menu";
      menu.innerHTML = `
          <button class="export-btn" id="md-btn" title="Export as Markdown">➡️📝</button>
          <button class="export-btn" id="pdf-btn" title="Print / PDF (rendered chat + labels, full thread)">➡️🖨️</button>
          <button class="export-btn" id="png-btn" title="Export as PNG (full thread, like print)">➡️🖼️</button>
          <button class="settings-btn" id="settings-btn" title="Settings">⚙️</button>
      `;

      // Create settings panel
      const settingsPanel = document.createElement("div");
      settingsPanel.className = "ds-settings-panel";
      settingsPanel.innerHTML = `
          <div class="ds-settings-row">
              <label class="switch">
                  <input type="checkbox" id="latex-toggle" ${preferences.convertLatexDelimiters ? 'checked' : ''}>
                  <span class="slider"></span>
              </label>
              <span>Convert to $ LaTeX Delimiters</span>
          </div>
          <div class="ds-settings-row">
              <button type="button" id="diagnostic-btn" style="padding:6px 10px;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;">Copy diagnostic for Cursor</button>
          </div>
      `;

      // Add event listeners
      menu.querySelector("#md-btn").addEventListener("click", exportMarkdown);
      menu.querySelector("#pdf-btn").addEventListener("click", exportPDF);
      menu.querySelector("#png-btn").addEventListener("click", exportPNG);

      // Settings button toggle
      menu.querySelector("#settings-btn").addEventListener("click", () => {
          settingsPanel.classList.toggle("visible");
      });

      // LaTeX toggle switch
      settingsPanel.querySelector("#latex-toggle").addEventListener("change", (e) => {
          preferences.convertLatexDelimiters = e.target.checked;
          GM_setValue('convertLatexDelimiters', e.target.checked);
      });

      settingsPanel.querySelector("#diagnostic-btn").addEventListener("click", copyDiagnostic);

      // Close settings when clicking outside
      document.addEventListener("click", (e) => {
          if (!settingsPanel.contains(e.target) &&
              !menu.querySelector("#settings-btn").contains(e.target)) {
              settingsPanel.classList.remove("visible");
          }
      });

      document.body.appendChild(menu);
      document.body.appendChild(settingsPanel);
  }

  // =====================
  // Styles
  // =====================
  GM_addStyle(`
  .ds-exporter-menu {
      position: fixed;
      top: 10px;
      right: 25px;
      z-index: 999999;
      background: #ffffff;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
  }

  .export-btn {
      background: #f8f9fa;
      color: #333;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 4px 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
      min-width: 45px;
  }

  .export-btn:hover {
      background: #e9ecef;
  }

  .export-btn:active {
      background: #dee2e6;
  }

  /* Settings panel styles */
  .ds-settings-panel {
      position: fixed;
      top: 10px;
      right: 95px;
      z-index: 999998;
      background: #ffffff;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      padding: 12px;
      display: none;
      color: #333;
      min-width: 200px;
  }

  .ds-settings-panel.visible {
      display: block;
  }

  .ds-settings-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 4px 0;
      color: #333;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      white-space: nowrap;
  }

  /* Toggle switch styles */
  .switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 20px;
  }

  .switch input {
      opacity: 0;
      width: 0;
      height: 0;
  }

  .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: .4s;
      border-radius: 20px;
  }

  .slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 2px;
      bottom: 2px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
  }

  input:checked + .slider {
      background-color: #2196F3;
  }

  input:checked + .slider:before {
      transform: translateX(20px);
  }

  .settings-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      font-size: 16px;
      color: #666;
  }

  .settings-btn:hover {
      color: #333;
  }

  /* Screen: print buffer is not shown. Print: see @media print below. */
  #ds-exporter-print-root {
      display: none;
  }

  #ds-exporter-print-root .ds-exporter-print-title,
  #ds-exporter-png-root .ds-exporter-print-title {
      font-size: 1.35em;
      margin: 0 0 1em 0;
  }

  #ds-exporter-print-root .ds-exporter-print-title a,
  #ds-exporter-png-root .ds-exporter-print-title a {
      color: #0066cc;
      text-decoration: none;
  }

  #ds-exporter-print-root .ds-exporter-print-role,
  #ds-exporter-png-root .ds-exporter-print-role {
      font-size: 1.1em;
      color: #2c3e50;
      border-bottom: 1px solid #eee;
      padding-bottom: 0.2em;
      margin: 0.75em 0 0.5em 0;
  }

  #ds-exporter-print-root .ds-exporter-print-thoughts-heading,
  #ds-exporter-png-root .ds-exporter-print-thoughts-heading {
      font-size: 1em;
      color: #555;
      margin: 0.75em 0 0.35em 0;
  }

  #ds-exporter-print-root .ds-exporter-print-sep,
  #ds-exporter-png-root .ds-exporter-print-sep {
      border: 0;
      border-top: 1px solid #ddd;
      margin: 1.25em 0;
  }

  @media print {
      body * {
          visibility: hidden !important;
      }
      #ds-exporter-print-root,
      #ds-exporter-print-root * {
          visibility: visible !important;
      }
      #ds-exporter-print-root {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 12px 16px !important;
          box-sizing: border-box !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
      }
      .ds-exporter-menu,
      .ds-settings-panel {
          display: none !important;
          visibility: hidden !important;
      }
      #ds-exporter-sweep-notice,
      #ds-exporter-error-notice {
          display: none !important;
          visibility: hidden !important;
      }
  }

  /* Shared dark card with the “loading entire conversation” toast (sweep uses it alone; error nests it). */
  .ds-exporter-notice-panel {
      max-width: min(640px, 90vw);
      padding: 28px 36px;
      background: rgba(33, 37, 41, 0.94);
      color: #f8f9fa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.45;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
  }

  .ds-exporter-sweep-notice {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000000;
      font-size: 20px;
      display: none;
      align-items: center;
      justify-content: center;
      text-align: center;
      pointer-events: none;
  }

  .ds-exporter-sweep-notice.ds-exporter-sweep-notice--visible {
      display: flex;
  }

  .ds-exporter-error-notice {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000001;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.45);
      pointer-events: auto;
  }

  .ds-exporter-error-notice.ds-exporter-error-notice--visible {
      display: flex;
  }

  .ds-exporter-error-notice__panel {
      text-align: left;
      font-size: 16px;
      line-height: 1.5;
      max-height: min(90vh, 100%);
      overflow: auto;
  }

  .ds-exporter-error-notice__title {
      margin: 0 0 14px 0;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.35;
  }

  .ds-exporter-error-notice__detail {
      margin: 0 0 12px 0;
      font-size: 15px;
      color: #ffc9a8;
  }

  .ds-exporter-error-notice__hint {
      margin: 0 0 14px 0;
      font-size: 14px;
      color: #ced4da;
  }

  .ds-exporter-error-notice__linkline {
      margin: 0 0 20px 0;
      font-size: 15px;
  }

  .ds-exporter-error-notice__linkline a {
      color: #7ec8ff;
      text-decoration: underline;
  }

  .ds-exporter-error-notice__linkline a:hover {
      color: #b8ddff;
  }

  .ds-exporter-error-notice__dismiss {
      display: block;
      margin-left: auto;
      padding: 8px 22px;
      font-size: 15px;
      cursor: pointer;
      border: none;
      border-radius: 8px;
      background: #e8c9a0;
      color: #1a1208;
      font-weight: 600;
  }

  .ds-exporter-error-notice__dismiss:hover {
      background: #f0d4b0;
  }

  .ds-exporter-error-notice__dismiss:focus-visible {
      outline: 2px solid #7ec8ff;
      outline-offset: 2px;
  }
`);

  // =====================
  // Initialize
  // =====================
  /**
   * Initializes the exporter by waiting for the chat container to be ready
   * and then creating the export menu
   */
  function init() {
      const checkInterval = setInterval(() => {
          if (document.querySelector(config.chatContainerSelector)) {
              clearInterval(checkInterval);
              createExportMenu();
          }
      }, 500);
  }

  init();
})();
