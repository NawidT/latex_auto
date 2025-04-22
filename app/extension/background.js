// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('LaTeX Auto Extension Installed');
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'edit-selection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION' }, (response) => {
        if (response && response.text) {
          handleEditText(response.text);
        }
      });
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EDIT_TEXT') {
    sendResponse({
      text: "background said hi"
    });
  }
  return true;
});

// Function to handle text editing
function handleEditText(text) {
  // Here you can implement your text editing logic
  console.log('Editing text:', text);
  // For now, we'll just log the text
  // You can add your LaTeX conversion or other editing logic here
} 