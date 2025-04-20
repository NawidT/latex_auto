// Create and inject the popup element
const popup = document.createElement('div');
popup.className = 'latex-auto-popup';
popup.innerHTML = `
  <button id="latex-auto-edit">
    Edit
    <span class="shortcut">⌘K</span>
  </button>
`;
document.body.appendChild(popup);

let selectedText = '';
let selectionRange = null;

// Function to position the popup near the selected text
function positionPopup(range) {
  const rect = range.getBoundingClientRect();
  popup.style.left = `${window.scrollX + rect.left}px`;
  popup.style.top = `${window.scrollY + rect.bottom + 10}px`;
}

// Handle text selection
document.addEventListener('mouseup', (e) => {
  const selection = window.getSelection();
  selectedText = selection.toString().trim();
  
  if (selectedText) {
    selectionRange = selection.getRangeAt(0);
    positionPopup(selectionRange);
    popup.style.display = 'block';
  } else {
    popup.style.display = 'none';
  }
});

// Handle keyboard shortcut
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (selectedText) {
      handleEdit(selectedText);
    }
  }
});

// Handle popup button click
document.getElementById('latex-auto-edit').addEventListener('click', () => {
  if (selectedText) {
    handleEdit(selectedText);
  }
});

// Function to handle editing
function handleEdit(text) {
  // Send message to background script
  chrome.runtime.sendMessage({
    type: 'EDIT_TEXT',
    text: text
  });
}

// Close popup when clicking outside
document.addEventListener('mousedown', (e) => {
  if (!popup.contains(e.target)) {
    popup.style.display = 'none';
  }
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_SELECTION') {
    sendResponse({ text: selectedText });
  }
  return true;
}); 