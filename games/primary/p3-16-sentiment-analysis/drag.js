/**
 * drag.js — Drag-and-drop engine using unified pointer events
 *
 * Handles touch and mouse drag of email cards to department chutes.
 * Features: snap-back on wrong drop, chute highlight on hover,
 * debounce between drops, priority card pulsing.
 */
const DragEngine = (() => {
  'use strict';

  let isDragging = false;
  let dragCard = null;            // DOM element being dragged
  let dragEmailId = null;        // Email data ID
  let dragStartX = 0, dragStartY = 0;
  let dragOffsetX = 0, dragOffsetY = 0;
  let lastDropTime = 0;
  const DROP_DEBOUNCE = 300;     // ms between drops
  const SNAP_DURATION = 200;     // ms for snap-back

  // Callbacks
  let onDropCallback = null;     // (emailId, targetDeptId) => boolean (correct?)
  let onDragStartCallback = null;
  let onDragEndCallback = null;

  // Chute elements
  let chuteElements = {};

  /** Initialize the drag engine */
  function init(callbacks) {
    onDropCallback = callbacks.onDrop || null;
    onDragStartCallback = callbacks.onDragStart || null;
    onDragEndCallback = callbacks.onDragEnd || null;

    // Cache chute elements
    chuteElements = {
      parks: document.getElementById('chute-parks'),
      transit: document.getElementById('chute-transit'),
      waste: document.getElementById('chute-waste'),
    };

    // Global pointer events (delegated from the belt area)
    const beltArea = document.getElementById('belt-area');
    if (beltArea) {
      beltArea.addEventListener('pointerdown', handlePointerDown);
      beltArea.addEventListener('pointermove', handlePointerMove);
      beltArea.addEventListener('pointerup', handlePointerUp);
      beltArea.addEventListener('pointercancel', handlePointerUp);
    }

    // Also listen on document for moves/ups outside the belt
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  /**
   * Handle pointer down — start drag if on an email card.
   */
  function handlePointerDown(e) {
    if (isDragging) return;

    // Debounce
    const now = Date.now();
    if (now - lastDropTime < DROP_DEBOUNCE) return;

    // Find the email card element
    const card = e.target.closest('.email-card');
    if (!card) return;
    if (card.classList.contains('dragging')) return;
    if (card.classList.contains('snapping')) return;
    if (card.classList.contains('sorted')) return;

    const emailId = card.dataset.emailId;
    if (!emailId) return;

    // Start drag
    e.preventDefault();
    card.setPointerCapture(e.pointerId);

    isDragging = true;
    dragCard = card;
    dragEmailId = emailId;

    const rect = card.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    dragStartX = rect.left;
    dragStartY = rect.top;

    card.classList.add('dragging');
    card.style.zIndex = '100';
    card.style.transition = 'none';

    // Position at cursor
    updateCardPosition(e.clientX, e.clientY);

    if (onDragStartCallback) onDragStartCallback(emailId);
  }

  /**
   * Handle pointer move — follow finger.
   */
  function handlePointerMove(e) {
    if (!isDragging || !dragCard) return;
    e.preventDefault();
    updateCardPosition(e.clientX, e.clientY);
    checkChuteHover(e.clientX, e.clientY);
  }

  /**
   * Handle pointer up — check drop target.
   */
  function handlePointerUp(e) {
    if (!isDragging || !dragCard) return;
    e.preventDefault();

    const dropX = e.clientX;
    const dropY = e.clientY;

    // Hit-test chutes
    const targetDept = hitTestChute(dropX, dropY);

    if (targetDept) {
      // Attempt drop
      handleDrop(targetDept);
    } else {
      // Snap back
      snapBack();
    }

    clearChuteHighlights();
  }

  /**
   * Update card position to follow pointer.
   */
  function updateCardPosition(clientX, clientY) {
    if (!dragCard) return;
    dragCard.style.left = (clientX - dragOffsetX) + 'px';
    dragCard.style.top = (clientY - dragOffsetY) + 'px';
    dragCard.style.transform = 'rotate(3deg) scale(1.05)';
  }

  /**
   * Check if pointer is over a chute — highlight it.
   */
  function checkChuteHover(clientX, clientY) {
    clearChuteHighlights();
    const deptId = hitTestChute(clientX, clientY);
    if (deptId && chuteElements[deptId]) {
      chuteElements[deptId].classList.add('chute-hover');
    }
  }

  /**
   * Hit-test pointer coordinates against chute bounding rects.
   * Returns department ID string or null.
   */
  function hitTestChute(clientX, clientY) {
    for (const [deptId, el] of Object.entries(chuteElements)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return deptId;
      }
    }
    return null;
  }

  /**
   * Handle a drop onto a chute.
   */
  function handleDrop(targetDeptId) {
    if (!dragCard || !dragEmailId) return;

    const emailId = dragEmailId;
    const card = dragCard;
    const now = Date.now();

    if (now - lastDropTime < DROP_DEBOUNCE) {
      snapBack();
      return;
    }
    lastDropTime = now;

    // Notify game logic
    let isCorrect = false;
    if (onDropCallback) {
      isCorrect = onDropCallback(emailId, targetDeptId);
    }

    if (isCorrect) {
      // Success animation: card shrinks into chute
      animateSuccess(card, targetDeptId);
    } else {
      // Error: shake + snap back
      animateError(card);
    }

    // Reset drag state
    isDragging = false;
    dragCard = null;
    dragEmailId = null;

    if (onDragEndCallback) onDragEndCallback(emailId, targetDeptId, isCorrect);
  }

  /**
   * Animate card snapping back to its original position on the belt.
   */
  function snapBack() {
    if (!dragCard) return;
    const card = dragCard;

    card.classList.add('snapping');
    card.classList.remove('dragging');
    card.style.transition = 'all ' + SNAP_DURATION + 'ms ease-out';
    card.style.left = dragStartX + 'px';
    card.style.top = dragStartY + 'px';
    card.style.transform = 'rotate(0deg) scale(1)';
    card.style.zIndex = '';

    setTimeout(() => {
      card.classList.remove('snapping');
      card.style.transition = '';
      card.style.left = '';
      card.style.top = '';
      card.style.transform = '';
    }, SNAP_DURATION + 50);

    isDragging = false;
    dragCard = null;
    dragEmailId = null;
  }

  /**
   * Animate successful drop — card shrinks into chute.
   */
  function animateSuccess(card, deptId) {
    card.classList.add('sorted');
    card.classList.remove('dragging');
    card.style.transition = 'all 300ms ease-in';
    card.style.transform = 'scale(0.3)';
    card.style.opacity = '0';

    // Flash the chute green
    if (chuteElements[deptId]) {
      chuteElements[deptId].classList.add('chute-success');
      setTimeout(() => {
        chuteElements[deptId].classList.remove('chute-success');
      }, 500);
    }

    setTimeout(() => {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 350);
  }

  /**
   * Animate wrong drop — shake + snap back.
   */
  function animateError(card) {
    card.classList.add('shake');
    card.classList.add('wrong-drop');
    card.style.transition = 'none';

    setTimeout(() => {
      card.classList.remove('shake', 'wrong-drop');
      snapBack();
    }, 400);
  }

  /**
   * Clear all chute hover highlights.
   */
  function clearChuteHighlights() {
    Object.values(chuteElements).forEach(el => {
      if (el) el.classList.remove('chute-hover');
    });
  }

  /**
   * Check if currently dragging.
   */
  function isActive() {
    return isDragging;
  }

  /**
   * Cancel any in-progress drag.
   */
  function cancelDrag() {
    if (isDragging) {
      snapBack();
    }
  }

  return { init, isActive, cancelDrag, clearChuteHighlights };
})();
