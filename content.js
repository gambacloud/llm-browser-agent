// content.js

console.log("[Agent] Content script injected.");

let agentCursor = null;
let agentBanner = null;
let bannerState = 'normal'; 

function injectAgentUI() {
    if (document.getElementById('llm-agent-wrapper')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'llm-agent-wrapper';
    Object.assign(wrapper.style, {
        position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)',
        width: '650px', maxWidth: '95%', zIndex: '2147483647',
        fontFamily: 'system-ui, sans-serif', transition: 'all 0.3s ease',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px', overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.98)', border: '1px solid #e2e8f0'
    });

    const header = document.createElement('div');
    header.id = 'llm-banner-header';
    header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid transparent;" id="llm-header-inner">
            <div style="display: flex; align-items: center; gap: 10px;">
                <strong style="color: #ff4757; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                    <span id="llm-status-icon">🤖</span> <span id="llm-title-text">Agent Active</span>
                </strong>
            </div>
            <div id="llm-stats-container" style="display: flex; gap: 15px; font-size: 12px; color: #475569;">
                <div>🔍 <span id="agent-stat-searched">Waiting...</span></div>
                <div>⚡ <span id="agent-stat-tried">-</span></div>
                <div style="color:#d97706; font-weight:bold;">🪙 <span id="agent-stat-tokens">0</span></div>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
                <button id="btn-copy-logs" style="background:#f1f5f9; border:1px solid #cbd5e1; cursor:pointer; font-size:11px; padding:3px 8px; border-radius:4px; color:#334155; font-weight:bold; margin-right:8px;" title="Copy entire log to clipboard">📄 Copy Logs</button>
                <button id="btn-stop" style="background:#fee2e2; border:1px solid #ef4444; cursor:pointer; font-size:11px; padding:3px 8px; border-radius:4px; color:#b91c1c; font-weight:bold; margin-right:8px;" title="Emergency Stop">🛑 STOP</button>
                <button id="btn-minimize" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;color:#64748b;" title="Minimize">_</button>
                <button id="btn-normal" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;color:#64748b;display:none;" title="Normal">🔲</button>
                <button id="btn-expand" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;color:#64748b;" title="Expand">⛶</button>
            </div>
        </div>
    `;
    wrapper.appendChild(header);

    const logContainer = document.createElement('div');
    logContainer.id = 'llm-banner-logs';
    Object.assign(logContainer.style, {
        height: '0px', overflowY: 'auto', backgroundColor: '#f8fafc',
        fontSize: '12px', color: '#334155', padding: '0px 15px',
        transition: 'all 0.3s ease', boxSizing: 'border-box'
    });
    wrapper.appendChild(logContainer);
    document.body.appendChild(wrapper);

    agentCursor = document.createElement('div');
    agentCursor.id = 'llm-agent-cursor';
    agentCursor.innerHTML = '🖱️';
    Object.assign(agentCursor.style, {
        position: 'absolute', top: '-50px', left: '-50px', fontSize: '24px',
        zIndex: '2147483647', pointerEvents: 'none', filter: 'drop-shadow(2px 4px 4px rgba(0,0,0,0.4))',
        transition: 'top 0.6s cubic-bezier(0.25, 1, 0.5, 1), left 0.6s cubic-bezier(0.25, 1, 0.5, 1)'
    });
    document.body.appendChild(agentCursor);

    // Event Listeners
    document.getElementById('btn-stop').addEventListener('click', () => {
        updateBannerStat('saw', 'Stopping...', 'User requested emergency stop.');
        chrome.runtime.sendMessage({ action: 'stop_agent' });
    });
    document.getElementById('btn-minimize').addEventListener('click', () => setBannerState('minimized'));
    document.getElementById('btn-normal').addEventListener('click', () => setBannerState('normal'));
    document.getElementById('btn-expand').addEventListener('click', () => setBannerState('expanded'));
    
    // NEW: Copy Logs functionality
    document.getElementById('btn-copy-logs').addEventListener('click', (e) => {
        const btn = e.target;
        const originalText = btn.innerText;
        const logLines = Array.from(document.getElementById('llm-banner-logs').children)
                              .map(div => div.innerText.replace('📋 Copy', '').trim())
                              .filter(text => text.length > 0)
                              .reverse(); // Make chronological
        
        navigator.clipboard.writeText(logLines.join('\n')).then(() => {
            btn.innerText = '✅ Copied!';
            setTimeout(() => btn.innerText = originalText, 2000);
        });
    });

    logContainer.addEventListener('click', async (e) => {
        if (e.target.classList.contains('agent-copy-btn')) {
            const btn = e.target;
            const dataUrl = btn.getAttribute('data-img');
            const originalText = btn.innerText;
            try {
                btn.innerText = '⏳ Copying...';
                const img = new Image();
                img.src = dataUrl;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width; canvas.height = img.height;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    canvas.toBlob(async (blob) => {
                        try {
                            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                            btn.innerText = '✅ Copied!'; btn.style.backgroundColor = '#10b981'; btn.style.color = 'white';
                        } catch (err) { btn.innerText = '❌ Failed'; }
                        setTimeout(() => { btn.innerText = originalText; btn.style.backgroundColor = 'rgba(255,255,255,0.9)'; btn.style.color = '#334155'; }, 2000);
                    }, 'image/png');
                };
            } catch (err) { btn.innerText = '❌ Error'; }
        }
    });
}

function setBannerState(state) {
    bannerState = state;
    const wrapper = document.getElementById('llm-agent-wrapper');
    const logs = document.getElementById('llm-banner-logs');
    document.getElementById('btn-minimize').style.display = 'inline-block';
    document.getElementById('btn-normal').style.display = 'inline-block';
    document.getElementById('btn-expand').style.display = 'inline-block';

    if (state === 'minimized') {
        wrapper.style.width = 'auto'; document.getElementById('llm-stats-container').style.display = 'none';
        logs.style.height = '0px'; logs.style.padding = '0px 15px'; document.getElementById('btn-minimize').style.display = 'none';
    } else if (state === 'normal') {
        wrapper.style.width = '650px'; document.getElementById('llm-stats-container').style.display = 'flex';
        logs.style.height = '0px'; logs.style.padding = '0px 15px'; document.getElementById('btn-normal').style.display = 'none';
    } else if (state === 'expanded') {
        wrapper.style.width = '650px'; document.getElementById('llm-stats-container').style.display = 'flex';
        logs.style.height = '300px'; logs.style.padding = '10px 15px'; document.getElementById('btn-expand').style.display = 'none';
    }
}

function updateBannerStat(statName, text, logMessage = null, screenshotUrl = null) {
    const el = document.getElementById(`agent-stat-${statName}`);
    if (el) el.innerText = text;
    
    if (logMessage) {
        const logContainer = document.getElementById('llm-banner-logs');
        if (logContainer) {
            const entry = document.createElement('div');
            entry.style.marginBottom = '12px'; entry.style.paddingBottom = '8px'; entry.style.borderBottom = '1px solid #e2e8f0';
            let contentHtml = `<span style="color:#94a3b8;">[${new Date().toLocaleTimeString()}]</span> <b>${logMessage}</b>`;
            if (screenshotUrl) {
                contentHtml += `<div style="position: relative; display: inline-block; margin-top: 8px;">
                    <img src="${screenshotUrl}" style="max-width: 250px; max-height: 150px; border-radius: 4px; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <button class="agent-copy-btn" data-img="${screenshotUrl}" style="position: absolute; top: 5px; right: 5px; background: rgba(255,255,255,0.9); border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer; color: #334155; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">📋 Copy</button>
                </div>`;
            }
            entry.innerHTML = contentHtml;
            logContainer.prepend(entry); 
        }
    }
}

function animateCursorTo(element) {
    if (!agentCursor || !element) return;
    const rect = element.getBoundingClientRect();
    agentCursor.style.top = `${rect.top + window.scrollY + (rect.height / 2) - 12}px`;
    agentCursor.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 12}px`;
}

