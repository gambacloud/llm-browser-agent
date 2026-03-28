// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const keyStatus = document.getElementById('keyStatus');
    const runBtn = document.getElementById('runBtn');
    const promptInput = document.getElementById('prompt');
    const statusDiv = document.getElementById('status');

    chrome.storage.local.get(['apiKey'], (result) => { if (result.apiKey) apiKeyInput.value = result.apiKey; });

    saveKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            chrome.storage.local.set({ apiKey: key }, () => {
                keyStatus.style.display = 'block'; setTimeout(() => keyStatus.style.display = 'none', 2500);
            });
        }
    });

    runBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        const apiKey = apiKeyInput.value.trim();
        
        if (!prompt || !apiKey) {
            statusDiv.innerText = "Error: Missing inputs.";
            statusDiv.style.color = "red";
            return;
        }
        
        runBtn.disabled = true; 
        statusDiv.innerText = "Sending command to background agent...";
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                // Send payload to the persistent background script
                chrome.runtime.sendMessage({
                    action: 'start_agent',
                    tabId: tab.id,
                    apiKey: apiKey,
                    prompt: prompt
                }, (response) => {
                    if(response && response.success) {
                        statusDiv.innerText = "Agent running! You can close this popup.";
                        statusDiv.style.color = "green";
                        // Automatically close the popup after 2 seconds
                        setTimeout(() => window.close(), 2000);
                    }
                });
            }
        } catch (error) {
            statusDiv.innerText = `System Error: ${error.message}`;
            statusDiv.style.color = "red";
            runBtn.disabled = false;
        }
    });
});