export function getEditPrompt(code_snippet, user_request) {
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
  
export function getAutoCompletePrompt(all_text, around_text) {
    return `
    The code provided below is a snippet of a larger LaTeX codebase. Assume not all the code is provided.
    Complete the latex code in only the lines provided. Do not create new lines of code.
  
    Here is the LaTeX codebase:
    ${all_text}
  
    Complete the following latex code:
    ${around_text}
  
    RETURN ONLY THE LATEX CODE PROVIDED WITH THE COMPLETION CODE.
    `
  }