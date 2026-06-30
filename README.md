# Academic Document Formatting & Compliance Assistant

An automated compliance and styling suite for **Google Docs** designed to streamline academic manuscript formatting. This repository contains a Google Apps Script (GAS) add-on and a browser userscript that automate foreign phrase italicization, bab-specific figure/table renumbering with dynamic cross-references, Consolas code-block numbering, and live document layout gap auditing.

Perfect for formatting theses (*Skripsi*), academic monographs, and publications that require strict styling regulations.

---

## ⚙️ Quick Installation & Setup

### Part 1: Installing the Google Docs Add-on
1. Open your Google Doc.
2. Go to **Extensions > Apps Script** (*Ekstensi > Apps Script*).
3. Paste the contents of [`apps-script/Code.js`](apps-script/Code.js) into your Apps Script `Code.gs` file.
4. Create a new HTML file named `Sidebar.html` and paste the contents of [`apps-script/Sidebar.html`](apps-script/Sidebar.html).
5. Click **Save** (disk icon).
6. Refresh your Google Doc. You will see a new **Skripsi Tools** (or *Asisten Skripsi*) menu in your extensions tab.

### Part 2: Installing the Page Gap Detector (Userscript)
1. Install **Tampermonkey** on your browser ([Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) / [Tampermonkey for Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)).
2. Open the Tampermonkey Dashboard and click **Create a New Script**.
3. Copy the contents of [`gap-detector.user.js`](gap-detector.user.js) and paste it into the editor.
4. Press `Ctrl + S` to save.
5. Open your Google Doc. A floating dark panel will appear in the top-right corner.
6. Scroll slowly from the top of your document to the bottom once. The script will dynamically scan and pin every page that has excessive layout gaps.

---

## 💻 Tech Stack
*   **Google Apps Script (GAS):** JavaScript (ES6+), Google Workspace Add-ons framework.
*   **Add-on Frontend:** HTML5, CSS3 (TailwindCSS CDN), Lucide Icons, Google Script API.
*   **Browser Userscript:** Vanilla JavaScript, Canvas API, Tampermonkey API.
*   **Version Control:** Git, Google Clasp (Command Line Apps Script Projects).

---

## 🌟 Features & Technical Details

<details>
<summary><b>1. Foreign Phrase Auto-Italicizer (NLP & Dictionary-Based)</b></summary>
<br>

*   **Problem:** Academic writing requires all non-primary language words (e.g., English jargon in Indonesian papers) to be italicized, which is extremely tedious to do manually over a 200-page document.
*   **Solution:** Automatically scans the document for English terms, matching them against a curated database of 500+ computer science and technical terms.
*   **Advanced Controls:**
    *   **Exclusion Lists:** Save words that shouldn't be italicized (e.g., proper nouns like "Wazuh", "ClickHouse", or abbreviations like "API", "JSON").
    *   **Contextual Overrides:** Preview words in a neat accordion sidebar list and exclude them or add them to the dictionary in one click.
    *   **Strict Layout Preservation:** The formatting engine ensures that italicizing a word does not wipe out adjacent font colors, sizes, or headings.
</details>

<details>
<summary><b>2. Dynamic Caption & Cross-Reference Renumberer (O(1) Optimized)</b></summary>
<br>

*   **Problem:** Adding a figure in Chapter 2 forces you to manually update every subsequent figure number (e.g., Figure 2.3 → 2.4) and locate every textual reference referring to it.
*   **Solution:** Scans headings to detect chapter blocks (`BAB I`, `BAB II`, etc.) and automatically renumbers all figures and tables relative to their chapter (e.g., `Gambar 2.1`, `Tabel 3.2`).
*   **Interactive Cross-Referencing:**
    *   Generates a structured document map tree in the sidebar.
    *   Allows you to insert a clickable reference link into the text with a single click.
    *   Clicking **Fokus** in the sidebar jumps your cursor directly to that figure in the document.
*   **Performance Optimization:** Runs on a pre-built $O(1)$ bookmark path cache map that avoids recursive document tree traversals, reducing document scan times from minutes to under **1.5 seconds**!
</details>

<details>
<summary><b>3. Consolas Code-Block Line Numbering (Table-Aware)</b></summary>
<br>

*   **Problem:** Code listings in theses need line numbers, but manual numbering messes up code copying and formatting.
*   **Solution:** Adds or removes cleanly aligned, monospace line numbers to selected paragraphs.
*   **Advanced Styling:**
    *   Forced black color (`#000000`) and **Consolas** font family for maximum legibility, ignoring the underlying code block styling.
    *   Left-padded for perfect alignment (e.g., ` 9 `, `10 `, `11 `).
    *   **Table-Aware:** Fully supports code blocks nested inside table cells.
</details>

<details>
<summary><b>4. Client-Side Page Gap Auditor (Tampermonkey Userscript)</b></summary>
<br>

*   **Problem:** Google Docs does not expose its physical page layout or element coordinate offsets to the Apps Script API, making it impossible to detect large empty white spaces left at the bottom of pages when a large table or image overflows.
*   **Solution:** A Tampermonkey browser userscript that runs in Firefox/Chrome and inspects the live rendered document.
*   **How it works:**
    *   **Canvas Pixel Scanner:** Google Docs renders its page view onto HTML5 canvas tiles. The userscript uses `getImageData` to read raw pixel buffers.
    *   **Scan Upward Algorithm:** Scans the canvas from the bottom up to locate the last row containing non-white, non-transparent pixels, calculating the exact percentage of empty page space.
    *   **CSP & Trusted Types Bypass:** Google Docs enforces strict Content Security Policies (CSP) and Trusted Types. The script bypasses this by avoiding `innerHTML` and using only secure programmatic DOM creation (`createElement`/`textContent`) and registering via `@grant GM_addStyle` to run in an isolated context.
    *   **Persistent Accumulation Map:** Google Docs lazily renders pages and recycles off-screen canvases to save memory. The script tracks and remembers previous page measurements as you scroll through your document, displaying them in a draggable, floating UI panel.
</details>

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author
**Pratama Siregar**
*   **LinkedIn:** [pratamasiregarpnj](https://www.linkedin.com/in/pratamasiregarpnj)
*   **GitHub:** [@Tamatimtam](https://github.com/Tamatimtam)
*   **Headline:** Compliance & Security Engineer | Risk & Compliance | Fullstack Developer
