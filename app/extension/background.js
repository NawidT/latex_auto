import { similarity_all } from './vectorstores.js';
import { getEditPrompt, getInstructionalCompletePrompt, getSyntacticalCompletePrompt } from './prompts.js';

function OverleafCursor() {
  // STATE VARIABLES ------------------------------------------------------------
  let msg_chain = []; // contains messages as a dict with keys 'role' and 'content'
  let current_code_snippet = "";
  let api_key = "";

  async function get_text_embedding(text) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });
    const data = await response.json();
    return data.data[0].embedding;
  }

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

  // split between instructional and syntactical completion
  async function handle_autocomplete(focused_text, around_text, all_text, line_text) {
    if (all_text == "") return "";

    // get the embedding of the focused text
    const focused_embedding = await get_text_embedding(focused_text);
    // get the cosine similarity between the focused embedding and the average instructional creational embedding
    const similarities = similarity_all(focused_embedding);
    console.log(similarities);
    
    // find the largest similarity
    let largest = {
      "similarity": -1,
      "name": ""
    }
    for (let i = 0; i < similarities.length; i++) {
      if (similarities[i]["similarity"] > largest["similarity"]) {
        largest = similarities[i];
      }
    }
    console.log('Largest similarity:', largest["similarity"]);
    // fine-tuned threshold, different prompts for different similarities
    if (largest["similarity"] > 0.4) {
      let prompt = "";
      if (largest["name"] == "instructional_creational") {
        prompt = getInstructionalCompletePrompt(all_text, around_text);
      } else if (largest["name"] == "unfinished_latex") {
        prompt = getSyntacticalCompletePrompt(line_text);
      }
      let response = await hitOAI([{role: 'user', content: prompt}]);
      response = response.replace('```latex', '').replace('```', '').trim().replace('`', '').replace('"', '');
      console.log('Background response:', response);
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
      handle_autocomplete(message.focused_text, message.around_text, message.all_text, message.line_text)
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

// Initialize the extension
OverleafCursor();
