const button = document.getElementById("submitButton");

button.addEventListener("click", function(event) {
    event.preventDefault();
    const input = document.getElementById('apiKeyInput').value;
    console.log('API: ' + input);

    chrome.runtime.sendMessage({ type: 'UPDATE_API_KEY', text: input }, function(response) {
        console.log('API key updated:', response);
    });
}
);

