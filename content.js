console.log('[Sheet Extension] Content script loaded');

// Check if floating button is enabled
chrome.storage.sync.get(['floatingButtonEnabled'], ({ floatingButtonEnabled }) => {
  console.log('[Sheet Extension] Floating button enabled?', floatingButtonEnabled);
  if (floatingButtonEnabled) {
    createFloatingButton();
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.floatingButtonEnabled) {
    if (changes.floatingButtonEnabled.newValue) {
      createFloatingButton();
    } else {
      removeFloatingButton();
    }
  }
});

let floatingButton = null;
let contextMenu = null;
let isDragging = false;
let hasDragged = false;
let dragOffset = { x: 0, y: 0 };
let dragStartPos = { x: 0, y: 0 };

function createFloatingButton() {
  console.log('[Sheet Extension] Creating button');
  if (floatingButton) return;
  
  // Create button
  floatingButton = document.createElement('div');
  floatingButton.className = 'sheet-floating-btn';
  floatingButton.title = 'Click to save URL | Right-click for options | Hold and drag to move';
  
  // Add extension icon
  const iconImg = document.createElement('img');
  iconImg.src = chrome.runtime.getURL('icon128.png');
  iconImg.style.width = '100%';
  iconImg.style.height = '100%';
  iconImg.style.borderRadius = '50%';
  iconImg.style.pointerEvents = 'none';
  floatingButton.appendChild(iconImg);
  
  // Set position and styles
  floatingButton.style.position = 'fixed';
  floatingButton.style.right = '30px';
  floatingButton.style.bottom = '80px';
  floatingButton.style.width = '48px';
  floatingButton.style.height = '48px';
  floatingButton.style.borderRadius = '50%';
  floatingButton.style.display = 'flex';
  floatingButton.style.alignItems = 'center';
  floatingButton.style.justifyContent = 'center';
  floatingButton.style.cursor = 'pointer';
  floatingButton.style.zIndex = '2147483647';
  floatingButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  floatingButton.style.border = '3px solid white';
  floatingButton.style.overflow = 'hidden';
  floatingButton.style.backgroundColor = 'white';
  
  // Load saved position if exists
  chrome.storage.local.get(['buttonPosition'], ({ buttonPosition }) => {
    if (buttonPosition && buttonPosition[window.location.hostname]) {
      floatingButton.style.left = buttonPosition[window.location.hostname].x + 'px';
      floatingButton.style.top = buttonPosition[window.location.hostname].y + 'px';
      floatingButton.style.right = 'auto';
      floatingButton.style.bottom = 'auto';
    }
  });
  
  document.body.appendChild(floatingButton);
  console.log('[Sheet Extension] Button added to page');
  
  // Click to save - only if not dragged
  floatingButton.addEventListener('click', (e) => {
    if (hasDragged) {
      hasDragged = false;
      return;
    }
    console.log('[Sheet Extension] Button clicked - saving URL');
    chrome.runtime.sendMessage({ 
      action: 'saveToSheet', 
      url: window.location.href 
    });
    // Visual feedback
    floatingButton.style.border = '3px solid #4CAF50';
    setTimeout(() => {
      floatingButton.style.border = '3px solid white';
    }, 1000);
  });
  
  // Right click for menu
  floatingButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!hasDragged) {
      showContextMenu(e);
    }
    hasDragged = false;
  });
  
  // Drag handling
  floatingButton.addEventListener('mousedown', startDrag);
}

function startDrag(e) {
  if (e.button !== 0) return;
  
  e.preventDefault();
  isDragging = true;
  hasDragged = false;
  
  const rect = floatingButton.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  dragStartPos.x = e.clientX;
  dragStartPos.y = e.clientY;
  
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', stopDrag);
}

function drag(e) {
  if (!isDragging) return;
  
  // Check if mouse moved more than 5 pixels (threshold for drag vs click)
  const moveDistance = Math.sqrt(
    Math.pow(e.clientX - dragStartPos.x, 2) + 
    Math.pow(e.clientY - dragStartPos.y, 2)
  );
  
  if (moveDistance > 5) {
    hasDragged = true;
    floatingButton.style.cursor = 'move';
    floatingButton.style.opacity = '0.7';
  }
  
  if (hasDragged) {
    const x = e.clientX - dragOffset.x;
    const y = e.clientY - dragOffset.y;
    
    // Keep within viewport
    const maxX = window.innerWidth - 48;
    const maxY = window.innerHeight - 48;
    
    floatingButton.style.left = Math.min(Math.max(0, x), maxX) + 'px';
    floatingButton.style.top = Math.min(Math.max(0, y), maxY) + 'px';
    floatingButton.style.right = 'auto';
    floatingButton.style.bottom = 'auto';
  }
}

function stopDrag(e) {
  isDragging = false;
  floatingButton.style.cursor = 'pointer';
  floatingButton.style.opacity = '1';
  
  // Save position if actually dragged
  if (hasDragged) {
    const position = {
      x: parseInt(floatingButton.style.left),
      y: parseInt(floatingButton.style.top)
    };
    
    chrome.storage.local.get(['buttonPosition'], ({ buttonPosition }) => {
      const positions = buttonPosition || {};
      positions[window.location.hostname] = position;
      chrome.storage.local.set({ buttonPosition: positions });
    });
  }
  
  document.removeEventListener('mousemove', drag);
  document.removeEventListener('mouseup', stopDrag);
}

function showContextMenu(e) {
  if (contextMenu) {
    contextMenu.remove();
  }
  
  contextMenu = document.createElement('div');
  contextMenu.style.position = 'fixed';
  contextMenu.style.background = 'white';
  contextMenu.style.border = '1px solid #ccc';
  contextMenu.style.borderRadius = '4px';
  contextMenu.style.padding = '4px 0';
  contextMenu.style.zIndex = '2147483648';
  contextMenu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  contextMenu.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  contextMenu.style.fontSize = '14px';
  
  // Position menu above button if near bottom
  const buttonRect = floatingButton.getBoundingClientRect();
  const menuHeight = 70;
  
  if (window.innerHeight - buttonRect.bottom < menuHeight) {
    contextMenu.style.bottom = (window.innerHeight - buttonRect.top + 10) + 'px';
    contextMenu.style.left = buttonRect.left + 'px';
  } else {
    contextMenu.style.top = (buttonRect.bottom + 10) + 'px';
    contextMenu.style.left = buttonRect.left + 'px';
  }
  
  contextMenu.innerHTML = `
    <div style="padding: 8px 16px; cursor: pointer; color: #333;" data-action="save">Save Current URL</div>
    <div style="padding: 8px 16px; cursor: pointer; color: #333;" data-action="hide">Hide Button</div>
  `;
  
  // Add hover effect
  contextMenu.querySelectorAll('div').forEach(item => {
    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = '#f0f0f0';
    });
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = 'white';
    });
  });
  
  document.body.appendChild(contextMenu);
  
  // Handle clicks
  contextMenu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (action === 'hide') {
      removeFloatingButton();
    } else if (action === 'save') {
      chrome.runtime.sendMessage({ 
        action: 'saveToSheet', 
        url: window.location.href 
      });
      // Visual feedback
      floatingButton.style.border = '3px solid #4CAF50';
      setTimeout(() => {
        floatingButton.style.border = '3px solid white';
      }, 1000);
    }
    contextMenu.remove();
    contextMenu = null;
  });
  
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', () => {
      if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
      }
    }, { once: true });
  }, 100);
}

function removeFloatingButton() {
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    const selection = window.getSelection().toString().trim();
    sendResponse({ selection: selection || null });
  }
  return true;
});