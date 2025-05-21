// Import CSS
const link = document.createElement('link');
link.href = chrome.runtime.getURL('content.css');
link.type = 'text/css';
link.rel = 'stylesheet';
document.head.appendChild(link);

function App() {
  // STATE VARIABLES ------------------------------------------------------------
  const edit_button = document.createElement('div'); // BUG: this isnt attached to cm-scroller so when user scrolls, chat view stays fixed on screen
  const chat_selected = document.createElement('div');
  let current_user_input = '';
  let selectionRange = null;
  let selectedLines = [];
  let change_since_autocomplete = true;

  let current_line = null; // this is the ELEMENT of the current line (cm-line)

  let prev_state = { // helps do early exit (no API call) within autocomplete function
    last_line_completed: null,
    prev_surrounding_lines: [],
    last_autocomplete : ""
  }

  // ELEMENTS --------------------------------------------------------------------
  edit_button.innerHTML =`
      <button class="latex-auto-edit">
        <span>Edit</span>\
        <span>cmd + k</span>
      </button>
  `;
  chat_selected.innerHTML =`
    <div class="chat-container">
      <input 
        class="latex-input"
        id="latex-input"
        type="text" 
        placeholder="Editing instructions..." 
        autocomplete="off"
        spellcheck="false"
      
      />
      <div class="footer">
        <span class="close-text">Esc to close</span>
        <button id="latex-close" class="latex-close">&times;</button>
      </div>
    </div>
  `;

  const latex_input = chat_selected.getElementsByClassName("latex-input")[0];
  const latex_close = chat_selected.getElementsByClassName("latex-close")[0];

  function positionElements(element, range) {
    const rect = range.getBoundingClientRect();
    element.style.left = `${window.scrollX + rect.left}px`;
    element.style.top = `${window.scrollY + rect.bottom + 10}px`;
  }

  function handle_elem_init(element) {
    element.style.position = 'absolute';
    element.style.display = 'none';
    element.style.zIndex = '9999';
    document.body.appendChild(element);
  }

  [edit_button, chat_selected].forEach(handle_elem_init);

  // FUNCTIONS -------------------------------------------------------------------

  /**
  * Multi-purpose function: Parse the codebase (Array of cm-line elements) and return lines with special character " %%% ".
  */
   function get_comment_lines() {
    return Array.from(document.querySelectorAll('.cm-line')).filter(line => line.innerText.includes("%%%"));
  }

  // CHAT FEATURE -------------------------------------------------------------

  /**
   * Sets CSS to open *chat_selected* to user and close *edit_button*
   */
  function open_chat_selected() {
    positionElements(chat_selected, selectionRange);
    edit_button.style.display = 'none';
    chat_selected.style.display = 'block';
    latex_input.focus();
  }

  /**
   * Sets CSS to close *chat_selected* and clear the UI up
   */
  function close_chat_selected() {
    positionElements(edit_button, selectionRange);
    chat_selected.style.display = 'none';
    current_user_input = ''; 
    latex_input.value = '';
    if (window.getSelection().toString().trim() !== '') {
      edit_button.style.display = 'block';
    } else {
      edit_button.style.display = 'none';
    }
  }

  /**
   * Custom function to grab the lines (HTMLELements) depending on user selection
   */
  function getSelectedLines(range) {
    const startNode = range.startContainer;
    const endNode = range.endContainer;

    const startLine = startNode.nodeType === 3 
      ? startNode.parentElement.closest('.cm-line') 
      : startNode.closest('.cm-line');
  
    const endLine = endNode.nodeType === 3 
      ? endNode.parentElement.closest('.cm-line') 
      : endNode.closest('.cm-line');
  
    if (!startLine || !endLine) return [];
  
    const allLines = Array.from(document.querySelectorAll('.cm-line'));
  
    const startIndex = allLines.indexOf(startLine);
    const endIndex = allLines.indexOf(endLine);
  
    if (startIndex === -1 || endIndex === -1) return [];
  
    const [from, to] = [startIndex, endIndex].sort((a, b) => a - b);
  
    return allLines.slice(from, to + 1);
  }


  /**
   * Ensures latex codebase lines integrity, too many aren't created unnecesarily.
   * Places AI suggested code into specific lines, depending whether the AI 
   * suggested more/less lines than user selected.
   */
  function update_selected_lines(new_code) {
    new_code = new_code.trim();
    new_code_lines = new_code.split('\n');
    selectedLines.forEach((line, index) => {
      if (index < selectedLines.length - 1) {
        if (index < new_code_lines.length) { 
          line.innerText = new_code_lines[index];
        } else { // case where new code has less lines than selected
          line.innerText = "";
        }
      } else {
        // case where new code has more lines than selected
        // grab the new code lines remaining
        let remaining_lines = new_code_lines.slice(index);
        let remaining_lines_str = remaining_lines.join('\n');
        line.innerText = remaining_lines_str;
      }
    });
  }

  /**
   * Runs when a set of lines is selected, props open the edit button to give user option to chat.
   * Also sends backend code_snippet (selected text) ahead of time, in case user decides chat, to reduce latency after user hits submit
   */
  function trigger_edit() {
    const selection = window.getSelection();
    selectedText = selection.toString().trim();
    if (selectedText !== '') {
      console.log('Selected text:', selectedText);
      chrome.runtime.sendMessage({ type: 'UPDATE_CODE_SNIPPET', text: selectedText});
      selectionRange = selection.getRangeAt(0);
      selectedLines = getSelectedLines(selectionRange);
      positionElements(edit_button, selectionRange);
      edit_button.style.display = 'block';
    }
  }

  /**
   * On enter/submit from *latex_input*, sends background Chrome message to handle API calls and formatting
   * Once AI response recieved, updates lines and removes *chat_selected*
   */
  async function handle_edit_text() {
    console.log('Submit via Enter:', current_user_input);
    const close_text = chat_selected.getElementsByTagName("span")[0];
    close_text.innerText = 'Loading...';
    try {
      // FIX THIS: Use a simpler approach with a timeout to ensure the message port stays open
      let response;
      chrome.runtime.sendMessage({ type: 'EDIT_TEXT', text: current_user_input }, (resp) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
          response = { text: "Error: " + chrome.runtime.lastError.message };
        } else {
          console.log('Message sent successfully, got response:', resp);
          response = resp;
          
          // Continue with the response handling here since we're in the callback
          console.log('Background Response:', response);
          if (response && response.text) {
            update_selected_lines(response.text);
            close_chat_selected();
          }
          close_text.innerText = 'Esc to close';
        }
      });
      
      console.log('Background Response:', response);
      if (response && response.text) {
        update_selected_lines(response.text);
        close_chat_selected();
      }
    } catch (error) {
      console.error('Failed to send message to background script:', error);
    }
    close_text.innerText = 'Esc to close';
  }

  // AUTOCOMPLETE FEATURE -------------------------------------------------------------
  
  /**
  * Grabs the comment lines and removes them from the codebase.
  */
  function remove_autocompleted_text() {
    if (current_line != null) {
      // recalc the codebase and find comment_lines
      let comments = get_comment_lines();
      if (comments.length > 0) {
        console.log('Comment Lines:', comments);
        // remove the comments from the codebase
        comments.forEach(line => {
          if (line.innerText.startsWith("%%%")) {
            line.remove();
          } else {
            // find the index of %%% in the line
            let index = line.innerText.indexOf(" %%% ");
            line.innerText = line.innerText.substring(0, index);
          }
        });
      }
      current_line = null;
    }
  }

  /**
   * Overarching function handling the outputs of the AI such that AI changes
   * can be embedded into latex codebase without overlaps/double-writes
   */
  function get_remaining_complete(focused_text, ai_complete) {
    // remove top and bottom lines of focused_text
    let focused_lines = focused_text.trim().split('\n');
    focused_lines.pop();
    focused_lines.shift();
    let ai_lines = ai_complete.trim().split('\n');
    let trimmed_focus_text = "";
    focused_lines.forEach((line) => {
      trimmed_focus_text += line.trim() + '\n'
    })
    let trimmed_ai_lines = [];
    ai_lines.forEach((line) => {
      trimmed_ai_lines.push(line.trim())
    })
    let n = trimmed_ai_lines.length;


    // find the top and bottom lines of ai_lines that are not in focused_lines
    let start_idx = 0;
    while (start_idx < n) {
      if (trimmed_focus_text.includes(trimmed_ai_lines.slice(0, start_idx + 1).join('\n'))) {
        start_idx++;
      } else {
        break;
      }
    }
    let end_idx = n - 1;
    while (end_idx >= 0) {
      if (trimmed_focus_text.includes(trimmed_ai_lines.slice(end_idx, n).join('\n'))) {
        end_idx--;
      } else {
        break;
      }
    }
    ai_complete = ai_lines.slice(start_idx, end_idx + 1).join('\n');
    console.log('AI complete:', ai_complete);
    let diff = autocomplete_diff(focused_text, ai_complete);
    console.log('Diff:', diff);
    return ai_complete;
  }

  /**
  * Main function to handle the autocomplete feature.
  */
  async function handle_autocomplete() {
    has_autocomplete_been_triggered = false;
    if (!change_since_autocomplete || current_line == null || current_line.innerText.includes(" %%% ") ) { 
      return null;
    }

    if (prev_state['last_line_completed'] == current_line.innerText ||
      (current_line.innerText == "" && prev_state['prev_surrounding_lines'].includes(current_line))
    ) {
      return prev_state['last_autocomplete'];
    }

    console.log('Handle autocomplete function called');

    let codebase = Array.from(document.querySelectorAll('.cm-line'));
    let cur_line_idx = codebase.indexOf(current_line);
    // find the +- 5 lines around the current line
    let start_idx = Math.max(0, cur_line_idx - 5);
    let end_idx = Math.min(codebase.length - 1, cur_line_idx + 5);
    let surrounded_text = "";
    let all_text = "";
    prev_state['prev_surrounding_lines'] = [];
    codebase.forEach((line, idx) => {
      if (idx >= start_idx && idx <= end_idx) {
        surrounded_text += line.innerText + "\n";
        prev_state['prev_surrounding_lines'].push(line);
      }
      all_text += line.innerText + "\n";
    });
    change_since_autocomplete = false;
    // send message to background script
    const response = await chrome.runtime.sendMessage({ 
      type: 'AUTOCOMPLETE', 
      surrounded_text: surrounded_text,
      all_text: all_text,
      line_text: current_line.innerText
    });
    // handle response from background script
    if (response.text == "" // handles case where background returns empty string
      || current_line == null // check if current line is null case when user triggered autocomplete before background responded
      || change_since_autocomplete // handles case where user moved to another line before background responded
    ) {
      return null;
    }
    last_line_completed = current_line.innerText;
    // handle response from background script
    let background_response = response.text.trim();
    // push all lines to bottom of current line with %%% and \n between them 
    let remaining_complete = get_remaining_complete(surrounded_text, background_response);
    console.log('Remaining complete:', remaining_complete);
    let comments = " %%%" + remaining_complete.split('\n').join('\n%%% ');
    current_line.innerText += comments;
    change_since_autocomplete = true;
    prev_state['last_autocomplete'] = remaining_complete;
  }

  /**
  * Handles the case where the user presses the right arrow key to trigger autocomplete. Checks if autocomplete is needed.
  */
  function trigger_autocomplete() {
    let comments = get_comment_lines();
    comments.forEach(line => {
      line.innerText = line.innerText.replace('%%%', '');
    });
    current_line = null;
    has_autocomplete_been_triggered = true;
    change_since_autocomplete = true;
  }

  /** 
   * Creates the diff files comparing the changes, could be used for UI purposes 
  */
  function autocomplete_diff(before, after) {
    /**
   * Compute LCS matrix for a and b
   */
    function buildLCS(a, b) {
      const m = a.length, n = b.length;
      const dp = Array(m+1).fill().map(() => Array(n+1).fill(0));
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = a[i-1] === b[j-1]
            ? dp[i-1][j-1] + 1
            : Math.max(dp[i-1][j], dp[i][j-1]);
        }
      }
      return dp;
    }

    /**
   * Walk back through the LCS matrix to build raw diff ops
   */
    function diffRaw(a, b, dp) {
      const ops = [];
      let i = a.length, j = b.length;
      while (i && j) {
        if (a[i-1] === b[j-1]) {
          ops.unshift({ type: 'equal',  char: a[i-1] });
          i--; j--;
        } else if (dp[i-1][j] >= dp[i][j-1]) {
          ops.unshift({ type: 'delete', char: a[i-1] });
          i--;
        } else {
          ops.unshift({ type: 'insert', char: b[j-1] });
          j--;
        }
      }
      while (i--) ops.unshift({ type: 'delete', char: a[i] });
      while (j--) ops.unshift({ type: 'insert', char: b[j] });
      return ops;
    }

    /**
    * Merge consecutive operations of the same type into segments
    */
    function mergeOps(ops) {
      if (!ops.length) return [];
      const segs = [];
      let { type, char: text } = ops[0];
      for (let k = 1; k < ops.length; k++) {
        if (ops[k].type === type) {
          text += ops[k].char;
        } else {
          segs.push({ type, text });
          ({ type, char: text } = ops[k]);
        }
      }
      segs.push({ type, text });
      return segs;
    }

    const dp  = buildLCS(before, after);
    const ops = diffRaw(before, after, dp);
    return mergeOps(ops);
  }

 

  // EVENT LISTENERS -------------------------------------------------------------
  edit_button.onclick = () => {
    open_chat_selected();
  };
  latex_input.addEventListener('input', (e) => { 
    current_user_input = e.target.value;
  });
  latex_input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await handle_edit_text();
    }
  });

  latex_close.addEventListener('click', (e) => {
    e.preventDefault();
    close_chat_selected();
  });

  document.addEventListener('mouseup', async (e) => {
    remove_autocompleted_text();
    if (edit_button.style.display === 'block' && !edit_button.contains(e.target)) {
      edit_button.style.display = 'none';
    } else {
      current_line = e.target.closest('.cm-line');
      setTimeout(() => {
        trigger_edit();
      }, 100); // 100ms delay to allow selection to complete
    }
  });

  // Keydowns activate the shortcuts or remove the edit button or suggested completions
  document.addEventListener('keydown',(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (window.getSelection().toString().trim() !== '') {
        open_chat_selected();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close_chat_selected();
    // autocomplete when right arrow key is pressed
    } else if (e.key === 'ArrowRight') {
      // Only trigger autocomplete if current_line exists and contains an autocomplete suggestion
      if (current_line) {
        trigger_autocomplete();
      }
    } else if (edit_button.style.display === 'block' && !edit_button.contains(e.target)) {
      edit_button.style.display = 'none';
    }
    if (change_since_autocomplete) {
      handle_autocomplete();
    } else {
      remove_autocompleted_text();
      change_since_autocomplete = true;
    }
  });
}

App();