// const INTERACTIVE_SELECTORS = ['button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea', '[role="button"]', '[role="link"]', '[tabindex]:not([tabindex="-1"])'];

function extractInteractiveElements() {
    const rawElements = document.querySelectorAll(INTERACTIVE_SELECTORS.join(', '));
    const simplifiedDom = [];
    let elementCounter = 0;
    document.querySelectorAll('.agent-id-cleanup').forEach(el => el.remove());

    rawElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0 || el.offsetHeight === 0) return;

        const id = elementCounter++;
        el.setAttribute('data-agent-id', id);

        let textContext = '';
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            const baseName = el.placeholder || el.name || el.type || 'input field';
            textContext = el.value ? `${baseName} (Current value: ${el.value})` : baseName;
        } 
        // --- NEW: Specifically handle Dropdowns ---
        else if (el.tagName === 'SELECT') {
            const options = Array.from(el.options).map(opt => `'${opt.text}' (value: '${opt.value}')`).join(', ');
            textContext = `Dropdown Options: [${options}] | Current Selection: '${el.value}'`;
        } 
        else {
            textContext = el.innerText?.trim() || el.getAttribute('aria-label') || el.title || '';
        }
        
        textContext = textContext.substring(0, 150).replace(/\s+/g, ' ');

        simplifiedDom.push({ id, tagName: el.tagName.toLowerCase(), type: el.type || '', text: textContext });
        
        const rect = el.getBoundingClientRect();
        const badge = document.createElement('div');
        badge.className = 'agent-id-badge agent-id-cleanup';
        badge.innerText = id;
        Object.assign(badge.style, {
            position: 'absolute', backgroundColor: '#ff4757', color: 'white', fontSize: '10px',
            fontFamily: 'monospace', fontWeight: 'bold', padding: '1px 3px', borderRadius: '3px',
            zIndex: '2147483646', pointerEvents: 'none', top: `${rect.top + window.scrollY}px`, left: `${rect.left + window.scrollX}px`
        });
        document.body.appendChild(badge);
    });
    return simplifiedDom;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    injectAgentUI();
    if (request.action === 'extract_dom') {
        sendResponse({ success: true, dom: extractInteractiveElements() });
    } 
    else if (request.action === 'execute_action') {
        const targetEl = document.querySelector(`[data-agent-id="${request.target_id}"]`);
        if (!targetEl) { sendResponse({ success: false, error: "Element not found" }); return true; }
        
        animateCursorTo(targetEl);
        setTimeout(() => {
            try {
                if (request.type === 'click') targetEl.click();
                else if (request.type === 'type') {
                    targetEl.focus(); 
                    targetEl.value = request.value;
                    targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                    targetEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                sendResponse({ success: true });
            } catch (error) { sendResponse({ success: false, error: error.message }); }
        }, 600);
        return true; 
    }
    else if (request.action === 'update_status') {
        updateBannerStat(request.statName, request.text, request.logMessage, request.screenshotUrl);
        sendResponse({ success: true });
    }
});

