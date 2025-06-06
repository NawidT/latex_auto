import { similarity_all, get_cosine_similarity, average_vectors } from './vectorstores.js';
import { getEditPrompt, getInstructionalCompletePrompt, getSyntacticalCompletePrompt } from './prompts.js';

function OverleafCursor() {
  // STATE VARIABLES ------------------------------------------------------------
  let msg_chain = []; // contains messages as a dict with keys 'role' and 'content'
  let current_code_snippet = "";
  let api_key = "";
  let model_type = "";


  // API CALLS (Embedding and Chat) ------------------------------------------------------------------
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

  async function get_ai_response(messages) {
    if (model_type === "openai") {
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

    } else if (model_type === "gemini") {   // Gemini API with v1 beta api 
      console.log("Gemini model type selected");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${api_key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : m.role,
            parts: [{ text: m.content }]
          }))
        }),
      });

      const data = await response.json();
      console.log("Full Gemini API response:", JSON.stringify(data, null, 2));

      if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
        throw new Error("Invalid Gemini API response");
      }

      console.log('Gemini Response:', data.candidates[0].content.parts[0].text);
      return data.candidates[0].content.parts[0].text;

    } else if (model_type === "claude") {
      console.log("Claude model type selected");
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          "x-api-key": api_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1000,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        })
      });

      const data = await response.json();
      if (!data.content || !data.content[0]?.text) {
        throw new Error("Invalid Claude API response");
      }

      console.log("Claude Response:", data.content[0].text);
      return data.content[0].text;
    }
  }

  // HANDLING FUNCTIONS ----------------------------------------------------------
  async function handle_edit_text(user_request) {
    const prompt = getEditPrompt(current_code_snippet, user_request);
    msg_chain.push({ role: 'user', content: prompt });
    let response = await get_ai_response(msg_chain);
    // remove the ```latex and ``` from the response
    response = response.replace('```latex', '').replace('```', '');
    msg_chain.push({ role: 'assistant', content: response });
    return response;
  }

  async function create_autocomplete(unhighlighted_text, all_text, line_text) {
    if (all_text == "") return "";

    // get the embedding of the highlighted text
    const embedding = await get_text_embedding(unhighlighted_text);
    // get the cosine similarity between the highlighted embedding and the average instructional creational embedding
    const similarities = similarity_all(embedding);
    console.log(similarities);

    // find the largest similarity, since prompts for different autocomplete types have differing prompts
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

    // fine-tuned threshold, if not within select completion type, return empty string
    if (largest["similarity"] > 0.8) {
      let prompt = "";
      if (largest["name"] == "instructional_creational") {
        prompt = getInstructionalCompletePrompt(all_text, unhighlighted_text);
      } else if (largest["name"] == "unfinished_latex") {
        prompt = getSyntacticalCompletePrompt(line_text);
      } else {
        return "";
      }
      let response = await get_ai_response([{ role: 'user', content: prompt }]);
      response = response.replace('```latex', '').replace('```', '').trim().replace('`', '').replace('"', '');

      if (response == "" || response === line_text) {
        return "";
      }

      // Final Check: ensure response is not a failed answer, prevent frontend from fumbling
      let ai_ans_embedding = await get_text_embedding(response);
      const similarity = get_cosine_similarity(average_vectors[2]['vector'], ai_ans_embedding); // 2 is failed_answer
      if (similarity > 0.6) {
        return "";
      }

      console.log('Background response:', response);
      return response;
    }
    return "";
  }

  // CHROME LISTENERS -------------------------------DOCUMENTATION READERS START HERE-----------------------------
  /**
   * Definitions:
   * Highlighted text: 5 lines above and below the current line but highlighted section to change, easier for chat models to identify where to change
   * Surrounded text: 5 lines above and below the current line
   * All text: Most lines in the codebase, since Overleaf built in doesn't expose the entire file for optimization purposes
   * Line text: The line of code that the user is currently focused on.
   */
  // Listen for extension installation
  chrome.runtime.onInstalled.addListener(() => {
    console.log('LaTeX Auto Extension Installed');
  });
  // Listen for messages from content script or popup, distinction made in message.type
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
      create_autocomplete(message.surrounded_text, message.all_text, message.line_text)
        .then(response => {
          sendResponse({ text: response });
        })
        .catch(error => {
          console.error('Error processing autocomplete request:', error);
          sendResponse({ error: "Error processing request" });
        });
    } else if (message.type === 'UPDATE_API_KEY') {
      api_key = message.text;
      sendResponse({ status: 'success' });
    } else if (message.type === 'UPDATE_MODEL_TYPE') {
      // Handle model type update if needed
      model_type = message.text;
      sendResponse({ status: 'success' });
    }
    return true;
  });
}

// Initialize
OverleafCursor();
