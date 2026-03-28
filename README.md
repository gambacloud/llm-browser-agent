# LLM Browser Agent

An autonomous browser extension that uses LLMs (Language Models) to navigate, click, and type directly within your active Chrome tabs. It operates securely in the local context of the browser, utilizing existing sessions and cookies without requiring complex backend setups or external server automation.

## Features
* **Zero-Setup Context:** Runs entirely as a Chrome Extension (Manifest V3). If you are logged into a site, the agent is logged in.
* **Token Efficiency:** Extracts only interactive DOM elements (buttons, inputs, links) to minimize LLM token usage and prevent hallucination.
* **Agentic Loop:** Analyzes the page, makes a decision, executes the physical action (click/type), waits for the page to react, and repeats until the goal is achieved.
* **Local Secrets:** API keys are stored securely in `chrome.storage.local`.

## Prerequisites
* Google Chrome browser.
* A valid API Key for Google Gemini (Tested with `gemini-2.5-flash`).

## Installation
1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** using the toggle switch in the top right corner.
4. Click the **"Load unpacked"** button in the top left.
5. Select the folder containing this project (`llm-browser-agent`).
6. The extension will appear in your list. Pin it to your toolbar for easy access.

## Usage
1. Click the extension icon in your Chrome toolbar.
2. In the setup section, paste your LLM API Key and click **"Save"**.
3. Navigate to any web page where you want the agent to operate.
4. Open the extension and type your goal in the text box (e.g., *"Click on the login button and type myemail@example.com into the email field"*).
5. Click **"🚀 Execute Action"**.
6. Watch the agent attach visual ID badges to elements and physically interact with the page.