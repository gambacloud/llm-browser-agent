# 🤖 Multi-Agent Browser Command Center

**TL;DR:** An autonomous Chrome extension powered by LLMs (Local or Cloud). It uses your active browser sessions to navigate, click, and type to complete tasks you give it in plain text. Runs entirely from a central Dispatch Dashboard.

## 🚀 1-Minute Quickstart (Demo Setup)

### 1. Install the Extension
1. Clone or download this repository to your machine.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle **Developer Mode** ON (top right).
4. Click **Load unpacked** (top left) and select the repository folder.

### 2. Get the "Brain" (Ultra-Fast Cloud LLM)
For the fastest live demos, we use Groq (Llama-3 70B):
1. Go to [console.groq.com](https://console.groq.com/) and log in.
2. Navigate to **API Keys** -> **Create API Key**.
3. Copy the key (starts with `gsk_`).

### 3. Dispatch Agents
1. Pin the extension 🧩 to your Chrome toolbar.
2. Click the extension icon and select **🎛️ Open Dashboard**.
3. In the Command Center, select **Groq Cloud** as the Brain and paste your API key.
4. Enter a Target URL (e.g., `https://wikipedia.org`).
5. Enter a Goal (e.g., `"Search for artificial intelligence and click the first result. Once clicked, return done."`).
6. Click **🚀 Dispatch** and watch the agent open a new tab and execute the task autonomously!

## ⚙️ Supported Providers
* **Groq (Llama-3.3-70B):** Lightning-fast cloud execution (Recommended for demos).
* **Local Ollama (Qwen2.5-Coder / Llama-3):** 100% free and private local execution. Requires Ollama installed and running (`ollama run qwen2.5-coder:7b`).
* **Google Gemini (Flash 2.5):** Reliable cloud fallback.