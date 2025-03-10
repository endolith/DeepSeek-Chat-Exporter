# DeepSeek Chat Exporter (Markdown, PDF & Image)

This is a Tampermonkey script for exporting DeepSeek chat conversations in Markdown, PDF, and image formats. The script adds three export buttons to the top-right corner of the DeepSeek chat interface for quick and easy conversation saving.

---

## Features

- **Export to Markdown**: Save chat history as Markdown files, perfect for notes and documentation.
- **Export to PDF**: Save conversations as PDF files for printing or sharing.
- **Export to Image**: Capture chat history as image files for easy viewing and sharing.
- **Automatic Segmentation**: Automatically segments user questions, AI responses, and thought chains for clear readability.
- **Enhanced Layout**: Optimized formatting for PDF export with customizable styles.
- **One-Click Operation**: Export with a single click, no complex operations needed.

---

## Installation

1. Ensure you have a userscript manager installed (like [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)).
2. Click the following link to install the script:
   - [DeepSeek Chat Exporter Script Installation Link](#) (replace `#` with actual script URL)
3. After installation, refresh your DeepSeek chat page.
4. Three export buttons will appear in the top-right corner, indicating successful script installation.

---

## Usage

1. Open the DeepSeek chat page (`https://chat.deepseek.com/`).
2. Look for the export buttons in the top-right corner:
   - **Export to Markdown**: Click to download a `.md` file.
   - **Export to PDF**: Click to open the print preview window, select "Save as PDF".
   - **Export to Image**: Click to capture the current chat history as a `.png` image.
3. Exported files are named with timestamps, e.g., `DeepSeek_Chat_1698765432100.md`, `DeepSeek_Chat_1698765432100.pdf`, or `DeepSeek_Chat_1698765432100.png`.

---

## File Format Details

### Markdown Format

- **User Questions**: Begin with `**User:**`, followed by the message content.
- **AI Responses**: Begin with `**AI Response:**`, followed by the AI's answer.
- **AI Thought Chain**: Begin with `**AI Thought Chain:**`, followed by the AI's reasoning process.
- Sections are separated by `---`.

Example:

```markdown
**User:**
Hello, can you help me write some code?

---
**AI Thought Chain:**
This is a request for code writing assistance.

---
**AI Response:**
Of course! Please tell me what kind of code you need.
```

### PDF Format

- **User Questions**: Displayed with "User Question" heading in normal text.
- **AI Responses**: Displayed with "AI Response" heading in green text.
- **Thought Chain**: Displayed with "Thought Chain" heading in gray italic text.
- Sections separated by horizontal lines.

### Image Format

- Exports as a `.png` screenshot of the chat history, including the chat interface and all conversations, ideal for quick sharing or saving.

---

## Important Notes

1. Ensure your browser allows pop-ups for PDF export functionality.
2. For long conversations, consider using landscape orientation when printing PDFs for best results.
3. For image export, ensure the page displays all content completely before exporting.
4. Script updates may be needed if the page structure changes to match new DOM structures.

---

## Feedback and Contributions

If you encounter issues or have suggestions for improvements, please submit an Issue or Pull Request.

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
