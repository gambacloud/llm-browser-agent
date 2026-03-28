// background.js

const MAX_ITERATIONS = 5;
const SLEEP_BETWEEN_ACTIONS_MS = 2000;
let isStopRequested = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiAPI(apiKey, userPrompt, domElements) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Modern Gemini API payload structure
    const payload = {
        systemInstruction: {
            parts: [{ text: "You are a strict browser automation agent. Respond ONLY with a raw, valid JSON object." }]
        },
        contents: [{
            role: "user",
            parts: [{ 
                text: `Goal: "${userPrompt}"\nDOM: ${JSON.stringify(domElements)}\nDetermine the SINGLE NEXT ACTION.\nRespond using this exact schema:\n{"action": "click" | "type" | "navigate" | "done", "target_id": <number or null>, "value": "<text to type, OR full URL if action is navigate>"}` 
            }]
        }],
        generationConfig: {
            // This natively forces Gemini to return strict JSON format!
            responseMimeType: "application/json" 
        }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        // Extract the EXACT error from Google
        const errData = await response.json().catch(() => ({}));
        const errorMessage = errData.error?.message || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(`Google API Error: ${errorMessage}`);
    }

    const data = await response.json();

    // Check for safety blocks or empty responses
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
        if (data.promptFeedback?.blockReason) {
            throw new Error(`Blocked by Google Safety Filter: ${data.promptFeedback.blockReason}`);
        }
        if (data.candidates?.[0]?.finishReason !== 'STOP') {
            throw new Error(`Generation interrupted: ${data.candidates[0].finishReason}`);
        }
        throw new Error("Received empty response from API");
    }

    const responseText = data.candidates[0].content.parts[0].text;
    
    // Because we use responseMimeType: "application/json", it should be strictly parseable
    try {
        return JSON.parse(responseText.trim());
    } catch (parseError) {
        console.error("[Background] Failed to parse LLM response:", responseText);
        throw new Error("LLM returned invalid JSON structure.");
    }
}

async function sendUIUpdate(tabId, statName, text, logMessage = null) {
    try { await chrome.tabs.sendMessage(tabId, { action: 'update_status', statName, text, logMessage }); } 
    catch (e) { /* Ignore if reloading */ }
}

async function getDomWithRetry(tabId, retries = 5) {
    for (let i = 0; i < retries; i++) {
        if (isStopRequested) return null;
        try {
            const res = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabId, { action: 'extract_dom' }, (response) => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                    else resolve(response);
                });
            });
            if (res && res.success) return res;
        } catch (e) {
            console.log(`[Background] Page not ready, retrying... (${i+1})`);
            await sleep(1000); 
        }
    }
    return null;
}

async function runAgentLoop(tabId, apiKey, prompt) {
    let currentIteration = 1;
    isStopRequested = false; 
    console.log(`[Background] Starting loop for tab ${tabId}`);

    while (currentIteration <= MAX_ITERATIONS) {
        if (isStopRequested) {
            await sendUIUpdate(tabId, 'saw', '🛑 Stopped', 'Agent execution aborted manually.');
            break;
        }

        await sendUIUpdate(tabId, 'searched', `Scanning... (Iter ${currentIteration})`, `Started iteration ${currentIteration}`);
        
        const domResponse = await getDomWithRetry(tabId);
        if (!domResponse) {
            if (!isStopRequested) await sendUIUpdate(tabId, 'saw', 'Error: Disconnected', 'Failed to extract DOM. Did you close the tab?');
            return;
        }

        await sendUIUpdate(tabId, 'saw', `Thinking...`, `Found ${domResponse.dom.length} elements, asking LLM...`);
        
        try {
            const decision = await callGeminiAPI(apiKey, prompt, domResponse.dom);
            
            if (decision.action === 'done') {
                await sendUIUpdate(tabId, 'saw', `Goal Achieved! 🎉`, `Agent concluded task successfully.`);
                return; 
            }

            if (decision.action === 'navigate') {
                await sendUIUpdate(tabId, 'tried', `Maps`, `Navigating to: ${decision.value}`);
                chrome.tabs.update(tabId, { url: decision.value });
                await sleep(SLEEP_BETWEEN_ACTIONS_MS);
                currentIteration++;
                continue; 
            }

            const actionDesc = `${decision.action.toUpperCase()} on ID ${decision.target_id}`;
            await sendUIUpdate(tabId, 'tried', actionDesc, `Executing: ${actionDesc}`);
            
            const execResponse = await new Promise(resolve => {
                chrome.tabs.sendMessage(tabId, { action: 'execute_action', type: decision.action, target_id: decision.target_id, value: decision.value }, resolve);
            });

            if (!execResponse || !execResponse.success) throw new Error("Execution failed on page.");

            await sendUIUpdate(tabId, 'saw', `Waiting...`, `Action executed, waiting for reaction.`);
            await sleep(SLEEP_BETWEEN_ACTIONS_MS);
            currentIteration++;

        } catch (error) {
            // THIS IS THE CRITICAL FIX: The UI will now show exactly why it failed
            await sendUIUpdate(tabId, 'saw', `Error`, `Critical Error: ${error.message}`);
            console.error("[Agent Error]", error);
            return; 
        }
    }
    if (!isStopRequested && currentIteration > MAX_ITERATIONS) {
        await sendUIUpdate(tabId, 'saw', `Stopped`, `Reached max limit of ${MAX_ITERATIONS}.`);
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start_agent') {
        runAgentLoop(request.tabId, request.apiKey, request.prompt);
        sendResponse({ success: true });
    } else if (request.action === 'stop_agent') {
        isStopRequested = true;
        console.log("[Background] Stop requested by user.");
        sendResponse({ success: true });
    }
    return true;
});