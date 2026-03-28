// content.js
console.log("[Agent] Content script successfully injected into page.");

const INTERACTIVE_SELECTORS = [
    'button',
    'a[href]',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[tabindex]:not([tabindex="-1"])'
];

function extractInteractiveElements() {
    console.log("[Agent] Starting DOM extraction...");
    const selectorString = INTERACTIVE_SELECTORS.join(', ');
    const rawElements = document.querySelectorAll(selectorString);
    const simplifiedDom = [];
    let elementCounter = 0;

    // Remove old visual badges if re-scanning
    document.querySelectorAll('.agent-id-cleanup').forEach(el => el.remove());

    rawElements.forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || el.offsetWidth === 0 || el.offsetHeight === 0) {
            return;
        }

        const id = elementCounter++;
        // Attach the ID directly to the DOM element so we can find it later to click!
        el.setAttribute('data-agent-id', id);

        let textContext = '';
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            textContext = el.placeholder || el.value || el.name || '';
        } else {
            textContext = el.innerText?.trim() || el.getAttribute('aria-label') || el.title || '';
        }

        textContext = textContext.substring(0, 100).replace(/\s+/g, ' ');

        simplifiedDom.push({
            id: id,
            tagName: el.tagName.toLowerCase(),
            type: el.type || '',
            text: textContext
        });

        addVisualAgentId(el, id);
    });

    console.log(`[Agent] Extraction complete. Found ${simplifiedDom.length} elements.`);
    return simplifiedDom;
}

function injectAgentStyles() {
    try {
        if (document.getElementById('agent-visual-styles')) return;
        const style = document.createElement('style');
        style.id = 'agent-visual-styles';
        style.innerHTML = `
            .agent-id-badge {
                position: absolute !important;
                background-color: #ff4757 !important;
                color: white !important;
                font-size: 11px !important;
                font-family: monospace !important;
                font-weight: bold !important;
                padding: 2px 4px !important;
                border-radius: 4px !important;
                z-index: 2147483647 !important;
                pointer-events: none !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.5) !important;
            }
        `;
        document.head.appendChild(style);
    } catch (error) {
        console.error("[Agent] Failed to inject styles:", error);
    }
}

function addVisualAgentId(el, id) {
    try {
        const rect = el.getBoundingClientRect();
        const badge = document.createElement('div');
        badge.className = 'agent-id-badge agent-id-cleanup';
        badge.innerText = id;
        
        badge.style.top = (rect.top + window.scrollY) + 'px';
        badge.style.left = (rect.left + window.scrollX) + 'px';

        document.body.appendChild(badge);
    } catch (error) {
        // Ignore specific element attachment failures
    }
}

// Listen for both extract and execute commands
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("[Agent] Message received from popup:", request);
    
    if (request.action === 'extract_dom') {
        injectAgentStyles();
        const dom = extractInteractiveElements();
        sendResponse({ success: true, dom: dom });
    } 
    else if (request.action === 'execute_action') {
        // The LLM decided on an action, time to execute it!
        const targetEl = document.querySelector(`[data-agent-id="${request.target_id}"]`);
        
        if (!targetEl) {
            console.error(`[Agent] Element with ID ${request.target_id} not found.`);
            sendResponse({ success: false, error: "Element not found on page" });
            return true;
        }

        try {
            if (request.type === 'click') {
                console.log(`[Agent] Clicking element ID ${request.target_id}`);
                targetEl.click();
            } 
            else if (request.type === 'type') {
                console.log(`[Agent] Typing into element ID ${request.target_id}:`, request.value);
                targetEl.focus();
                targetEl.value = request.value;
                // Trigger events so React/Vue sites register the change
                targetEl.dispatchEvent(new Event('input', { bubbles: true }));
                targetEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            sendResponse({ success: true });
        } catch (error) {
            console.error("[Agent] Action execution failed:", error);
            sendResponse({ success: false, error: error.message });
        }
    }
    
    return true; 
});