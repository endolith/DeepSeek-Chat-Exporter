// ==UserScript==
// @name         DeepSeek Chat Exporter (Markdown & PDF & PNG)
// @namespace    http://tampermonkey.net/
// @version      1.7.2
// @description  Export DeepSeek chat history to Markdown, PDF and PNG formats
// @author       HSyuf/Blueberrycongee/endolith
// @match        https://chat.deepseek.com/*
// @grant        GM_addStyle
// @grant        GM_download
// @license      MIT
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// ==/UserScript==

(function () {
  'use strict';

  // =====================
  // Configuration
  // =====================
  const config = {
      chatContainerSelector: '.dad65929', // Chat container
      userClassPrefix: 'fa81',             // User message class prefix
      aiClassPrefix: 'f9bf7997',           // AI message related class prefix
      aiReplyContainer: 'edb250b1',        // Main container for AI replies
      searchHintSelector: '.a6d716f5.db5991dd', // Search/thinking time
      thinkingChainSelector: '.e1675d8b',  // Thinking chain
      finalAnswerSelector: 'div.ds-markdown.ds-markdown--block', // Final answer
      exportFileName: 'DeepSeek_Chat_Export',
  };

  let __exportPNGLock = false;  // Global lock to prevent duplicate clicks

  // =====================
  // Tool functions
  // =====================
  function isUserMessage(node) {
      return node.classList.contains(config.userClassPrefix);
  }

  function isAIMessage(node) {
      return node.classList.contains(config.aiClassPrefix);
  }

  function extractSearchOrThinking(node) {
      const hintNode = node.querySelector(config.searchHintSelector);
      return hintNode ? `**${hintNode.textContent.trim()}**` : null;
  }

  function extractThinkingChain(node) {
      const thinkingNode = node.querySelector(config.thinkingChainSelector);
      return thinkingNode ? `**思考链**\n${thinkingNode.textContent.trim()}` : null;
  }

  function extractFinalAnswer(node) {
      const answerNode = node.querySelector(config.finalAnswerSelector);
      if (!answerNode) return null;

      let answerContent = '';
      const elements = answerNode.querySelectorAll('.ds-markdown--block p, .ds-markdown--block h3, .katex-display.ds-markdown-math, hr');

      elements.forEach((element) => {
          if (element.tagName.toLowerCase() === 'p') {
              element.childNodes.forEach((childNode) => {
                  if (childNode.nodeType === Node.TEXT_NODE) {
                      answerContent += childNode.textContent.trim();
                  } else if (childNode.classList && childNode.classList.contains('katex')) {
                      const tex = childNode.querySelector('annotation[encoding="application/x-tex"]');
                      if (tex) {
                          answerContent += `$$$${tex.textContent.trim()}$$$`;
                      }
                  } else if (childNode.tagName === 'STRONG') {
                      answerContent += `**${childNode.textContent.trim()}**`;
                  } else if (childNode.tagName === 'EM') {
                      answerContent += `*${childNode.textContent.trim()}*`;
                  } else if (childNode.tagName === 'A') {
                      const href = childNode.getAttribute('href');
                      answerContent += `[${childNode.textContent.trim()}](${href})`;
                  } else if (childNode.nodeType === Node.ELEMENT_NODE) {
                      answerContent += childNode.textContent.trim();
                  }
              });
              answerContent += '\n\n';
          }
          else if (element.tagName.toLowerCase() === 'h3') {
              answerContent += `### ${element.textContent.trim()}\n\n`;
          }
          else if (element.classList.contains('katex-display')) {
              const tex = element.querySelector('annotation[encoding="application/x-tex"]');
              if (tex) {
                  answerContent += `$$${tex.textContent.trim()}$$\n\n`;
              }
          }
          else if (element.tagName.toLowerCase() === 'hr') {
              answerContent += '\n---\n';
          }
      });

      return `**正式回答**\n${answerContent.trim()}`;
  }

  function getOrderedMessages() {
      const messages = [];
      const chatContainer = document.querySelector(config.chatContainerSelector);
      if (!chatContainer) {
          console.error('Chat container not found');
          return messages;
      }

      for (const node of chatContainer.children) {
          if (isUserMessage(node)) {
              messages.push(`**用户：**\n${node.textContent.trim()}`);
          } else if (isAIMessage(node)) {
              let output = '';
              const aiReplyContainer = node.querySelector(`.${config.aiReplyContainer}`);
              if (aiReplyContainer) {
                  const searchHint = extractSearchOrThinking(aiReplyContainer);
                  if (searchHint) output += `${searchHint}\n\n`;
                  const thinkingChain = extractThinkingChain(aiReplyContainer);
                  if (thinkingChain) output += `${thinkingChain}\n\n`;
              } else {
                  const searchHint = extractSearchOrThinking(node);
                  if (searchHint) output += `${searchHint}\n\n`;
              }
              const finalAnswer = extractFinalAnswer(node);
              if (finalAnswer) output += `${finalAnswer}\n\n`;
              if (output.trim()) {
                  messages.push(output.trim());
              }
          }
      }
      return messages;
  }

  function generateMdContent() {
      const messages = getOrderedMessages();
      return messages.length ? messages.join('\n\n---\n\n') : '';
  }

  // =====================
  // Export functions
  // =====================
  function exportMarkdown() {
      const mdContent = generateMdContent();
      if (!mdContent) {
          alert("No chat history found!");
          return;
      }

      const fixedMdContent = mdContent.replace(/(\*\*.*?\*\*)/g, '<strong>$1</strong>')
          .replace(/\(\s*([^)]*)\s*\)/g, '\\($1\\)')
          .replace(/\$\$\s*([^$]*)\s*\$\$/g, '$$$1$$');

      const blob = new Blob([fixedMdContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.exportFileName}_${Date.now()}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportPDF() {
      const mdContent = generateMdContent();
      if (!mdContent) return;

      const fixedMdContent = mdContent.replace(/(\*\*.*?\*\*)/g, '<strong>$1</strong>')
          .replace(/\(\s*([^)]*)\s*\)/g, '\\($1\\)')
          .replace(/\$\$\s*([^$]*)\s*\$\$/g, '$$$1$$');

      const printContent = `
          <html>
              <head>
                  <title>DeepSeek Chat Export</title>
                  <style>
                      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
                      h2 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
                      .ai-answer { color: #1a7f37; margin: 15px 0; }
                      .ai-chain { color: #666; font-style: italic; margin: 10px 0; }
                      hr { border: 0; border-top: 1px solid #eee; margin: 25px 0; }
                  </style>
              </head>
              <body>
                  ${fixedMdContent.replace(/\*\*用户：\*\*\n/g, '<h2>User Question</h2><div class="user-question">')
                      .replace(/\*\*正式回答\*\*\n/g, '</div><h2>AI Answer</h2><div class="ai-answer">')
                      .replace(/\*\*思考链\*\*\n/g, '</div><h2>Thinking Chain</h2><div class="ai-chain">')
                      .replace(/\n/g, '<br>')
                      .replace(/---/g, '</div><hr>')}
              </body>
          </html>
      `;

      const printWindow = window.open("", "_blank");
      printWindow.document.write(printContent);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  }

  function exportPNG() {
      if (__exportPNGLock) return;  // Skip if currently exporting
      __exportPNGLock = true;

      const chatContainer = document.querySelector(config.chatContainerSelector);
      if (!chatContainer) {
          alert("Chat container not found!");
          __exportPNGLock = false;
          return;
      }

      // Create sandbox container
      const sandbox = document.createElement('iframe');
      sandbox.style.cssText = `
          position: fixed;
          left: -9999px;
          top: 0;
          width: 800px;
          height: ${window.innerHeight}px;
          border: 0;
          visibility: hidden;
      `;
      document.body.appendChild(sandbox);

      // Deep clone and style processing
      const cloneNode = chatContainer.cloneNode(true);
      cloneNode.style.cssText = `
          width: 800px !important;
          transform: none !important;
          overflow: visible !important;
          position: static !important;
          background: white !important;
          max-height: none !important;
          padding: 20px !important;
          margin: 0 !important;
          box-sizing: border-box !important;
      `;

      // Clean up interfering elements, exclude icons
      ['button', 'input', '.ds-message-feedback-container', '.eb23581b.dfa60d66'].forEach(selector => {
          cloneNode.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Math formula fix
      cloneNode.querySelectorAll('.katex-display').forEach(mathEl => {
          mathEl.style.transform = 'none !important';
          mathEl.style.position = 'relative !important';
      });

      // Inject sandbox
      sandbox.contentDocument.body.appendChild(cloneNode);
      sandbox.contentDocument.body.style.background = 'white';

      // Wait for resources to load
      const waitReady = () => Promise.all([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 300))]);

      waitReady().then(() => {
          return html2canvas(cloneNode, {
              scale: 2,
              useCORS: true,
              logging: true,
              backgroundColor: "#FFFFFF"
          });
      }).then(canvas => {
          canvas.toBlob(blob => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${config.exportFileName}_${Date.now()}.png`;
              a.click();
              setTimeout(() => {
                  URL.revokeObjectURL(url);
                  sandbox.remove();
              }, 1000);
          }, 'image/png');
      }).catch(err => {
          console.error('Screenshot failed:', err);
          alert(`Export failed: ${err.message}`);
      }).finally(() => {
          __exportPNGLock = false;
      });
  }

  // =====================
  // Create Export Menu
  // =====================
  function createExportMenu() {
      const menu = document.createElement("div");
      menu.className = "ds-exporter-menu";
      menu.innerHTML = `
          <button class="export-btn" id="md-btn" title="Export as Markdown">➡️📁</button>
          <button class="export-btn" id="pdf-btn" title="Export as PDF">➡️📄</button>
          <button class="export-btn" id="png-btn" title="Export as Image">➡️🖼️</button>
      `;

      menu.querySelector("#md-btn").addEventListener("click", exportMarkdown);
      menu.querySelector("#pdf-btn").addEventListener("click", exportPDF);
      menu.querySelector("#png-btn").addEventListener("click", exportPNG);
      document.body.appendChild(menu);
  }

  // =====================
  // Styles
  // =====================
  GM_addStyle(`
  .ds-exporter-menu {
      position: fixed;
      top: 10px;
      right: 10px;
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
`);



  // =====================
  // Initialize
  // =====================
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
