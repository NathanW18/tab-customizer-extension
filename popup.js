document.addEventListener('DOMContentLoaded', () => {
  const sortBtn = document.getElementById('sort-btn');
  const statusDisplay = document.getElementById('status-text');

  if (!sortBtn || !statusDisplay) {
    console.error("Required UI elements are missing from the DOM layer.");
    return;
  }

  sortBtn.addEventListener('click', async () => {
    sortBtn.disabled = true;
    statusDisplay.textContent = "Analyzing context locally via Gemini Nano...";
    
    chrome.runtime.sendMessage({ action: "sortTabs" }, (response) => {
      sortBtn.disabled = false;
      
      if (chrome.runtime.lastError) {
        statusDisplay.textContent = `Channel Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      
      if (response && response.success) {
        statusDisplay.textContent = `Successfully clustered active workspaces into ${response.count} groups!`;
      } else {
        statusDisplay.textContent = `Sorting Failed: ${response ? response.error : 'Unknown background crash'}`;
      }
    });
  });
});