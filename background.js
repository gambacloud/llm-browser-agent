// background.js - Parallel Tabs & API Rate Limit Backoff

const MAX_ITERATIONS = 5;
const SLEEP_BETWEEN_ACTIONS_MS = 2000;
const stopRequests = new Set();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// UPDATED: Now receives tabId to send UI updates during the backoff period
async function callGeminiAPI(tabId, apiKey, userPrompt, domElements, actionHistory) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const historyString = actionHistory.length > 0 
        ? `\n\nPast actions you already executed in this session:\n- ${actionHistory.join('\n- ')}\nDO NOT repeat these actions unless specifically required.` 
        : '';

    const payload = {
        systemInstruction: {
            parts: [{ text: "You are a strict browser automation agent. Respond ONLY with a raw, valid JSON object." }]
        },
        contents: [{
            role: "user",
            parts: [{ 
                text: `Goal: "${userPrompt}"\n\nCurrent DOM:\n${JSON.stringify(domElements)}${historyString}\n\nDetermine the SINGLE NEXT ACTION.\nRespond using this exact schema:\n{"action": "click" | "type" | "navigate" | "done", "target_id": <number or null>, "value": "<text to type, OR full URL if action is navigate>"}` 
            }]
        }],
        generationConfig: {
            responseMimeType: "application/json" 
        }
    };

    const maxRetries = 3;
    const backoffSeconds = 30;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Check if user clicked STOP before making the API call
        if (stopRequests.has(tabId)) throw new Error("Stopped by user");

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errorMessage = errData.error?.message || `HTTP ${response.status}`;

            // NEW: Detect Rate Limit (429) or Quota Exceeded
            if (response.status === 429 || errorMessage.toLowerCase().includes('quota')) {
                if (attempt === maxRetries) {
                    throw new Error("API Rate limit exceeded persistently. Please try again later.");
                }
                
                await sendUIUpdate(tabId, 'saw', '⏳ Rate Limit', `API Quota hit. Pausing for ${backoffSeconds}s... (Retry ${attempt}/${maxRetries})`);
                
                // Wait loop that checks for user STOP requests every second
                for (let s = 0; s < backoffSeconds; s++) {
                    if (stopRequests.has(tabId)) throw new Error("Stopped by user during backoff");
                    await sleep(1000);
                }
                continue; // Try the API call again
            }

            throw new Error(`Google API Error: ${errorMessage}`);
        }

        const data = await response.json();

        if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
            if (data.promptFeedback?.blockReason) throw new Error(`Blocked by Google Safety Filter: ${data.promptFeedback.blockReason}`);
            if (data.candidates?.[0]?.finishReason !== 'STOP') throw new Error(`Generation interrupted: ${data.candidates[0].finishReason}`);
            throw new Error("Received empty response from API");
        }

        const responseText = data.candidates[0].content.parts[0].text;
        const tokenCount = data.usageMetadata ? data.usageMetadata.totalTokenCount : 0;
        
        try {
            return {
                decision: JSON.parse(responseText.trim()),
                tokensUsed: tokenCount
            };
        } catch (parseError) {
            console.error("[Background] Failed to parse LLM response:", responseText);
            throw new Error("LLM returned invalid JSON structure.");
        }
    }
}

async function sendUIUpdate(tabId, statName, text, logMessage = null, screenshotUrl = null) {
    try { await chrome.tabs.sendMessage(tabId, { action: 'update_status', statName, text, logMessage, screenshotUrl }); } 
    catch (e) { /* Ignore */ }
}

async function getDomWithRetry(tabId, retries = 5) {
    for (let i = 0; i < retries; i++) {
        if (stopRequests.has(tabId)) return null;
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

async function captureAuditScreenshot() {
    try {
        return await new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 40 }, (dataUrl) => {
                if (chrome.runtime.lastError) resolve(null); 
                else resolve(dataUrl);
            });
        });
    } catch (e) {
        return null;
    }
}

