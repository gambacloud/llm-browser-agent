// dashboard.js
document.addEventListener('DOMContentLoaded', () => {
    const dispatchBtn = document.getElementById('dispatchBtn');
    const agentsTable = document.querySelector('#agentsTable tbody');
    
    // Config Elements
    const llmProvider = document.getElementById('llmProvider');
    const geminiConfig = document.getElementById('geminiConfig');
    const ollamaConfig = document.getElementById('ollamaConfig');
    const apiKeyInput = document.getElementById('apiKey');
    const ollamaUrlInput = document.getElementById('ollamaUrl');
    const ollamaModelInput = document.getElementById('ollamaModel');
    const ollamaStatusBadge = document.getElementById('ollamaStatus');

    // --- NEW: Ollama Health Check ---
    async function checkOllamaStatus() {
        if (llmProvider.value !== 'ollama') return;
        ollamaStatusBadge.innerText = '⚪ Checking...';
        ollamaStatusBadge.style.color = '#64748b';
        try {
            // Ollama returns a simple 200 OK on its root URL if it's running
            const res = await fetch(ollamaUrlInput.value.trim(), { method: 'GET' });
            if (res.ok) {
                ollamaStatusBadge.innerText = '🟢 Online';
                ollamaStatusBadge.style.color = '#10b981';
            } else throw new Error();
        } catch (error) {
            ollamaStatusBadge.innerText = '🔴 Offline';
            ollamaStatusBadge.style.color = '#ef4444';
        }
    }

    // --- NEW: History Management ---
    function renderHistory() {
        chrome.storage.local.get(['agentHistory'], (res) => {
            const history = res.agentHistory || [];
            const container = document.getElementById('historyContainer');
            const tagsDiv = document.getElementById('historyTags');
            
            if (history.length === 0) {
                container.style.display = 'none';
                return;
            }
            
            container.style.display = 'block';
            tagsDiv.innerHTML = '';
            
            history.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'history-pill';
                const icon = item.provider === 'ollama' ? '🦙' : '☁️';
                btn.innerHTML = `<span>${icon}</span> <b>${item.prompt.substring(0, 20)}${item.prompt.length > 20 ? '...' : ''}</b>`;
                btn.title = `URL: ${item.url}\nGoal: ${item.prompt}`;
                
                // Clicking a history pill reloads the inputs
                btn.onclick = () => {
                    document.getElementById('targetUrl').value = item.url;
                    document.getElementById('agentPrompt').value = item.prompt;
                    llmProvider.value = item.provider;
                    llmProvider.dispatchEvent(new Event('change'));
                };
                tagsDiv.appendChild(btn);
            });
        });
    }

    function saveToHistory(url, prompt, provider) {
        chrome.storage.local.get(['agentHistory'], (res) => {
            let history = res.agentHistory || [];
            // Remove duplicates
            history = history.filter(h => h.prompt !== prompt || h.url !== url);
            // Add to top
            history.unshift({ url, prompt, provider });
            // Keep only the last 5
            if (history.length > 5) history.pop();
            
            chrome.storage.local.set({ agentHistory: history }, renderHistory);
        });
    }

    const groqConfig = document.getElementById('groqConfig');
    const groqApiKeyInput = document.getElementById('groqApiKey');

    // Toggle Config UI
    llmProvider.addEventListener('change', (e) => {
        geminiConfig.style.display = 'none';
        ollamaConfig.style.display = 'none';
        groqConfig.style.display = 'none';

        if (e.target.value === 'gemini') geminiConfig.style.display = 'block';
        else if (e.target.value === 'ollama') {
            ollamaConfig.style.display = 'flex';
            checkOllamaStatus();
        }
        else if (e.target.value === 'groq') groqConfig.style.display = 'flex';
        
        chrome.storage.local.set({ llmProvider: e.target.value });
    });

    // Load saved settings
    chrome.storage.local.get(['apiKey', 'groqApiKey', 'llmProvider', 'ollamaModel', 'ollamaUrl'], (result) => {
        if (result.apiKey) apiKeyInput.value = result.apiKey;
        if (result.groqApiKey) groqApiKeyInput.value = result.groqApiKey;
        if (result.ollamaModel) ollamaModelInput.value = result.ollamaModel;
        if (result.ollamaUrl) ollamaUrlInput.value = result.ollamaUrl;
        
        if (result.llmProvider) {
            llmProvider.value = result.llmProvider;
            llmProvider.dispatchEvent(new Event('change'));
        } else {
            llmProvider.value = 'groq'; // Default to Groq for the demo
            llmProvider.dispatchEvent(new Event('change'));
        }
    });

    // Save Groq key on blur
    groqApiKeyInput.addEventListener('blur', () => chrome.storage.local.set({ groqApiKey: groqApiKeyInput.value.trim() }));

    // Re-check Ollama if URL changes manually
    ollamaUrlInput.addEventListener('blur', checkOllamaStatus);

    // Load saved settings & history on startup
    chrome.storage.local.get(['apiKey', 'llmProvider', 'ollamaModel', 'ollamaUrl'], (result) => {
        if (result.apiKey) apiKeyInput.value = result.apiKey;
        if (result.ollamaModel) ollamaModelInput.value = result.ollamaModel;
        if (result.ollamaUrl) ollamaUrlInput.value = result.ollamaUrl;
        if (result.llmProvider) {
            llmProvider.value = result.llmProvider;
            llmProvider.dispatchEvent(new Event('change'));
        } else {
            checkOllamaStatus(); // Check default if no settings
        }
    });
    renderHistory();

    // Save settings on blur
    apiKeyInput.addEventListener('blur', () => chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() }));
    ollamaModelInput.addEventListener('blur', () => chrome.storage.local.set({ ollamaModel: ollamaModelInput.value.trim() }));
    ollamaUrlInput.addEventListener('blur', () => chrome.storage.local.set({ ollamaUrl: ollamaUrlInput.value.trim() }));

    // --- DISPATCH LOGIC ---
    dispatchBtn.addEventListener('click', () => {
        const url = document.getElementById('targetUrl').value.trim();
        const prompt = document.getElementById('agentPrompt').value.trim();
        
        const config = {
            provider: llmProvider.value,
            apiKey: apiKeyInput.value.trim(),
            groqApiKey: groqApiKeyInput.value.trim(), // <--- הוספת את זה?
            ollamaUrl: ollamaUrlInput.value.trim(),
            ollamaModel: ollamaModelInput.value.trim()
        };

        if (!url || !prompt) return alert("Please fill in URL and Goal.");
        if (config.provider === 'gemini' && !config.apiKey) return alert("Gemini requires an API Key.");

        // Save to History!
        saveToHistory(url, prompt, config.provider);

        chrome.tabs.create({ url: url, active: false }, (newTab) => {
            const row = document.createElement('tr');
            row.id = `row-${newTab.id}`;
            row.innerHTML = `
                <td>#${newTab.id}</td>
                <td style="font-size: 12px; color: #64748b;">${url.substring(0, 30)}...</td>
                <td>${prompt}</td>
                <td><span style="font-size: 10px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${config.provider.toUpperCase()}</span></td>
                <td class="status-running" id="status-${newTab.id}">Initializing...</td>
                <td>
                    <button style="background: #ef4444; padding: 5px 10px; font-size: 11px; cursor: pointer; border: none; border-radius: 4px; color: white;" onclick="stopAgent(${newTab.id})">STOP</button>
                    <button style="background: #3b82f6; padding: 5px 10px; font-size: 11px; cursor: pointer; border: none; border-radius: 4px; color: white;" onclick="focusTab(${newTab.id})">VIEW</button>
                </td>
            `;
            agentsTable.appendChild(row);

            setTimeout(() => {
                document.getElementById(`status-${newTab.id}`).innerText = "Running 🤖";
                chrome.runtime.sendMessage({
                    action: 'start_agent',
                    tabId: newTab.id,
                    prompt: prompt,
                    config: config
                });
            }, 3000);
            
            document.getElementById('targetUrl').value = '';
            document.getElementById('agentPrompt').value = '';
        });
    });

    window.stopAgent = (tabId) => {
        chrome.runtime.sendMessage({ action: 'stop_agent', targetTabId: tabId });
        document.getElementById(`status-${tabId}`).innerText = "🛑 Stopped";
        document.getElementById(`status-${tabId}`).className = "status-failed";
    };

    window.focusTab = (tabId) => chrome.tabs.update(tabId, { active: true });
});