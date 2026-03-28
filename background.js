// background.js - Multi-Provider Support (Gemini + Local Ollama)

const MAX_ITERATIONS = 5;
const SLEEP_BETWEEN_ACTIONS_MS = 2000;
const stopRequests = new Set();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callLLMAPI(tabId, userPrompt, domElements, actionHistory, config) {
    const historyString = actionHistory.length > 0 
        ? `\n\nPast actions you already executed in this session:\n- ${actionHistory.join('\n- ')}\nDO NOT repeat these actions unless specifically required.` 
        : '';
        
    const systemPrompt = "You are a highly precise autonomous browser agent. Respond ONLY with a raw JSON object. Do not wrap in markdown (no ```json).";
    // Engineered rules to enforce exact behavior
    const userMessage = `GOAL: "${userPrompt}"

    CURRENT DOM:
    ${JSON.stringify(domElements)}
    ${historyString}

    RULES:
    1. Determine the exact NEXT SINGLE ACTION required to progress towards the goal.
    2. If the Goal is already completely achieved, you MUST return {"action": "done"}.
    3. Valid actions: "click", "type", "navigate", "done".
    4. For DROPDOWNS (select tags): Use the "type" action and provide the exact hidden 'value' string mapped to the desired option. Do not type the visual text.
    5. Do not repeat actions from the history unless a previous attempt failed and a different value is needed.

    Respond strictly in this JSON format:
    {"action": "click" | "type" | "navigate" | "done", "target_id": <number or null>, "value": "<text to type OR URL>"}`;


    // --- OLLAMA LOCAL EXECUTION ---
    if (config.provider === 'ollama') {
        const payload = {
            model: config.ollamaModel,
            format: "json", // Native JSON forcing in Ollama
            stream: false,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ]
        };

        const response = await fetch(`${config.ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Ollama Error: Is it running? (HTTP ${response.status})`);
        
        const data = await response.json();
        let rawText = data.message.content;
        
        // Defensive cleanup (Local models sometimes add markdown despite format:json)
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        try {
            return {
                decision: JSON.parse(rawText),
                tokensUsed: data.eval_count || 0 // Ollama calls them eval_count
            };
        } catch (e) {
            throw new Error("Ollama returned invalid JSON structure.");
        }
    } 

    // --- GROQ CLOUD EXECUTION (Lightning Fast Llama-3 70B) ---
    else if (config.provider === 'groq') {
        const payload = {
            model: "llama-3.3-70b-versatile", // Currently Groq's smartest/fastest model
            response_format: { type: "json_object" }, // Native JSON forcing
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ]
        };

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.groqApiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Groq API Error: ${errData.error?.message || response.status}`);
        }
        
        const data = await response.json();
        let rawText = data.choices[0].message.content;
        
        // Sometimes models wrap JSON in markdown even with json_object enabled
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        try {
            return {
                decision: JSON.parse(rawText),
                tokensUsed: data.usage ? data.usage.total_tokens : 0
            };
        } catch (e) {
            throw new Error("Groq returned invalid JSON structure.");
        }
    }
    
    // --- GOOGLE GEMINI CLOUD EXECUTION ---
    else if (config.provider === 'gemini') {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.apiKey}`;
        const payload = {
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userMessage }] }],
            generationConfig: { responseMimeType: "application/json" }
        };

        const maxRetries = 3;
        const backoffSeconds = 30;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (stopRequests.has(tabId)) throw new Error("Stopped by user");

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errorMessage = errData.error?.message || `HTTP ${response.status}`;

                if (response.status === 429 || errorMessage.toLowerCase().includes('quota')) {
                    if (attempt === maxRetries) throw new Error("API Rate limit exceeded persistently.");
                    await sendUIUpdate(tabId, 'saw', '⏳ Rate Limit', `API Quota hit. Pausing for ${backoffSeconds}s... (Retry ${attempt}/${maxRetries})`);
                    for (let s = 0; s < backoffSeconds; s++) {
                        if (stopRequests.has(tabId)) throw new Error("Stopped by user during backoff");
                        await sleep(1000);
                    }
                    continue; 
                }
                throw new Error(`Google API Error: ${errorMessage}`);
            }

            const data = await response.json();
            if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
                throw new Error("Received empty or blocked response from API");
            }

            try {
                return {
                    decision: JSON.parse(data.candidates[0].content.parts[0].text.trim()),
                    tokensUsed: data.usageMetadata ? data.usageMetadata.totalTokenCount : 0
                };
            } catch (e) {
                throw new Error("Gemini returned invalid JSON structure.");
            }
        }
    }
}

