chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

let liveTabId = null;
let liveMode = null; // 'tab' | 'screen'

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Capture screen/tab frames and microphone for live assistant interaction and play real-time spoken audio responses.'
    });
  }
  for (let i = 0; i < 25; i++) {
    try {
      const ready = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'ping' });
      if (ready?.ready) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('The live media processor did not start. Please close and reopen the side panel, then try again.');
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === 'start-live-capture') {
    (async () => {
      await ensureOffscreen();
      const mode = message.mode || 'tab';
      liveMode = mode;

      let streamId = null;
      if (mode === 'tab') {
        streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId });
        liveTabId = message.tabId;
      } else {
        liveTabId = null;
      }

      await chrome.storage.session.set({
        liveTabId,
        liveMode,
        liveStartedAt: Date.now(),
        liveMicOn: true,
        liveMicMuted: false
      });

      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'capture-stream',
        mode,
        streamId,
        api: message.api,
        token: message.token,
        conversationId: message.conversationId
      });

      respond({ ok: true });
    })().catch(error => {
      liveTabId = null;
      liveMode = null;
      chrome.storage.session.remove(['liveTabId', 'liveMode', 'liveStartedAt', 'liveMicOn', 'liveMicMuted']);
      respond({ error: error.message });
    });
    return true;
  }

  if (message?.target === 'service-worker' && message?.type === 'stop-live-capture') {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'stop-streams',
      which: message.which,
      muted: message.muted
    }).catch(() => {});

    if (message.which === 'screen' || message.which === 'all') {
      liveTabId = null;
      liveMode = null;
      chrome.storage.session.remove(['liveTabId', 'liveMode']);
    }
    if (message.which === 'mic') {
      chrome.storage.session.remove(['liveMicOn', 'liveMicMuted']);
    }
    if (message.which === 'mute-mic') {
      chrome.storage.session.set({ liveMicMuted: !!message.muted });
    }
    if (message.which === 'all') {
      chrome.storage.session.remove(['liveStartedAt', 'liveMicOn', 'liveMicMuted', 'liveTabId', 'liveMode']);
    }
    respond({ ok: true });
    return false;
  }

  if (message?.target === 'service-worker' && message?.type === 'get-live-status') {
    chrome.storage.session.get(['liveTabId', 'liveMode', 'liveStartedAt', 'liveMicOn', 'liveMicMuted']).then(saved => {
      respond({
        tabId: saved.liveTabId ?? null,
        mode: saved.liveMode ?? null,
        startedAt: saved.liveStartedAt ?? null,
        micOn: saved.liveMicOn ?? false,
        micMuted: !!saved.liveMicMuted
      });
    });
    return true;
  }

  // Forward transcript / turn updates from offscreen to sidepanel
  if (message?.target === 'service-worker' && message?.type === 'forward-to-panel') {
    chrome.runtime.sendMessage({
      target: 'panel',
      ...message.payload
    }).catch(() => {});
    respond({ ok: true });
    return false;
  }
});

// Tab switching behavior:
// When the user changes active tab:
// If liveMode is 'screen' (entire screen/window share), DO NOT stop anything! Screen share continues across all tabs!
// If liveMode is 'tab', inform offscreen of the tab change without abruptly terminating the entire audio connection,
// so the user can continue speaking or easily attach the new tab.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const saved = await chrome.storage.session.get(['liveTabId', 'liveMode', 'liveStartedAt']);
  if (!saved.liveStartedAt) return;

  if (saved.liveMode === 'tab' && saved.liveTabId !== null && tabId !== saved.liveTabId) {
    // Notify offscreen and panel that active tab has changed
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'tab-changed',
      oldTabId: saved.liveTabId,
      newTabId: tabId
    }).catch(() => {});

    chrome.runtime.sendMessage({
      target: 'panel',
      type: 'live-tab-changed',
      oldTabId: saved.liveTabId,
      newTabId: tabId
    }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(async tabId => {
  const saved = await chrome.storage.session.get(['liveTabId', 'liveMode']);
  if (saved.liveTabId === tabId) {
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-streams', which: 'screen' }).catch(() => {});
    chrome.runtime.sendMessage({ target: 'panel', type: 'live-status', status: 'screen-stopped' }).catch(() => {});
    chrome.storage.session.remove(['liveTabId']);
  }
});
