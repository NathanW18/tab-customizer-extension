/**
 * AI Manual Tab Organizer - Hybrid Resilient Script
 * Features an intelligent structural fallback parser to handle loose model text streams.
 */

document.getElementById('organize-btn').addEventListener('click', async () => {
  const button = document.getElementById('organize-btn');
  const statusDiv = document.getElementById('status');
  
  button.disabled = true;
  statusDiv.innerHTML = "<i>Binding languageModel engine...</i>";

  try {
    // 1. Resolve Stable Extension Namespace for Chrome 138
    const aiEngine = (typeof chrome !== 'undefined' && chrome.languageModel) 
      ? chrome.languageModel 
      : (typeof window !== 'undefined' && window.LanguageModel ? window.LanguageModel : null);

    if (!aiEngine) {
      throw new Error("chrome.languageModel namespace is missing. Ensure permission is declared in manifest.json.");
    }

    statusDiv.innerHTML = "<i>Checking model availability status...</i>";
    const modelStatus = await aiEngine.availability();
    
    if (modelStatus === "unavailable") {
      throw new Error("Gemini Nano is unavailable. Check system requirements and flags.");
    }

    statusDiv.innerHTML = "<i>Analyzing active window layout...</i>";
    const tabs = await chrome.tabs.query({ currentWindow: true, pinned: false });
    
    const tabMetadata = tabs
      .filter(tab => tab.title && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:'))
      .map(tab => ({ id: tab.id, title: tab.title }));

    if (tabMetadata.length < 2) {
      statusDiv.innerText = "Insufficient open tabs to construct thematic clusters.";
      button.disabled = false;
      return;
    }

    statusDiv.innerHTML = "<i>Processing tokens via Gemini Nano...</i>";

    const session = await aiEngine.create({
      systemPrompt: "You are a data utility tool. Categorize a list of open tab objects into high-level descriptive topics or themes (e.g. SHOPPING, CODE, RESEARCH, ENTERTAINMENT, NEWS). Respond ONLY with a raw, valid JSON map where keys are uppercase topic names and values are arrays of integer IDs: {\"TOPIC\": [id1, id2]}. Do not wrap code blocks in markdown formatting or add extra conversational words."
    });

    const promptPayload = `Categorize these tabs by theme: ${JSON.stringify(tabMetadata)}`;
    const rawResponse = await session.prompt(promptPayload);
    session.destroy(); 

    statusDiv.innerHTML = "<i>Parsing semantic response streams...</i>";
    
    let clusters = {};
    
    // 2. HYBRID PARSING LOGIC: Try strict JSON parsing, fallback to unstructured stream processing
    try {
      let cleanJsonString = "";
      if (rawResponse.includes("```")) {
        cleanJsonString = rawResponse.split(/```(?:json)?/)[1].trim();
      } else {
        const jsonRegex = /\{[\s\S]*\}/;
        const match = rawResponse.match(jsonRegex);
        if (match) {
          cleanJsonString = match[0].trim();
        }
      }
      
      if (cleanJsonString) {
        clusters = JSON.parse(cleanJsonString);
      } else {
        throw new Error("No visible JSON structural boundaries found. Initializing fallback string extraction.");
      }
    } catch (parseError) {
      console.warn("Strict JSON parsing failed. Executing fuzzy text-stream line classification map...", parseError);
      
      // Fallback: Parse line-by-line if Gemini Nano returns a bulleted list text block
      const lines = rawResponse.split('\n');
      let currentTopic = "GENERAL";

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Detect potential topic headers (e.g., "TECH:", "**SHOPPING**", or "### NEWS")
        if (line.match(/^[A-Z\s]{3,}:?$/) || line.startsWith('**') || line.startsWith('#')) {
          currentTopic = line.replace(/[*#:]/g, '').trim().toUpperCase();
          continue;
        }

        // Search for tab IDs present in this text stream segment
        tabMetadata.forEach(tab => {
          if (line.includes(String(tab.id)) || line.toLowerCase().includes(tab.title.toLowerCase().substring(0, 10))) {
            if (!clusters[currentTopic]) {
              clusters[currentTopic] = [];
            }
            if (!clusters[currentTopic].includes(tab.id)) {
              clusters[currentTopic].push(tab.id);
            }
          }
        });
      }
    }

    // 3. Apply Grouping Modifications to window layouts
    let executionGroupsCreated = 0;

    for (const [topicName, tabIds] of Object.entries(clusters)) {
      if (Array.isArray(tabIds) && tabIds.length >= 2) {
        const validTabIds = tabIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (validTabIds.length >= 2) {
          const groupId = await chrome.tabs.group({ tabIds: validTabIds });
          
          const validChromeColors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
          const colorOffset = Math.abs(calculateStringHash(topicName)) % validChromeColors.length;

          await chrome.tabGroups.update(groupId, {
            title: topicName.substring(0, 15).toUpperCase(),
            color: validChromeColors[colorOffset]
          });
          executionGroupsCreated++;
        }
      }
    }

    if (executionGroupsCreated > 0) {
      statusDiv.innerHTML = `<b>Success!</b> Formed ${executionGroupsCreated} AI topic groups.`;
    } else {
      statusDiv.innerHTML = "AI generated topics, but no categories had 2 or more matching tabs to form a group.";
    }

  } catch (error) {
    console.error("AI Tab Organizer Pipeline Exception:", error);
    statusDiv.innerHTML = `<span style='color: #ea4335;'><b>Error:</b> ${error.message}</span>`;
  } finally {
    button.disabled = false;
  }
});

function calculateStringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}