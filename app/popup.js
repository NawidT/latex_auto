document.addEventListener('DOMContentLoaded', () => {
  const convertButton = document.getElementById('convertSelection');
  const resultDiv = document.getElementById('result');

  convertButton.addEventListener('click', async () => {
    // Send message to background script to get selected text
    chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' }, (response) => {
      if (response && response.text) {
        // Here you can add your LaTeX conversion logic
        resultDiv.textContent = `Selected text: ${response.text}`;
      } else {
        resultDiv.textContent = 'No text selected';
      }
    });
  });
}); 