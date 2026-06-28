
// 1. Listen for classification requests from the UI popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sortTabs") {
    executeLocalTabSorting(sendResponse);
    return true; // Keeps the communication channel open for asynchronous responses
  }
});

async function executeLocalTabSorting(sendResponse) {
  try {
    // 2. Query hardware availability for Built-In AI
    const availability = await ai.aiLanguageModel.availability();
    if (availability === 'no') {
      sendResponse({ success: false, error: "Built-in AI is disabled or unsupported on this device." });
      return;
    }

    // 3. Fetch data structures of all non-grouped open tabs
    const tabs = await chrome.tabs.query({ currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE });
    if (tabs.length < 2) {
      sendResponse({ success: false, error: "Insufficient ungrouped tabs available to categorize." });
      return;
    }

    // 4. Construct a structured array payload containing only structural metadata
    const tabDataInput = tabs.map(t => ({ id: t.id, title: t.title, url: t.url }));

    // 5. Initialize the Gemini Nano local session with clear system instructions
    const aiSession = await ai.aiLanguageModel.create({
      systemPrompt: "You are a precise tab-sorting utility. Analyze an array of tab metadata objects and categorize them into semantic clusters. You must output raw JSON strings adhering strictly to the schema requested, without adding markdown styling or prose code blocks."
    });

    // 6. Formulate structural expectations via Prompt Engineering
    const responseText = await aiSession.prompt(
      `Categorize the following tabs into logical matching groups (e.g., Work, Social, Shopping, Finance, Dev Tools). 
      Return an array of objects, where each object contains a 'groupName' string and a 'tabIds' array of numbers.
      
      Tabs Data: ${JSON.stringify(tabDataInput)}
      
      Output format example:
      [{"groupName": "Shopping", "tabIds": [102, 105]}]`
    );

    // Clean up resources immediately after execution to prevent background leak vectors
    aiSession.destroy();

    // 7. Parse output and apply modifications using Chrome's tabGroups API
    const parsedGroups = JSON.parse(responseText.trim());
    
    for (const item of parsedGroups) {
      if (item.tabIds && item.tabIds.length > 0) {
        const newGroupId = await chrome.tabs.group({ tabIds: item.tabIds });
        await chrome.tabGroups.update(newGroupId, { title: item.groupName });
      }
    }

    sendResponse({ success: true, count: parsedGroups.length });
  } catch (error) {
    console.error("Local sorting runtime exception:", error);
    sendResponse({ success: false, error: error.message });
  }
}