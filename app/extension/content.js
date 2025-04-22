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
        <button id="latex-submit" class="latex-submit">&times;</button>
      </div>
    </div>
  `;

  const latex_input = chat_selected.getElementsByClassName("latex-input")[0];
  const latex_submit = chat_selected.getElementsByClassName("latex-submit")[0];

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
    new_code_lines = new_code.split('\\n');
    console.log('New code lines:', new_code_lines);
    diff = new_code_lines.length - selectedLines.length;
    // handle case where new code has less or equal lines than selected lines
    selectedLines.forEach((line, index) => {
      if (index < new_code_lines.length) {
        line.innerText = new_code_lines[index];
      } else {
        line.innerText = "";
      }
    });
    // handle case where new code has more lines than selected lines
    if (diff > 0) {
      // find start in document 
      let kids = Array.from(document.getElementsByClassName("cm-content cm-lineWrapping")[0].children);
      // find index of first new line in kids
      let start_index = 0;
      kids.forEach((kid, index) => {
        if (kid === selectedLines[selectedLines.length - 1]) {
          start_index = index;
          return;
        }
      });
      kids_to_add = []
      // add new lines
      for (let i = 0; i < diff; i++) {
        const new_line = document.createElement('div');
        new_line.className = 'cm-line';
        new_line.innerText = new_code_lines[selectedLines.length + i];
        // insert new line into document at index start_index + i
        kids_to_add.push(new_line);
        console.log('Kids to add:', kids_to_add);
      }
      kids = kids.slice(0, start_index + 1).concat(kids_to_add).concat(kids.slice(start_index + 1));
      console.log('Kids:', kids.length);
      // Replace the children with the new set of nodes
      const container = document.getElementsByClassName("cm-content cm-lineWrapping")[0];
      // Clear existing children
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      // Append all new children
      kids.forEach(kid => {
        container.appendChild(kid);
      });
      console.log('Main Content:', document.getElementsByClassName("cm-content cm-lineWrapping")[0].children.length);
    }
  }


  // EVENT LISTENERS -------------------------------------------------------------
  edit_button.onclick = () => {
    open_chat_selected();
  };
  latex_input.addEventListener('input', (e) => {
    current_user_input = e.target.value;
  });
  latex_input.addEventListener('keydown', async (e) => {
    e.stopPropagation(); // Prevent other handlers from capturing the input
    if (e.key === 'Enter') {
      e.preventDefault();
      console.log('Submit via Enter:', current_user_input);
      const resp = await chrome.runtime.sendMessage({ type: 'EDIT_TEXT', text: current_user_input });
      console.log('Background Response:', resp);
      update_selected_lines(resp.text);
      close_chat_selected();
    }
  });

  latex_submit.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('Submit via button:', current_user_input);
    const selectedLines = getSelectedCmLines();
    console.log('Selected lines:', selectedLines);
    close_chat_selected();
  });

  // Handle text selection
  document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
      const selection = window.getSelection();
      selectedText = selection.toString().trim();
      if (selectedText) {
        console.log('Selected text:', selectedText);
        selectedLines = getSelectedCmLines();
        console.log('Selected lines:', selectedLines);
        selectionRange = selection.getRangeAt(0);
        positionElements(edit_button, selectionRange);
        edit_button.style.display = 'block';
      } else {
        edit_button.style.display = 'none';
      }
    }, 10); // Small timeout to ensure selection is complete
  });

  // Handle keyboard shortcut
  document.addEventListener('keydown', (e) => {
    e.preventDefault();
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      if (selectedText) {
        open_chat_selected();
      }
    }
  });


  document.addEventListener('mousedown', (e) => {
    if (!edit_button.contains(e.target)) {
      edit_button.style.display = 'none';
    }
  });

  // Listen for messages from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_SELECTION') {
      sendResponse({ text: selectedText });
    }
    return true;
  }); 

}

App();