// --- NEW: Deep Shadow DOM query function ---
function querySelectorAllDeep(selector, root = document) {
    const results = Array.from(root.querySelectorAll(selector));
    
    // Create a TreeWalker to find all elements that might have a shadowRoot
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.shadowRoot) {
            results.push(...querySelectorAllDeep(selector, node.shadowRoot));
        }
    }
    return results;
}

// Expanded selectors to catch Salesforce menus and custom roles
const INTERACTIVE_SELECTORS = [
    'button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea', 
    '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', 
    '[role="combobox"]', '[tabindex]:not([tabindex="-1"])'
];

function extractInteractiveElements() {
    // 1. Clean up old badges
    document.querySelectorAll('.agent-id-cleanup').forEach(el => el.remove());

    // 2. Find elements piercing through Shadow DOMs
    const rawElements = querySelectorAllDeep(INTERACTIVE_SELECTORS.join(', '));
    const simplifiedDom = [];
    let elementCounter = 0;

    rawElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        
        // 3. Robust Visibility Check (Salesforce often hides things off-screen or with opacity 0)
        if (
            style.display === 'none' || 
            style.visibility === 'hidden' || 
            style.opacity === '0' ||
            rect.width === 0 || 
            rect.height === 0 ||
            rect.top < -100 // Hidden way scrolled up
        ) return;

        const id = elementCounter++;
        el.setAttribute('data-agent-id', id);

        // 4. Advanced Text Extraction (Prioritize Accessibility tags used by Salesforce)
        let textContext = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        
        if (!textContext) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                const baseName = el.placeholder || el.name || el.type || 'input field';
                textContext = el.value ? `${baseName} (Current value: ${el.value})` : baseName;
            } else if (el.tagName === 'SELECT') {
                const options = Array.from(el.options).map(opt => `'${opt.text}' (value: '${opt.value}')`).join(', ');
                textContext = `Dropdown Options: [${options}] | Current Selection: '${el.value}'`;
            } else {
                // Get inner text, but avoid massive blobs if it's a huge container
                textContext = el.innerText?.trim() || el.textContent?.trim() || '';
            }
        }
        
        // Clean up text
        textContext = textContext.substring(0, 150).replace(/\s+/g, ' ');

        // If we still have no text, and it's not a recognizable input, it might be a useless icon. Skip.
        if (!textContext && el.tagName !== 'INPUT') return;

        simplifiedDom.push({ 
            id, 
            tagName: el.tagName.toLowerCase(), 
            role: el.getAttribute('role') || el.type || '', 
            text: textContext 
        });
        
        // 5. Draw the Badge
        const badge = document.createElement('div');
        badge.className = 'agent-id-badge agent-id-cleanup';
        badge.innerText = id;
        Object.assign(badge.style, {
            position: 'absolute', backgroundColor: '#ff4757', color: 'white', fontSize: '10px',
            fontFamily: 'monospace', fontWeight: 'bold', padding: '1px 3px', borderRadius: '3px',
            zIndex: '2147483646', pointerEvents: 'none', 
            top: `${rect.top + window.scrollY}px`, left: `${rect.left + window.scrollX}px`
        });
        document.body.appendChild(badge);
    });
    
    return simplifiedDom;
}