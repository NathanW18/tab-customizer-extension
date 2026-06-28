// background.js

// 1. Listen for classification requests from the UI popup controller
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sortTabs") {
    executeLocalTabSorting(sendResponse);
    return true; // Keep the communication pipeline open for asynchronous processing
  }
});

async function executeLocalTabSorting(sendResponse) {
  try {
    // 2. Universal 4-Tier Polyfill Resolution (Handles rapid Chromium API renaming)
    let aiEngine = null;

    if (typeof ai !== 'undefined' && ai.languageModel) {
      aiEngine = ai.languageModel;
    } else if (typeof chrome !== 'undefined' && chrome.languageModel) {
      aiEngine = chrome.languageModel;
    } else if (typeof chrome !== 'undefined' && chrome.aiLanguageModel) {
      aiEngine = chrome.aiLanguageModel;
    } else if (typeof LanguageModel !== 'undefined') {
      aiEngine = LanguageModel;
    }

    // Defensive gate check: Fail gracefully if browser configuration blocks the API
    if (!aiEngine) {
      sendResponse({ 
        success: false, 
        error: "Namespace Missing. The browser hasn't exposed the model to extensions yet. Please check chrome://on-device-internals to confirm download." 
      });
      return;
    }

    // 3. Query availability of the on-device Gemini Nano model weights
    const availability = await aiEngine.availability();
    if (availability === 'no' || availability === 'unavailable') {
      sendResponse({ success: false, error: "Built-in AI model is disabled or unsupported on this device." });
      return;
    }

    // 4. Fetch all open, ungrouped tabs inside the current active window context
    const tabs = await chrome.tabs.query({ currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE });
    if (tabs.length < 2) {
      sendResponse({ success: false, error: "Insufficient ungrouped tabs available to categorize (Need at least 2)." });
      return;
    }

    // 5. Data Sanitization & Minimization: Stripping bloated tab metrics down to essentials
    const tabDataInput = tabs
      .filter(t => t.title && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('about:'))
      .map(t => ({ id: t.id, title: t.title }));

    if (tabDataInput.length < 2) {
      sendResponse({ success: false, error: "No filterable system tabs available to organize." });
      return;
    }

    // 6. Initialize the local LLM using initialPrompts (Reduces latency and prevents hanging)
    const aiSession = await aiEngine.create({
      initialPrompts: [
        { 
          role: 'system', 
          content: "You are a backend JSON organizer. Categorize tab data into uppercase groups. Output ONLY a valid JSON array of objects. Never write prose or use markdown blocks like ```json." 
        }
      ]
    });

    // 7. Fire a tightly targeted prompt with explicit structural examples
    const promptPayload = `Cluster these open tabs by topic:
    ${JSON.stringify(tabDataInput)}

    Respond exactly like this example template, with no extra text:
    [{"groupName": "Tech", "tabIds": [1234, 5678]}]`;

    const responseText = await aiSession.prompt(promptPayload);
    
    // Explicit V8 garbage cleanup to instantly protect background GPU memory allocation
    aiSession.destroy(); 

    // 8. Robust Fallback Parser: Cleans out rogue markdown markers if the model slips up
    let cleanText = responseText.trim();
    if (cleanText.includes("```")) {
      cleanText = cleanText.replace(/```json|```markdown|```/g, "").trim();
    }

    // 9. Parse text payload and apply modifications using Chrome's tabGroups API
    const parsedGroups = JSON.parse(cleanText);
    let structuredGroupCount = 0;
    
    for (const item of parsedGroups) {
      if (item.tabIds && item.tabIds.length > 0) {
        // Enforce valid integer typing for Chrome's native structural channel mapping
        const validTabIds = item.tabIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (validTabIds.length > 0) {
          // Construct visual cluster container inside the window dashboard
          const newGroupId = await chrome.tabs.group({ tabIds: validTabIds });
          
          // Apply uppercase layout titles to the group container properties
          await chrome.tabGroups.update(newGroupId, { title: item.groupName.toUpperCase() });
          structuredGroupCount++;
        }
      }
    }

    // Send complete structural acknowledgment back to popup.js UI controller
    sendResponse({ success: true, count: structuredGroupCount });

  } catch (error) {
    console.error("Local sorting runtime exception:", error);
    sendResponse({ success: false, error: `Pipeline Exception: ${error.message}` });
  }
}