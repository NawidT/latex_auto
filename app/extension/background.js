async function hitOAI(messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 1000
    })
  });
  const data = await response.json();
  console.log('OpenAI Response:', data);
  return data.choices[0].message.content;
}

function OverleafCursor() {
  // STATE VARIABLES ------------------------------------------------------------
  let msg_chain = []; // contains messages as a dict with keys 'role' and 'content'
  let all_text = "";
  let current_code_snippet = "";



  // HANDLING FUNCTIONS ----------------------------------------------------------
  async function handle_edit_text(user_request) {
    const prompt = getEditPrompt(current_code_snippet, user_request);
    console.log('Prompt:', prompt);
    msg_chain.push({ role: 'user', content: prompt });
    let response = await hitOAI(msg_chain);
    // remove the ```latex and ``` from the response
    response = response.replace('```latex', '').replace('```', '');
    msg_chain.push({ role: 'assistant', content: response });
    return response;
  }

  // CHROME LISTENERS ------------------------------------------------------------
  
  // Listen for extension installation
  chrome.runtime.onInstalled.addListener(() => {
    console.log('LaTeX Auto Extension Installed');
  });
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    if (message.type === 'EDIT_TEXT') {
      // Handle the message asynchronously
      handle_edit_text(message.text)
        .then(response => {
          console.log('Sending response:', response);
          sendResponse({ text: response });
        })
        .catch(error => {
          console.error('Error processing edit request:', error);
          sendResponse({ text: "Error processing request" });
        });
      return true; // Keep the message channel open for the async response
    } else if (message.type === 'UPDATE_ALL_TEXT') {
      all_text = message.text;
    } else if (message.type === 'UPDATE_CODE_SNIPPET') {
      current_code_snippet = message.text;
    }
    return false;
  });

}
// PROMPTS ----------------------------------------------------------------------
function getEditPrompt(code_snippet, user_request) {
  return `
  You are a LaTeX expert. You are given a LaTeX code snippet and a user request.
  You need to edit the LaTeX code snippet to fix the errors and improve the code.
  Keep the code clean, short, and concise.

  Here is the LaTeX code snippet:
  ${code_snippet}

  Here is the user request:
  ${user_request}

  RETURN ONLY THE LATEX CODE AS A STRING. INCLUDE \n BETWEEN LINES OF CODE. 
  `
  }

// Initialize the extension
OverleafCursor();
