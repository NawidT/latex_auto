// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SELECTION') {
    // Get the selected text from the page
    const selectedText = window.getSelection().toString();
    sendResponse({ text: selectedText });
  }
  return true; // Required for async response
});

// Example function to handle text selection
document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString();
  if (selectedText) {
    // You can add custom logic here to handle selected text
    console.log('Selected text:', selectedText);
  }
}); 