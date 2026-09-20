/**
 * transcript.js — Conversation history storage & drawer for Sonic Leak Hunter
 * 
 * Stores child→AI message pairs in a scrollable list.
 * Persists in memory only (no PII storage).
 * Provides render function for the drawer UI.
 */

const Transcript = (() => {
  let messages = [];
  let maxMessages = 100;

  /**
   * Add a message to the transcript
   * @param {string} role - 'child' or 'piper'
   * @param {string} text - message content
   */
  function add(role, text) {
    messages.push({
      role,
      text,
      timestamp: Date.now()
    });
    
    // Keep only last N messages
    if (messages.length > maxMessages) {
      messages = messages.slice(-maxMessages);
    }
  }

  /**
   * Get all messages
   */
  function getAll() {
    return [...messages];
  }

  /**
   * Clear all messages
   */
  function clear() {
    messages = [];
  }

  /**
   * Render the transcript drawer content
   */
  function render(container) {
    if (!container) return;
    
    container.textContent = '';
    
    if (messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'transcript-empty';
      const p = document.createElement('p');
      p.textContent = 'No messages yet. Talk to Piper!';
      empty.appendChild(p);
      container.appendChild(empty);
      return;
    }
    
    messages.forEach(msg => {
      const div = document.createElement('div');
      div.className = `transcript-message transcript-${msg.role}`;
      
      const time = new Date(msg.timestamp);
      const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const roleSpan = document.createElement('span');
      roleSpan.className = 'transcript-role';
      roleSpan.textContent = msg.role === 'child' ? '🧒 You' : '🤖 Piper';
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'transcript-time';
      timeSpan.textContent = timeStr;
      
      const textP = document.createElement('p');
      textP.className = 'transcript-text';
      textP.textContent = msg.text;
      
      div.appendChild(roleSpan);
      div.appendChild(timeSpan);
      div.appendChild(textP);
      
      container.appendChild(div);
    });
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Count messages
   */
  function count() {
    return messages.length;
  }

  return {
    add,
    getAll,
    clear,
    render,
    count
  };
})();

window.Transcript = Transcript;
