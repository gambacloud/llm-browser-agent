{
  "manifest_version": 3,
  "name": "LLM Browser Agent",
  "version": "1.0",
  "description": "Autonomous browser agent powered by LLM, operating entirely within the local context.",
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "Open Agent"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ]
}