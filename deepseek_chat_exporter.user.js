// ==UserScript==
// @name         DeepSeek Chat Exporter (Markdown & PDF)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  导出 DeepSeek 聊天记录为 Markdown 和 PDF 格式
// @author       HSyuf/Blueberrycongee
// @match        https://chat.deepseek.com/*
// @grant        GM_addStyle
// @grant        GM_download
// ==/UserScript==

(function () {
    "use strict";
  
    class AiAnswer {
      constructor(aiChain, aiAnswer) {
        this.aiChain = {
          type: "ai_chain",
          content: aiChain ? aiChain.textContent.trim() : "[无内容]",
        };
        this.aiAnswer = {
          type: "ai_formal_reply",
          content: aiAnswer ? aiAnswer.textContent.trim() : "[无内容]",
        };
      }
    }
  
    // =====================
    // 获取用户消息
    // =====================
    function getUserMessages() {
      const chatContainer = Array.from(document.querySelectorAll(".fa81"));
      return chatContainer.map((el) => ({
        type: "user",
        content: el.textContent.trim() || "[无内容]",
      }));
    }
  
    // =====================
    // 获取 AI 消息
    // =====================
    function getAiMessages() {
      const aiAnswers = Array.from(
        document.querySelectorAll(".f9bf7997.c05b5566")
      );
  
      return aiAnswers.map((el) => {
        const aiStatus = el.querySelector(".a6d716f5.db5991dd");
        const aiChain = el.querySelector(".e1675d8b");
        const aiAnswers = el.querySelector(".ds-markdown.ds-markdown--block");
  
        return aiStatus.textContent === "思考已停止"
          ? new AiAnswer()
          : new AiAnswer(aiChain, aiAnswers);
      });
    }
  
    // =====================
    // 生成 Markdown 内容
    // =====================
    function generateMdContent() {
      const userMessages = getUserMessages();
      const aiMessages = getAiMessages();
  
      if (userMessages.length === 0 && aiMessages.length === 0) {
        alert("未找到聊天记录！");
        return null;
      }
  
      const allMessages = [];
      for (let i = 0; i < userMessages.length; i++) {
        allMessages.push(userMessages[i], aiMessages[i].aiChain, aiMessages[i].aiAnswer);
      }
  
      return allMessages
        .map((msg) => {
          if (msg.type === "user") return `**用户：**\n${msg.content}`;
          if (msg.type === "ai_formal_reply") return `**AI 回答：**\n${msg.content}`;
          if (msg.type === "ai_chain") return `**AI 思维链：**\n${msg.content}`;
          return "";
        })
        .join("\n\n---\n\n");
    }
  
    // =====================
    // 导出为 Markdown
    // =====================
    function exportMarkdown() {
      const mdContent = generateMdContent();
      if (!mdContent) return;
  
      const blob = new Blob([mdContent], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DeepSeek_Chat_${Date.now()}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  
    // =====================
    // 导出为 PDF
    // =====================
    function exportPDF() {
      const mdContent = generateMdContent();
      if (!mdContent) return;
  
      // 创建打印内容
      const printContent = `
        <html>
          <head>
            <title>DeepSeek Chat Export</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                line-height: 1.6;
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
              }
              h2 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
              .ai-answer { color: #1a7f37; margin: 15px 0; }
              .ai-chain { color: #666; font-style: italic; margin: 10px 0; }
              hr { border: 0; border-top: 1px solid #eee; margin: 25px 0; }
            </style>
          </head>
          <body>
            ${mdContent
              .replace(/\*\*用户：\*\*\n/g, '<h2>用户提问</h2><div class="user-question">')
              .replace(/\*\*AI 回答：\*\*\n/g, '</div><h2>AI 回答</h2><div class="ai-answer">')
              .replace(/\*\*AI 思维链：\*\*\n/g, '</div><h2>思维链</h2><div class="ai-chain">')
              .replace(/\n/g, '<br>')
              .replace(/---/g, '</div><hr>')}
          </body>
        </html>
      `;
  
      // 创建打印窗口
      const printWindow = window.open("", "_blank");
      printWindow.document.write(printContent);
      printWindow.document.close();
  
      // 添加延迟确保内容加载完成
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  
    // =====================
    // 添加导出菜单
    // =====================
    function createExportMenu() {
      const menu = document.createElement("div");
      menu.className = "ds-exporter-menu";
      menu.innerHTML = `
        <button class="export-btn" id="md-btn">导出为 Markdown</button>
        <button class="export-btn" id="pdf-btn">导出为 PDF</button>
      `;
  
      menu.querySelector("#md-btn").addEventListener("click", exportMarkdown);
      menu.querySelector("#pdf-btn").addEventListener("click", exportPDF);
      document.body.appendChild(menu);
    }
  
    // =====================
    // 样式注入
    // =====================
    GM_addStyle(`
      .ds-exporter-menu {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        background: rgba(255, 255, 255, 0.95);
        padding: 12px;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        gap: 8px;
        backdrop-filter: blur(4px);
      }
      .export-btn {
        background: #2196F3;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }
      .export-btn:hover {
        background: #1976D2;
        transform: translateY(-1px);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
      }
    `);
  
    // =====================
    // 初始化脚本
    // =====================
    function init() {
      const checkInterval = setInterval(() => {
        if (document.querySelector(".fa81")) {
          clearInterval(checkInterval);
          createExportMenu();
        }
      }, 500);
    }
  
    init();
  })();