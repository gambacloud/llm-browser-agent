// content.js

console.log("[Agent] Content script injected.");

let agentCursor = null;
let _taskCount = 0;    // how many task steps we received
let _currentTask = 0; // which step is currently active

function injectAgentUI() {
    if (document.getElementById('llm-agent-wrapper')) return;

    // Inject keyframe + task item styles once
    if (!document.getElementById('llm-agent-styles')) {
        const style = document.createElement('style');
        style.id = 'llm-agent-styles';
        style.textContent = `
            @keyframes llm-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
            #llm-pulse-dot { animation: llm-pulse 1.8s ease-in-out infinite; }
            #llm-pulse-dot.idle { color:#4ade80; }
            #llm-pulse-dot.busy { color:#60a5fa; animation: llm-pulse 0.9s ease-in-out infinite; }
            #llm-pulse-dot.error { color:#f87171; animation:none; }
            #llm-pulse-dot.done  { color:#4ade80; animation:none; }
            .llm-task-row { display:flex; align-items:flex-start; gap:8px; padding:5px 0;
                font-size:12px; color:#94a3b8;
                border-bottom:1px solid rgba(255,255,255,0.06); }
            .llm-task-row:last-child { border-bottom:none; }
            .llm-task-row.active { color:#fbbf24; }
            .llm-task-row.done   { color:#4ade80; }
            .llm-task-icon { width:14px; text-align:center; flex-shrink:0; font-size:11px; margin-top:1px; }
            #btn-tasks:hover, #btn-llm-stop:hover { opacity:0.8; }
        `;
        document.head.appendChild(style);
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'llm-agent-wrapper';
    Object.assign(wrapper.style, {
        position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483647', fontFamily: 'system-ui, -apple-system, sans-serif',
        borderRadius: '10px', overflow: 'hidden',
        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
        minWidth: '380px', maxWidth: '90vw'
    });

    // --- Header row (always visible) ---
    wrapper.innerHTML = `
        <div id="llm-banner-header" style="display:flex;align-items:center;gap:8px;padding:8px 12px;
            background:rgba(15,23,42,0.93);backdrop-filter:blur(10px);">
            <span id="llm-pulse-dot" class="busy" style="font-size:9px;">●</span>
            <span id="llm-status-text" style="color:#e2e8f0;font-size:12px;font-weight:500;flex:1;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Initializing…</span>
            <span id="llm-iter-text" style="color:#475569;font-size:11px;flex-shrink:0;"></span>
            <span id="llm-token-text" style="color:#f59e0b;font-size:11px;font-weight:600;
                flex-shrink:0;margin-left:4px;">0 tkn</span>
            <button id="btn-tasks" style="background:rgba(255,255,255,0.07);border:1px solid
                rgba(255,255,255,0.13);color:#94a3b8;cursor:pointer;font-size:11px;
                padding:3px 8px;border-radius:5px;white-space:nowrap;margin-left:4px;">▼ Tasks</button>
            <button id="btn-llm-stop" style="background:rgba(239,68,68,0.18);border:1px solid
                rgba(239,68,68,0.38);color:#fca5a5;cursor:pointer;font-size:11px;
                padding:3px 8px;border-radius:5px;font-weight:600;white-space:nowrap;">■ Stop</button>
        </div>
        <div id="llm-tasks-panel" style="display:none;padding:10px 14px 8px;
            background:rgba(15,23,42,0.88);backdrop-filter:blur(10px);
            border-top:1px solid rgba(255,255,255,0.07);">
            <div style="font-size:10px;color:#334155;text-transform:uppercase;
                letter-spacing:0.06em;margin-bottom:6px;">Task Plan</div>
            <div id="llm-task-list"></div>
        </div>
    `;
    document.body.appendChild(wrapper);

    // Cursor
    agentCursor = document.createElement('div');
    agentCursor.id = 'llm-agent-cursor';
    agentCursor.textContent = '🖱️';
    Object.assign(agentCursor.style, {
        position: 'absolute', top: '-50px', left: '-50px', fontSize: '24px',
        zIndex: '2147483647', pointerEvents: 'none',
        filter: 'drop-shadow(2px 4px 4px rgba(0,0,0,0.4))',
        transition: 'top 0.6s cubic-bezier(0.25,1,0.5,1), left 0.6s cubic-bezier(0.25,1,0.5,1)'
    });
    document.body.appendChild(agentCursor);

    document.getElementById('btn-llm-stop').addEventListener('click', () => {
        updateBannerStat('saw', '🛑 Stopping…');
        chrome.runtime.sendMessage({ action: 'stop_agent' });
    });

    let tasksOpen = false;
    document.getElementById('btn-tasks').addEventListener('click', () => {
        tasksOpen = !tasksOpen;
        document.getElementById('llm-tasks-panel').style.display = tasksOpen ? 'block' : 'none';
        document.getElementById('btn-tasks').textContent = tasksOpen ? '▲ Tasks' : '▼ Tasks';
    });
}

function updateBannerStat(statName, text) {
    const statusEl  = document.getElementById('llm-status-text');
    const pulseEl   = document.getElementById('llm-pulse-dot');
    const iterEl    = document.getElementById('llm-iter-text');
    const tokenEl   = document.getElementById('llm-token-text');

    if (statName === 'tokens') {
        if (tokenEl) tokenEl.textContent = `${text} tkn`;
        return;
    }

    // All other stat names update the main status line
    if (statusEl) statusEl.textContent = text;

    // Update iteration counter when 'searched' stat carries iter info
    if (statName === 'searched' && iterEl) {
        const match = text.match(/(\d+\/\d+)/);
        iterEl.textContent = match ? match[1] : '';
    }

    // Update pulse dot class based on semantics
    if (pulseEl) {
        if (statName === 'saw') {
            const t = text.toLowerCase();
            if (t.includes('stop') || t.includes('error')) pulseEl.className = 'error';
            else if (t.includes('achieved') || t.includes('done') || t.includes('✓')) pulseEl.className = 'done';
            else pulseEl.className = 'busy';
        }
    }
}

function animateCursorTo(element) {
    if (!agentCursor || !element) return;
    const rect = element.getBoundingClientRect();
    agentCursor.style.top = `${rect.top + window.scrollY + (rect.height / 2) - 12}px`;
    agentCursor.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 12}px`;
}

// Dead copy of extractInteractiveElements removed — real version defined below.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    injectAgentUI();

    if (request.action === 'extract_dom') {
        sendResponse({ success: true, dom: extractInteractiveElements() });

    } else if (request.action === 'execute_action') {
        const targetEl = document.querySelector(`[data-agent-id="${request.target_id}"]`);
        if (!targetEl) { sendResponse({ success: false, error: 'Element not found' }); return true; }
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

    } else if (request.action === 'update_status') {
        updateBannerStat(request.statName, request.text);
        sendResponse({ success: true });

    } else if (request.action === 'set_tasks') {
        // Populate task checklist and auto-open panel
        const list = document.getElementById('llm-task-list');
        if (list && Array.isArray(request.tasks)) {
            _taskCount = request.tasks.length;
            _currentTask = 0;
            list.innerHTML = '';
            request.tasks.forEach((taskText, i) => {
                const row = document.createElement('div');
                row.className = 'llm-task-row' + (i === 0 ? ' active' : '');
                row.id = `llm-task-${i}`;
                const icon = document.createElement('span');
                icon.className = 'llm-task-icon';
                icon.textContent = i === 0 ? '⏳' : '○';
                const label = document.createElement('span');
                label.textContent = taskText;
                row.appendChild(icon); row.appendChild(label);
                list.appendChild(row);
            });
            // Auto-open tasks panel
            document.getElementById('llm-tasks-panel').style.display = 'block';
            document.getElementById('btn-tasks').textContent = '▲ Tasks';
        }
        sendResponse({ success: true });

    } else if (request.action === 'tick_task') {
        // Mark current active step done, advance to next
        const doneRow = document.getElementById(`llm-task-${request.index}`);
        if (doneRow) {
            doneRow.classList.remove('active');
            doneRow.classList.add('done');
            doneRow.querySelector('.llm-task-icon').textContent = '✓';
        }
        const nextRow = document.getElementById(`llm-task-${request.index + 1}`);
        if (nextRow) {
            nextRow.classList.add('active');
            nextRow.querySelector('.llm-task-icon').textContent = '⏳';
        }
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

        // PERF: skip elements entirely outside the current viewport (below fold)
        if (rect.top > window.innerHeight + 200) return;

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

        // If we still have no text, and it's not a form field, it might be a useless icon. Skip.
        if (!textContext && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;

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
    
    // PERF: deduplicate elements with identical tag+text to cut LLM token usage
    const seen = new Set();
    return simplifiedDom.filter(el => {
        const key = `${el.tagName}:${el.text.substring(0, 40)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}