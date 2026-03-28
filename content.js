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
        width: '600px', maxWidth: '90%', zIndex: '2147483647',
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
                <div>👀 <span id="agent-stat-saw">-</span></div>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
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

    document.getElementById('btn-stop').addEventListener('click', () => {
        updateBannerStat('saw', 'Stopping...', 'User requested emergency stop.');
        chrome.runtime.sendMessage({ action: 'stop_agent' });
    });
    
    document.getElementById('btn-minimize').addEventListener('click', () => setBannerState('minimized'));
    document.getElementById('btn-normal').addEventListener('click', () => setBannerState('normal'));
    document.getElementById('btn-expand').addEventListener('click', () => setBannerState('expanded'));
}

function setBannerState(state) {
    bannerState = state;
    const wrapper = document.getElementById('llm-agent-wrapper');
    const statsContainer = document.getElementById('llm-stats-container');
    const titleText = document.getElementById('llm-title-text');
    const logs = document.getElementById('llm-banner-logs');
    const headerInner = document.getElementById('llm-header-inner');

    document.getElementById('btn-minimize').style.display = 'inline-block';
    document.getElementById('btn-normal').style.display = 'inline-block';
    document.getElementById('btn-expand').style.display = 'inline-block';

    if (state === 'minimized') {
        wrapper.style.width = 'auto';
        statsContainer.style.display = 'none';
        titleText.style.display = 'none';
        logs.style.height = '0px'; logs.style.padding = '0px 15px';
        headerInner.style.borderBottom = 'none';
        document.getElementById('btn-minimize').style.display = 'none';
    } else if (state === 'normal') {
        wrapper.style.width = '600px';
        statsContainer.style.display = 'flex';
        titleText.style.display = 'inline';
        logs.style.height = '0px'; logs.style.padding = '0px 15px';
        headerInner.style.borderBottom = 'none';
        document.getElementById('btn-normal').style.display = 'none';
    } else if (state === 'expanded') {
        wrapper.style.width = '600px';
        statsContainer.style.display = 'flex';
        titleText.style.display = 'inline';
        logs.style.height = '150px'; logs.style.padding = '10px 15px';
        headerInner.style.borderBottom = '1px solid #e2e8f0';
        document.getElementById('btn-expand').style.display = 'none';
    }
}

function updateBannerStat(statName, text, logMessage = null) {
    const el = document.getElementById(`agent-stat-${statName}`);
    if (el) el.innerText = text;
    if (logMessage) {
        const logContainer = document.getElementById('llm-banner-logs');
        if (logContainer) {
            const entry = document.createElement('div');
            entry.style.marginBottom = '6px';
            entry.innerHTML = `<span style="color:#94a3b8;">[${new Date().toLocaleTimeString()}]</span> ${logMessage}`;
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

const INTERACTIVE_SELECTORS = ['button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea', '[role="button"]', '[role="link"]', '[tabindex]:not([tabindex="-1"])'];

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

        let textContext = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? (el.placeholder || el.value || el.name || '') : (el.innerText?.trim() || el.getAttribute('aria-label') || el.title || '');
        textContext = textContext.substring(0, 100).replace(/\s+/g, ' ');

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
        if (!targetEl) {
            sendResponse({ success: false, error: "Element not found" });
            return true;
        }
        animateCursorTo(targetEl);
        setTimeout(() => {
            try {
                if (request.type === 'click') targetEl.click();
                else if (request.type === 'type') {
                    targetEl.focus(); targetEl.value = request.value;
                    targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                    targetEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
                sendResponse({ success: true });
            } catch (error) { sendResponse({ success: false, error: error.message }); }
        }, 600);
        return true; 
    }
    else if (request.action === 'update_status') {
        updateBannerStat(request.statName, request.text, request.logMessage);
        sendResponse({ success: true });
    }
});