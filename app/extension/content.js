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
  let all_text = "";

  let current_line = null; // this is the ELEMENT of the current line (cm-line)
  let last_autocompleted_line = null;

  let change_since_autocomplete = false;
  let has_autocomplete_been_triggered = false;

  // ELEMENTS --------------------------------------------------------------------
  edit_button.innerHTML =`
      <button class="latex-auto-edit">
        <span>Edit</span>
        <span class="shortcut">⌘K</span>
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

  // FUNCTIONS -------------------------------------------------------------------

  function positionElements(element,range) {
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
  let elements = [edit_button, chat_selected];
  elements.forEach(handle_elem_init);

  function open_chat_selected() {
    positionElements(chat_selected, selectionRange);
    edit_button.style.display = 'none';
    chat_selected.style.display = 'block';
    latex_input.focus();
  }

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

  function getSelectedCmLines() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return [];
  
    const range = selection.getRangeAt(0);
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

  // @param new_code: large string of code, lines are separated by \n.
  function update_selected_lines(new_code) {
    new_code = new_code.trim();
    new_code_lines = new_code.split('\n');
    console.log('New code lines:', new_code_lines);
    diff = new_code_lines.length - selectedLines.length;
    
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

  function remove_autocompleted_text() {
    if (current_line != null) {
      current_line.innerText = current_line.innerText.replace(/ %%% .*/, '');
    }
  }

  function get_remaining_complete(last_autocompleted_line) {
    for (let i = 0; i < current_line.innerText.length; i++) {
      if (current_line.innerText[i] !== last_autocompleted_line[i]) {
        return last_autocompleted_line.slice(i);
      }
    }
    return "";
  }

  async function handle_autocomplete() {
    last_autocompleted_line = null;
    has_autocomplete_been_triggered = false;
    if (current_line == null || current_line.innerText == "") { 
      return null;
    }
    change_since_autocomplete = false;
    const response = await chrome.runtime.sendMessage({ type: 'AUTOCOMPLETE', text: current_line.innerText});
    if (response.text === '' 
      || current_line == null // check if current line is null case when user triggered autocomplete before background responded
      || change_since_autocomplete // handles case where user moved to another line before background responded
      || response.completed_line != current_line.innerText // handles case where user moved to another line before background responded or changed current line text
      || current_line.innerText === response.text.trim() // handles case where autocomplete is not needed
      || current_line.innerText.includes(" %%% ") // handles case where autocomplete is already applied
    ) {
      return null;
    }
    last_autocompleted_line = response.text.trim();
    let remaining_complete = get_remaining_complete(last_autocompleted_line);
    current_line.innerText += " %%% " + remaining_complete;
  }

  function trigger_autocomplete() {
    if (current_line?.innerText.includes(" %%% ")) {
      if (last_autocompleted_line.includes(current_line.innerText)) {
        current_line.innerText = last_autocompleted_line;
      } else {
        current_line.innerText = current_line.innerText.replace(/ %%% .*/, '') + last_autocompleted_line;
      }
      last_autocompleted_line = null;
      current_line = null;
      has_autocomplete_been_triggered = true;
      change_since_autocomplete = true;
    }
  }

  function trigger_edit(selection, selectedText) {
    console.log('Trigger edit function called');
    chrome.runtime.sendMessage({ type: 'UPDATE_CODE_SNIPPET', text: selectedText });
    selectedLines = getSelectedCmLines();
    selectionRange = selection.getRangeAt(0);
    positionElements(edit_button, selectionRange);
    edit_button.style.display = 'block';
  }

  async function handle_edit_text() {
    console.log('Submit via Enter:', current_user_input);
    const close_text = chat_selected.getElementsByClassName("close-text")[0];
    close_text.innerText = 'Loading...';
    try {
      // Use a simpler approach with a timeout to ensure the message port stays open
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'EDIT_TEXT', text: current_user_input }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message:', chrome.runtime.lastError);
            resolve({ text: "Error: " + chrome.runtime.lastError.message });
          } else {
            console.log('Message sent successfully, got response:', response);
            resolve(response);
          }
        });
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
    if (edit_button.style.display === 'block' && !edit_button.contains(e.target)) {
      edit_button.style.display = 'none';
    } else {
      remove_autocompleted_text();
      current_line = e.target.closest('.cm-line');
      
      // Add a small delay to ensure text selection is complete
      setTimeout(() => {
        const selection = window.getSelection();
        selectedText = selection.toString().trim();
        console.log('Selected text:', selectedText);
        if (selectedText !== '') {
          trigger_edit(selection, selectedText);
        } else {
          handle_autocomplete();
        }
      }, 100); // 100ms delay to allow selection to complete
    }
  });

  // Handle keyboard shortcut
  document.addEventListener('keydown',(e) => {
    change_since_autocomplete = true;
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
      if (current_line && current_line.innerText.includes(" %%% ")) {
        trigger_autocomplete();
      }
    }
  });

  // every 10 seconds, update all_text
  setInterval(async() => {
    all_text = document.getElementsByClassName("cm-content cm-lineWrapping")[0]?.innerText;
    chrome.runtime.sendMessage({ type: 'UPDATE_ALL_TEXT', text: all_text });
  }, 10000);
}

App();