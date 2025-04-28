function OverleafCursor() {
  // STATE VARIABLES ------------------------------------------------------------
  let msg_chain = []; // contains messages as a dict with keys 'role' and 'content'
  let current_code_snippet = "";
  let api_key = "";
  let model_type = "gpt-4o-mini"; 

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

  async function handle_autocomplete(focused_text, around_text, all_text) {
    if (all_text == "") return "";

    const validation = getCheckAutocompleteNeededPrompt(focused_text);
    let validation_response = await hitOAI([{role: 'user', content: validation}]);
    validation_response = validation_response.replace('```json', '').replace('```', '');
    
    try {
      // Try to parse the JSON response
      validation_response = JSON.parse(validation_response);
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      // If parsing fails, try to extract the answer using regex
      const answerMatch = validation_response.match(/"answer"\s*:\s*"([^"]+)"/);
      const reasoningMatch = validation_response.match(/"reasoning"\s*:\s*"([^"]+)"/);
      
      if (answerMatch && reasoningMatch) {
        validation_response = {
          answer: answerMatch[1],
          reasoning: reasoningMatch[1]
        };
      } else {
        // If we can't extract the answer, default to "no"
        validation_response = {
          answer: "no",
          reasoning: "Failed to parse response"
        };
      }
    }
    
    console.log('Validation Response:', validation_response);
    
    if (validation_response["answer"] === "yes") {
      const prompt = getAutoCompletePrompt(all_text, around_text, validation_response["reasoning"]);
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
    } else if (message.type === 'UPDATE_CODE_SNIPPET') {
      current_code_snippet = message.text
    } else if (message.type === 'AUTOCOMPLETE') {
      handle_autocomplete(message.focused_text, message.around_text, message.all_text)
        .then(response => {
          sendResponse({text: response});
        })
        .catch(error => {
          console.error('Error processing autocomplete request:', error);
          sendResponse({ error: "Error processing request" });
        });
    }
    return true;
  });

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_API_KEY') {
      api_key = message.text;
      sendResponse({ status: 'success' });
    } else if (message.type === 'UPDATE_MODEL_TYPE') {
      // Handle model type update if needed
      model_type = message.text;
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

function getCheckAutocompleteNeededPrompt(focused_text) {
  return `
  You are a LaTeX expert. Based on the LaTeX codebase and highlighted area using dashes, determine if the an autocomplete is needed.
  Return "yes" if the an autocomplete is needed, otherwise return "no". Do not repeat code that is nearby the highlighted area.
  Be very greedy with how many times you return "yes". 

  Here is the highlighted area:
  ${focused_text}

  Only return "yes" if you are very confident that a meaningful and relevant autocomplete is needed. Say no more often than yes.
  RETURN JSON IN THE FOLLOWING FORMAT:

  {{
     "reasoning": "reasoning for your answer",
     "answer": "yes" or "no"
  }}
`
}


function getAutoCompletePrompt(all_text, plusminus_text, goal) {
  return `
  The code provided below is a snippet of a larger LaTeX codebase. Assume not all the code is provided.
  Complete the latex code in only the lines provided. Do not create new lines of code.
  Here is the goal of the completion:
  ${goal}

  Here is the LaTeX codebase:
  ${all_text}

  Complete the following latex code:
  ${plusminus_text}

  RETURN ONLY THE LATEX CODE PROVIDED WITH THE COMPLETION CODE.
  `
}

// Initialize the extension
OverleafCursor();
