// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveKeyBtn = document.getElementById('saveKeyBtn');
    const keyStatus = document.getElementById('keyStatus');
    const runBtn = document.getElementById('runBtn');
    const promptInput = document.getElementById('prompt');
    const statusDiv = document.getElementById('status');

    // --- CONFIGURATION ---
    const MAX_ITERATIONS = 5; 
    const SLEEP_BETWEEN_ACTIONS_MS = 1500; // Wait for page to react after clicking

    chrome.storage.local.get(['apiKey'], (result) => {
        if (result.apiKey) apiKeyInput.value = result.apiKey;
    });

    saveKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            chrome.storage.local.set({ apiKey: key }, () => {
                keyStatus.style.display = 'block';
                setTimeout(() => keyStatus.style.display = 'none', 2500);
            });
        }
    });

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function callGeminiAPI(apiKey, userPrompt, domElements) {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        
        const systemInstruction = `You are a strict browser automation agent. 
The user wants to achieve this goal: "${userPrompt}". 
Here is the simplified DOM of the active page: 
${JSON.stringify(domElements)}

Determine the SINGLE NEXT ACTION.
Respond ONLY with a raw JSON object. Do not wrap it in markdown.
Structure MUST be exactly:
{
  "action": "click" | "type" | "done",
  "target_id": <number or null if done>,
  "value": "<text to type, if action is type>"
}`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemInstruction }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`API Failed: ${errData.error?.message}`);
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    }

    // --- THE AGENTIC LOOP ---
    async function runAgentLoop(tabId, apiKey, prompt) {
        let currentIteration = 1;

        while (currentIteration <= MAX_ITERATIONS) {
            updateStatus(`Iteration ${currentIteration}/${MAX_ITERATIONS}: Scanning...`, "black");
            
            // 1. Get DOM
            const domResponse = await new Promise(resolve => {
                chrome.tabs.sendMessage(tabId, { action: 'extract_dom' }, resolve);
            });

            if (!domResponse || !domResponse.success) {
                updateStatus(`Error: Failed to extract DOM on iteration ${currentIteration}.`, "red");
                return;
            }

            updateStatus(`Iteration ${currentIteration}: Found ${domResponse.dom.length} elements. Thinking... 🧠`, "orange");

            try {
                // 2. Ask LLM
                const decision = await callGeminiAPI(apiKey, prompt, domResponse.dom);
                console.log(`[Agent Loop ${currentIteration}] Decision:`, decision);

                // 3. Check if done
                if (decision.action === 'done') {
                    updateStatus(`🎉 Task Completed Successfully!`, "green");
                    return; // Exit loop!
                }

                // 4. Execute Action
                updateStatus(`Executing: ${decision.action} on ID ${decision.target_id}`, "blue");
                
                const execResponse = await new Promise(resolve => {
                    chrome.tabs.sendMessage(tabId, { 
                        action: 'execute_action', 
                        type: decision.action, 
                        target_id: decision.target_id,
                        value: decision.value
                    }, resolve);
                });

                if (!execResponse || !execResponse.success) {
                    throw new Error(execResponse?.error || "Execution failed on page.");
                }

                // 5. Wait for page to react (e.g. menu opening, page navigating)
                await sleep(SLEEP_BETWEEN_ACTIONS_MS);
                currentIteration++;

            } catch (error) {
                updateStatus(`Agent Error: ${error.message}`, "red");
                return; // Break loop on critical error
            }
        }

        // If we exit the while loop naturally, we hit the max iterations limit.
        updateStatus(`🛑 Stopped: Reached maximum limit of ${MAX_ITERATIONS} iterations without completing the task.`, "red");
    }

    runBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        const apiKey = apiKeyInput.value.trim();

        if (!prompt || !apiKey) {
            updateStatus("Error: Command and API Key required.", "red");
            return;
        }
        
        runBtn.disabled = true; 
        
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error("No active tab.");

            // Start the Loop!
            await runAgentLoop(tab.id, apiKey, prompt);

        } catch (error) {
            updateStatus(`System Error: ${error.message}`, "red");
        } finally {
            runBtn.disabled = false;
        }
    });

    function updateStatus(message, color = "black") {
        statusDiv.innerText = message;
        statusDiv.style.color = color;
    }
});