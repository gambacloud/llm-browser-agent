// popup.js
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('openDashboardBtn').addEventListener('click', () => {
        // This opens our new dashboard.html file in a full Chrome tab!
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
});