async function runAgentLoop(tabId, apiKey, prompt) {
    let currentIteration = 1;
    let actionHistory = []; 
    let sessionTotalTokens = 0; 
    
    stopRequests.delete(tabId); 
    console.log(`[Background] Starting loop for tab ${tabId}`);

    while (currentIteration <= MAX_ITERATIONS) {
        if (stopRequests.has(tabId)) {
            await sendUIUpdate(tabId, 'saw', '🛑 Stopped', 'Agent execution aborted manually.');
            break;
        }

        await sendUIUpdate(tabId, 'searched', `Scanning... (Iter ${currentIteration})`, `Started iteration ${currentIteration}`);
        
        const domResponse = await getDomWithRetry(tabId);
        if (!domResponse) {
            if (!stopRequests.has(tabId)) await sendUIUpdate(tabId, 'saw', 'Error: Disconnected', 'Failed to extract DOM. Did you close the tab?');
            return;
        }

        await sendUIUpdate(tabId, 'saw', `Thinking...`, `Found ${domResponse.dom.length} elements, asking LLM...`);
        
        try {
            // UPDATED: Passing tabId to handle UI updates from inside the API function
            const apiResult = await callGeminiAPI(tabId, apiKey, prompt, domResponse.dom, actionHistory);
            const decision = apiResult.decision;
            
            sessionTotalTokens += apiResult.tokensUsed;
            await sendUIUpdate(tabId, 'tokens', sessionTotalTokens.toLocaleString(), `Consumed ${apiResult.tokensUsed} tokens this iteration.`);
            
            if (decision.action === 'done') {
                await sendUIUpdate(tabId, 'saw', `Goal Achieved! 🎉`, `Agent concluded task successfully.`);
                return; 
            }

            if (decision.action === 'navigate') {
                const actionDesc = `Mapsd to ${decision.value}`;
                actionHistory.push(actionDesc);
                
                const screenshotUrl = await captureAuditScreenshot();
                await sendUIUpdate(tabId, 'tried', `Maps`, actionDesc, screenshotUrl);
                
                chrome.tabs.update(tabId, { url: decision.value });
                await sleep(SLEEP_BETWEEN_ACTIONS_MS);
                currentIteration++;
                continue; 
            }

            let targetContext = "Unknown Element";
            if (decision.target_id !== null && decision.target_id !== undefined) {
                const targetEl = domResponse.dom.find(el => el.id === decision.target_id);
                if (targetEl) {
                    targetContext = `[${targetEl.tagName.toUpperCase()}] "${targetEl.text || targetEl.type}"`;
                }
            }

            const actionDesc = `${decision.action.toUpperCase()} on ${targetContext}`;
            actionHistory.push(`${actionDesc} ${decision.value ? `(Typed: "${decision.value}")` : ''}`);

            const screenshotUrl = await captureAuditScreenshot();
            await sendUIUpdate(tabId, 'tried', decision.action.toUpperCase(), `Executing: ${actionDesc} ${decision.value ? `| Value: "${decision.value}"` : ''}`, screenshotUrl);
            
            const execResponse = await new Promise(resolve => {
                chrome.tabs.sendMessage(tabId, { action: 'execute_action', type: decision.action, target_id: decision.target_id, value: decision.value }, resolve);
            });

            if (!execResponse || !execResponse.success) throw new Error("Execution failed on page.");

            await sendUIUpdate(tabId, 'saw', `Waiting...`, `Action executed, waiting for reaction.`);
            await sleep(SLEEP_BETWEEN_ACTIONS_MS);
            currentIteration++;

        } catch (error) {
            // If the error was manually thrown because of a user stop, display a clean message
            if (error.message.includes("Stopped by user")) {
                 await sendUIUpdate(tabId, 'saw', `🛑 Stopped`, `Agent execution aborted manually during operation.`);
            } else {
                 await sendUIUpdate(tabId, 'saw', `Error`, `Critical Error: ${error.message}`);
                 console.error(`[Agent Error Tab ${tabId}]`, error);
            }
            return; 
        }
    }
    
    if (!stopRequests.has(tabId) && currentIteration > MAX_ITERATIONS) {
        await sendUIUpdate(tabId, 'saw', `Stopped`, `Reached max limit of ${MAX_ITERATIONS}.`);
    }
    
    stopRequests.delete(tabId);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start_agent') {
        runAgentLoop(request.tabId, request.apiKey, request.prompt);
        sendResponse({ success: true });
    } else if (request.action === 'stop_agent') {
        const tabIdToStop = sender.tab ? sender.tab.id : null;
        if (tabIdToStop) {
            stopRequests.add(tabIdToStop);
            console.log(`[Background] Stop requested for specific tab ID: ${tabIdToStop}`);
        }
        sendResponse({ success: true });
    }
    return true;
});