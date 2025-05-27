const button = document.getElementById("submitButton");

button.addEventListener("click", function(event) {
    event.preventDefault();

    const input = document.getElementById('apiKeyInput').value;
    chrome.runtime.sendMessage({ type: 'UPDATE_API_KEY', text: input }, function(response) {});

    const modelType = document.getElementById('modelType').value;
    chrome.runtime.sendMessage({ type: 'UPDATE_MODEL_TYPE', text: modelType }, function(response) {});

    console.log("Model Type: " + modelType);

    // keep this commented out to avoid closing the window helps with debugging 
    //window.close();
}
);
