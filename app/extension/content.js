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
  let old_current_line = null;

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

  function getCurrentCmLine() {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const startLine = startNode.nodeType === 3 
      ? startNode.parentElement.closest('.cm-line') 
      : startNode.closest('.cm-line');
    return startLine;
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
  

  async function handle_autocomplete() {
    let autocompleted_line = "";
    edit_button.style.display = 'none';
    if (current_line != null && old_current_line != null) { // remove the autocompleted part from the current line 
      current_line.innerText = old_current_line;
      old_current_line = null;
      last_autocompleted_line = null;
    }
    // get the current line
    current_line = getCurrentCmLine();
    console.log('Current line:', current_line.innerText);
    if (current_line.innerText == "") {
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: 'AUTOCOMPLETE', text: current_line.innerText});
    console.log('Background Response:', response.text);
    if (response.text === '') {
      return;
    }
    autocompleted_line = response.text;
    console.log('Autocompleted line:', autocompleted_line);
    last_autocompleted_line = autocompleted_line.trim();
    if (last_autocompleted_line === current_line.innerText) {
      return;
    }
    old_current_line = current_line.innerText;
    current_line.innerText += " % " + last_autocompleted_line;
  }

  function trigger_autocomplete() {
    current_line.innerText = last_autocompleted_line;
    old_current_line = current_line.innerText;
    last_autocompleted_line = null;
    old_current_line = null;
  }


  function handle_trigger_edit(selection, selectedText) {
    console.log('Selected text:', selectedText);
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

  // Handle text selection
  document.addEventListener('mouseup', async (e) => {
    setTimeout(async () => {
      const selection = window.getSelection();
      selectedText = selection.toString().trim();
      if (selectedText) {
        handle_trigger_edit(selection, selectedText);
      } else {
        await handle_autocomplete();
      }

    }, 10); // Small timeout to ensure selection is complete
  });

  // Handle keyboard shortcut
  document.addEventListener('keydown', (e) => {
    // Only prevent default for our specific shortcut
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (selectedText) {
        open_chat_selected();
      }
    } else if (e.key === 'Escape') {
      close_chat_selected();
    } else if (e.key === 'Tab' && last_autocompleted_line != null) {
      e.preventDefault();
      trigger_autocomplete();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!edit_button.contains(e.target)) {
      edit_button.style.display = 'none';
    }
  });

  // every 10 seconds, update all_text
  setInterval(async() => {
    all_text = document.getElementsByClassName("cm-content cm-lineWrapping")[0]?.innerText;
    chrome.runtime.sendMessage({ type: 'UPDATE_ALL_TEXT', text: all_text });
  }, 10000);
}

App();