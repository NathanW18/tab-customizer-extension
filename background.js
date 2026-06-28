chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sortTabs") {
    executeLocalTabSorting(sendResponse);
    return true; 
  }
});

async function executeLocalTabSorting(sendResponse) {
  try {
    // 1. Resolve the correct, modern Chrome AI namespace safely
    const aiEngine = (typeof chrome !== 'undefined' && chrome.aiLanguageModel) 
      ? chrome.aiLanguageModel 
      : ((typeof chrome !== 'undefined' && chrome.languageModel) ? chrome.languageModel : null);

    if (!aiEngine) {
      sendResponse({ 
        success: false, 
        error: "Chrome AI capabilities not found. Ensure your browser is fully updated and flags are enabled." 
      });
      return;
    }

    // 2. Query availability using the corrected namespace
    const availability = await aiEngine.availability();
    if (availability === 'no' || availability === 'unavailable') {
      sendResponse({ success: false, error: "Built-in AI model is disabled or unsupported on this device." });
      return;
    }

    // 3. Fetch data structures of all non-grouped open tabs
    const tabs = await chrome.tabs.query({ currentWindow: true, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE });
    if (tabs.length < 2) {
      sendResponse({ success: false, error: "Insufficient ungrouped tabs available to categorize." });
      return;
    }

    // 4. Clean the metadata array down to just essential properties
    const tabDataInput = tabs
      .filter(t => t.title && t.url && !t.url.startsWith('chrome://'))
      .map(t => ({ id: t.id, title: t.title }));

    // 5. Initialize the session via the correct namespace engine
    const aiSession = await aiEngine.create({
      systemPrompt: "You are a precise tab-sorting utility. Analyze an array of tab metadata objects and categorize them into semantic clusters. You must output raw JSON strings adhering strictly to the schema requested, without adding markdown styling or prose code blocks."
    });

    // 6. Request clustering prediction
    const responseText = await aiSession.prompt(
      `Categorize the following tabs into logical matching groups (e.g., Work, Social, Shopping, Finance, Dev Tools). 
      Return an array of objects, where each object contains a 'groupName' string and a 'tabIds' array of numbers.
      
      Tabs Data: ${JSON.stringify(tabDataInput)}
      
      Output format example:
      [{"groupName": "Shopping", "tabIds": [102, 105]}]`
    );

    // Explicit cleanup to protect background memory
    aiSession.destroy();

    // 7. Parse response and assemble groups
    const parsedGroups = JSON.parse(responseText.trim());
    
    for (const item of parsedGroups) {
      if (item.tabIds && item.tabIds.length > 0) {
        const newGroupId = await chrome.tabs.group({ tabIds: item.tabIds });
        
        // Assign a clean name to the newly formed tab group
        await chrome.tabGroups.update(newGroupId, { title: item.groupName.toUpperCase() });
      }
    }

    sendResponse({ success: true, count: parsedGroups.length });
  } catch (error) {
    console.error("Local sorting runtime exception:", error);
    sendResponse({ success: false, error: error.message });
  }
}