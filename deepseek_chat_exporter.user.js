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
// @downloadURL https://update.greasyfork.org/scripts/525523/DeepSeek%20Chat%20Exporter%20%28Markdown%20%20PDF%20%20PNG%29.user.js
// @updateURL https://update.greasyfork.org/scripts/525523/DeepSeek%20Chat%20Exporter%20%28Markdown%20%20PDF%20%20PNG%29.meta.js
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
      return thinkingNode ? `**Thinking chain**\n${thinkingNode.textContent.trim()}` : null;
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

      return `**Final answer**\n${answerContent.trim()}`;
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
              messages.push(`**User:**\n${node.textContent.trim()}`);
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
                  ${fixedMdContent.replace(/\*\*User:**\*\*\n/g, '<h2>User Question</h2><div class="user-question">')
                      .replace(/\*\*Final answer\*\*\n/g, '</div><h2>AI Answer</h2><div class="ai-answer">')
                      .replace(/\*\*Thinking chain\*\*\n/g, '</div><h2>Thinking Chain</h2><div class="ai-chain">')
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
          <button class="export-btn" id="md-btn">Export as Markdown</button>
          <button class="export-btn" id="pdf-btn">Export as PDF</button>
          <button class="export-btn" id="png-btn">Export as Image</button>
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
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: rgba(255, 255, 255, 0.95) url('data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="%23ff9a9e" opacity="0.2"/></svg>');
      border: 2px solid #ff93ac;
      border-radius: 15px;
      box-shadow: 0 4px 20px rgba(255, 65, 108, 0.3);
      backdrop-filter: blur(8px);
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start; /* Ensure buttons are left-aligned */
  }

  .export-btn {
      background: linear-gradient(145deg, #ff7eb3 0%, #ff758c 100%);
      color: white;
      border: 2px solid #fff;
      border-radius: 12px;
      padding: 12px 24px;
      font-family: 'Comic Sans MS', cursive;
      font-size: 16px;
      text-shadow: 1px 1px 2px rgba(255, 65, 108, 0.5);
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
      cursor: pointer;
      width: 200px; /* Define button width */
      margin-bottom: 8px; /* Add spacing between buttons */
  }

  .export-btn::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: linear-gradient(45deg, transparent 33%, rgba(255,255,255,0.3) 50%, transparent 66%);
      transform: rotate(45deg);
      animation: sparkle 3s infinite linear;
  }

  .export-btn:hover {
      transform: scale(1.05) rotate(-2deg);
      box-shadow: 0 6px 24px rgba(255, 65, 108, 0.4);
      background: linear-gradient(145deg, #ff6b9d 0%, #ff677e 100%);
  }

  .export-btn:active {
      transform: scale(0.95) rotate(2deg);
  }

  #md-btn::after {
      content: '📁';
      margin-left: 8px;
      filter: drop-shadow(1px 1px 1px rgba(0,0,0,0.2));
  }

  #pdf-btn::after {
      content: '📄';
      margin-left: 8px;
  }

  #png-btn::after {
      content: '🖼️';
      margin-left: 8px;
  }

  @keyframes sparkle {
      0% { transform: translate(-100%, -100%) rotate(45deg); }
      100% { transform: translate(100%, 100%) rotate(45deg); }
  }

  /* Add cartoon dialog tooltip */
  .ds-exporter-menu::before {
      position: absolute;
      top: -40px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      padding: 8px 16px;
      border-radius: 10px;
      border: 2px solid #ff93ac;
      font-family: 'Comic Sans MS', cursive;
      color: #ff6b9d;
      white-space: nowrap;
      box-shadow: 0 3px 10px rgba(0,0,0,0.1);
  }

  /* Add floating decorative elements */
  .ds-exporter-menu::after {
      content: '';
      position: absolute;
      width: 30px;
      height: 30px;
      background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%23ff93ac" d="M12,2.5L15.3,8.6L22,9.7L17,14.5L18.5,21L12,17.5L5.5,21L7,14.5L2,9.7L8.7,8.6L12,2.5Z"/></svg>');
      top: -20px;
      right: -15px;
      animation: float 2s ease-in-out infinite;
  }

  @keyframes float {
      0%, 100% { transform: translateY(0) rotate(10deg); }
      50% { transform: translateY(-10px) rotate(-10deg); }
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