// --- HELPER FUNCTIONS (Unchanged logic) ---
async function sendUIUpdate(tabId, statName, text, logMessage = null, screenshotUrl = null) {
    try { await chrome.tabs.sendMessage(tabId, { action: 'update_status', statName, text, logMessage, screenshotUrl }); } catch (e) {}
}

async function getDomWithRetry(tabId, retries = 5) {
    for (let i = 0; i < retries; i++) {
        if (stopRequests.has(tabId)) return null;
        try {
            const res = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabId, { action: 'extract_dom' }, (response) => {
                    if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve(response);
                });
            });
            if (res && res.success) return res;
        } catch (e) { await sleep(1000); }
    }
    return null;
}

async function captureAuditScreenshot() {
    try {
        return await new Promise((resolve) => {
            chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 40 }, (dataUrl) => resolve(chrome.runtime.lastError ? null : dataUrl));
        });
    } catch (e) { return null; }
}

// --- MAIN LOOP ---
async function runAgentLoop(tabId, prompt, config) {
    let currentIteration = 1;
    let actionHistory = []; 
    let sessionTotalTokens = 0; 
    
    stopRequests.delete(tabId); 
    console.log(`[Background] Starting loop for tab ${tabId} using ${config.provider}`);

    while (currentIteration <= MAX_ITERATIONS) {
        if (stopRequests.has(tabId)) {
            await sendUIUpdate(tabId, 'saw', '🛑 Stopped', 'Agent execution aborted manually.');
            break;
        }

        await sendUIUpdate(tabId, 'searched', `Scanning... (Iter ${currentIteration})`, `Started iteration ${currentIteration}`);
        
        const domResponse = await getDomWithRetry(tabId);
        if (!domResponse) return;

        await sendUIUpdate(tabId, 'saw', `Thinking...`, `Found ${domResponse.dom.length} elements, asking ${config.provider}...`);
        
        try {
            // UPDATED: Pass the config object to the API router
            const apiResult = await callLLMAPI(tabId, prompt, domResponse.dom, actionHistory, config);
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
                if (targetEl) targetContext = `[${targetEl.tagName.toUpperCase()}] "${targetEl.text || targetEl.type}"`;
            }

            const actionDesc = `${decision.action.toUpperCase()} on ${targetContext}`;
            actionHistory.push(`${actionDesc} ${decision.value ? `(Typed: "${decision.value}")` : ''}`);

            const screenshotUrl = await captureAuditScreenshot();
            await sendUIUpdate(tabId, 'tried', decision.action.toUpperCase(), `Executing: ${actionDesc} ${decision.value ? `| Value: "${decision.value}"` : ''}`, screenshotUrl);
            
            const execResponse = await new Promise(resolve => {
                chrome.tabs.sendMessage(tabId, { action: 'execute_action', type: decision.action, target_id: decision.target_id, value: decision.value }, resolve);
            });

            if (!execResponse || !execResponse.success) throw new Error("Execution failed on page.");

            await sendUIUpdate(tabId, 'saw', `Waiting...`, `Action executed.`);
            await sleep(SLEEP_BETWEEN_ACTIONS_MS);
            currentIteration++;

        } catch (error) {
            if (error.message.includes("Stopped by user")) {
                 await sendUIUpdate(tabId, 'saw', `🛑 Stopped`, `Execution aborted manually.`);
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

// UPDATED: Support direct targetTabId for stopping agents from the dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start_agent') {
        runAgentLoop(request.tabId, request.prompt, request.config);
        sendResponse({ success: true });
    } else if (request.action === 'stop_agent') {
        // Stop from dashboard (request.targetTabId) OR from content script banner (sender.tab.id)
        const tabIdToStop = request.targetTabId || (sender.tab ? sender.tab.id : null);
        if (tabIdToStop) {
            stopRequests.add(tabIdToStop);
            console.log(`[Background] Stop requested for tab ID: ${tabIdToStop}`);
        }
        sendResponse({ success: true });
    }
    return true;
});