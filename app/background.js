// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('LaTeX Auto extension installed');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SELECTED_TEXT') {
    // Handle getting selected text
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION' }, (response) => {
        sendResponse(response);
      });
    });
    return true; // Required for async response
  }
}); 