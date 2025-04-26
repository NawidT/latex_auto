function OverleafCursor() {
  // STATE VARIABLES ------------------------------------------------------------
  let msg_chain = []; // contains messages as a dict with keys 'role' and 'content'
  let all_text = "";
  let current_code_snippet = "";
  let api_key = "";

  async function hitOAI(messages) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 1000
      })
    });
    const data = await response.json();
    
    console.log('OpenAI Response:', data.choices[0].message.content);
    return data.choices[0].message.content;
  }

  // HANDLING FUNCTIONS ----------------------------------------------------------
  async function handle_edit_text(user_request) {
    const prompt = getEditPrompt(current_code_snippet, user_request);
    msg_chain.push({ role: 'user', content: prompt });
    let response = await hitOAI(msg_chain);
    // remove the ```latex and ``` from the response
    response = response.replace('```latex', '').replace('```', '');
    msg_chain.push({ role: 'assistant', content: response });
    return response;
  }

  async function handle_autocomplete(current_line) {
    const lines = all_text.split('\n');
    let new_text = "";
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === current_line) {
        new_text += "----------------- AUTOCOMPLETE START ---------------------\n";
        new_text += lines[i] + "{paste the autocomplete here}" + "\n";
        new_text += "----------------- AUTOCOMPLETE END ---------------------\n";
      } else if (lines[i].trim() === "") {
        new_text += "";
      } else {
        new_text += lines[i] + "\n";
      }
    }
    const validation = getCheckAutocompleteNeededPrompt(all_text);
    let validation_response = await hitOAI([{role: 'user', content: validation}]);
    if (validation_response === "yes") {
      const prompt = getAutoCompletePrompt(new_text);
      let response = await hitOAI([{role: 'user', content: prompt}]);
      response = response.replace('```latex', '').replace('```', '').trim().replace('`', '').replace('"', '');
      return response;
    } else {
      return "";
    }
  }

  // CHROME LISTENERS ------------------------------------------------------------
  
  // Listen for extension installation
  chrome.runtime.onInstalled.addListener(() => {
    console.log('LaTeX Auto Extension Installed');
  });
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EDIT_TEXT') {
      // Handle the message asynchronously
      handle_edit_text(message.text)
        .then(response => {
          sendResponse({ text: response });
        })
        .catch(error => {
          console.error('Error processing edit request:', error);
          sendResponse({ error: "Error processing request" });
        });
    } else if (message.type === 'UPDATE_ALL_TEXT') {
      all_text = message.text;
    } else if (message.type === 'UPDATE_CODE_SNIPPET') {
      current_code_snippet = message.text
    } else if (message.type === 'AUTOCOMPLETE') {
      handle_autocomplete(message.text)
        .then(response => {
          sendResponse({ text: response, completed_line: message.text });
        })
        .catch(error => {
          console.error('Error processing autocomplete request:', error);
          sendResponse({ error: "Error processing request" });
        });
    }
    return true;
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_API_KEY') {
      api_key = message.text;
      sendResponse({ status: 'success' });
    }
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

function getCheckAutocompleteNeededPrompt(all_text) {
  return `
  You are a LaTeX expert. Based on the LaTeX codebase and highlighted area using dashes, determine if the an autocomplete is needed.
  Return "yes" if the an autocomplete is needed, otherwise return "no". Do not repeat code that is nearby the highlighted area.
  Be very greedy with how many times you return "yes".

  Example1:
  all_text = """
  \documentclass{article}
  \begin{document}
  ------- AUTOCOMPLETE START ---------
  Hello, wo {paste the autocomplete here}
  ------- AUTOCOMPLETE END ---------
  \end{document}
  """
  Returns: "yes"

  Example2:
  all_text = """
  \documentclass{article}
  \begin{document}
  ------- AUTOCOMPLETE START ---------
  Hello, world! {paste the autocomplete here}
  ------- AUTOCOMPLETE END ---------
  \end{document}
  """
  Returns: "no"

  Here is the entire LaTeX codebase:
  ${all_text}

  RETURN ONLY "yes" OR "no". If you are unsure, return "no". 
  Only return "yes" if you are very confident that a meaningful and relevant autocomplete is needed.
`
}


function getAutoCompletePrompt(all_text) {
  return `
  You are a LaTeX expert. Based on the entire latex codebase, suggest a completion for the line highlighted by dashes.
  Consider the entire latex codebase. Make the changes small. Make sure the change doesn't conflict with the rest of the codebase.
  Make sure the change doesn't break the code.

  Example1:
  all_text = """
  \documentclass{article}
  \begin{document}
  ------- AUTOCOMPLETE START ---------
  Hello, wo {paste the autocomplete here}
  ------- AUTOCOMPLETE END ---------
  \end{document}
  """
  Returns: "rld!"

  Example2:
  all_text = """
  \documentclass{article}
  \begin{document}
  ------- AUTOCOMPLETE START ---------
  Hello, world! {paste the autocomplete here}
  ------- AUTOCOMPLETE END ---------
  \end{document}
  """
  Returns: ""


  The entire latex codebase:
  ${all_text}

  RETURN ONLY ONE LINE OF LATEX CODE AS A STRING. 
  RETURN ONLY THE NEW PIECES OF CODE THAT NEED TO BE ADDED.
  `
}

// Initialize the extension
OverleafCursor();
