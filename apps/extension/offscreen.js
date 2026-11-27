let screen = null;
let mic = null;
let socket = null;
let video = null;
let canvas = null;
let timer = null;
let context = null;
let processor = null;
let source = null;
let lastFrameSample = null;
let lastFrameAt = 0;
let nextOutput = 0;
let micMuted = false;
let playback = new Set();
let isSpeaking = false;
let currentMode = 'tab';
let captureCurrentFrame = () => {};

function sendStatus(status, error = '') {
  chrome.runtime.sendMessage({
    target: 'panel',
    type: 'live-status',
    status,
    error
  }).catch(() => {});
}

function sendTranscript(data) {
  chrome.runtime.sendMessage({
    target: 'panel',
    type: 'live-transcript',
    ...data
  }).catch(() => {});
}

function sendTurnSaved(data) {
  chrome.runtime.sendMessage({
    target: 'panel',
    type: 'live-turn-saved',
    ...data
  }).catch(() => {});
}

function stop(which = 'all', muted = false) {
  if (which === 'mute-mic') {
    micMuted = !!muted;
    if (mic) {
      for (const track of mic.getAudioTracks()) {
        track.enabled = !micMuted;
      }
    }
    sendStatus(micMuted ? 'mic-muted' : 'mic-resumed');
    return;
  }

  if ((which === 'screen' || which === 'all') && screen) {
    screen.getTracks().forEach(t => t.stop());
    screen = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    captureCurrentFrame = () => {};
    sendStatus('screen-stopped');
  }

  if ((which === 'mic' || which === 'all') && mic) {
    mic.getTracks().forEach(t => t.stop());
    mic = null;
    if (processor) {
      try { processor.disconnect(); } catch {}
      processor = null;
    }
    if (source) {
      try { source.disconnect(); } catch {}
      source = null;
    }
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    sendStatus('mic-stopped');
  }

  if (which === 'all') {
    micMuted = false;
    isSpeaking = false;
    for (const player of playback) {
      try { player.stop(); } catch {}
    }
    playback.clear();

    if (socket) {
      try { socket.close(); } catch {}
      socket = null;
    }
    if (context) {
      try { context.close(); } catch {}
      context = null;
    }
    video = null;
    canvas = null;
    lastFrameSample = null;
    lastFrameAt = 0;
    nextOutput = 0;
    captureCurrentFrame = () => {};
    sendStatus('stopped');
  }
}

async function initAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!context || context.state === 'closed') {
    try {
      context = new AudioCtx({ sampleRate: 24000 });
    } catch {
      context = new AudioCtx();
    }
  }
  if (context.state === 'suspended') {
    await context.resume();
  }
  return context;
}

async function start({ mode = 'tab', streamId = null, api, token, conversationId }) {
  stop('all');
  currentMode = mode;
  lastFrameSample = null;
  lastFrameAt = 0;
  nextOutput = 0;
  isSpeaking = false;

  await initAudioContext();

  const origin = new URL(api);
  origin.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  origin.pathname = '/api/live';

  socket = new WebSocket(origin.toString());

  await new Promise((resolve, reject) => {
    socket.onopen = () => {
      socket.send(JSON.stringify({ token, conversation_id: conversationId }));
      resolve();
    };
    socket.onerror = () => reject(new Error('Live backend connection failed. Ensure server is running and Gemini Live is enabled.'));
  });

  let turnComplete = false;

  socket.onmessage = async event => {
    try {
      const packet = JSON.parse(event.data);

      if (packet.error) {
        sendStatus('error', packet.error);
        stop('all');
        return;
      }
      if (packet.sessionState === 'resuming') {
        sendStatus('reconnecting');
      }
      if (packet.setupComplete) {
        sendStatus('listening');
      }

      // Backend persisted turn confirmation
      if (packet.liveTurnSaved) {
        sendTurnSaved(packet.liveTurnSaved);
      }

      const content = packet.serverContent || {};

      // User speech transcription
      if (content.inputTranscription?.text) {
        turnComplete = false;
        sendStatus('thinking');
        sendTranscript({ role: 'user', text: content.inputTranscription.text });
        captureCurrentFrame(true);
      }

      // Assistant speech transcription
      if (content.outputTranscription?.text) {
        sendTranscript({ role: 'assistant', text: content.outputTranscription.text });
        sendStatus('speaking');
      }

      // Interruption: User spoke over assistant -> stop playback immediately
      if (content.interrupted) {
        for (const player of playback) {
          try { player.stop(); } catch {}
        }
        playback.clear();
        isSpeaking = false;
        if (context) nextOutput = context.currentTime;
        turnComplete = false;
        sendStatus('listening');
      }

      // Turn complete flag
      if (content.turnComplete) {
        turnComplete = true;
        if (playback.size === 0) {
          isSpeaking = false;
          sendStatus('listening');
        }
      }

      // Model audio output playback
      const parts = content.modelTurn?.parts || [];
      for (const part of parts) {
        const encoded = part.inlineData?.data;
        if (!encoded || !part.inlineData?.mimeType?.startsWith('audio/')) continue;

        const raw = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const pcm = new Int16Array(raw.buffer);

        if (!context) await initAudioContext();
        if (context.state === 'suspended') await context.resume();

        isSpeaking = true;
        sendStatus('speaking');

        const buffer = context.createBuffer(1, pcm.length, 24000);
        buffer.copyToChannel(Float32Array.from(pcm, x => x / 32768), 0);

        const player = context.createBufferSource();
        player.buffer = buffer;
        player.connect(context.destination);
        playback.add(player);

        player.onended = () => {
          playback.delete(player);
          if (playback.size === 0) {
            isSpeaking = false;
            if (turnComplete) {
              sendStatus('listening');
            }
          }
        };

        const startAt = Math.max(context.currentTime + 0.02, nextOutput);
        player.start(startAt);
        nextOutput = startAt + buffer.duration;
      }
    } catch (err) {
      console.warn('[Offscreen] packet parse error:', err);
    }
  };

  socket.onclose = () => {
    sendStatus('disconnected');
    stop('all');
  };

  // Video acquisition:
  // If mode === 'screen', use navigator.mediaDevices.getDisplayMedia
  // If mode === 'tab', use getUserMedia with chromeMediaSource: 'tab'
  try {
    if (mode === 'screen') {
      screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { ideal: 5, max: 15 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
    } else {
      screen = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      });
    }
  } catch (err) {
    console.warn('[Offscreen] Screen capture failed:', err);
    // Even if screen capture is declined or fails, microphone can still proceed
  }

  // Microphone capture with echo cancellation
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (error) {
    stop('all');
    throw new Error('Microphone access is required for live voice interaction. Please grant mic permissions.');
  }

  // Setup 16 kHz PCM microphone audio streaming to Gemini
  source = context.createMediaStreamSource(mic);
  processor = context.createScriptProcessor(4096, 1, 1);
  const muteNode = context.createGain();
  muteNode.gain.value = 0;

  processor.onaudioprocess = e => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    // Suppress mic chunks while assistant is speaking through speakers to prevent audio loop / self-interruption
    if (micMuted || (isSpeaking && playback.size > 0)) return;

    const input = e.inputBuffer.getChannelData(0);
    const ratio = context.sampleRate / 16000;
    const out = new Int16Array(Math.floor(input.length / ratio));

    for (let i = 0; i < out.length; i++) {
      const v = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
      out[i] = v < 0 ? v * 32768 : v * 32767;
    }

    let binary = '';
    const bytes = new Uint8Array(out.buffer);
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    socket.send(JSON.stringify({
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: btoa(binary)
        }
      }
    }));
  };

  source.connect(processor);
  processor.connect(muteNode);
  muteNode.connect(context.destination);

  // Setup video rendering and frame diffing
  if (screen) {
    video = document.createElement('video');
    video.srcObject = screen;
    video.muted = true;
    await video.play();

    canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 32;
    sampleCanvas.height = 18;
    const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    let stableSamples = 0;

    captureCurrentFrame = (force = false) => {
      if (socket?.readyState !== WebSocket.OPEN || !video?.videoWidth) return;
      if (force && timer) {
        clearTimeout(timer);
        timer = null;
      }
      const now = Date.now();
      if (force && lastFrameAt && now - lastFrameAt < 1000) {
        timer = setTimeout(() => captureCurrentFrame(true), 1000 - (now - lastFrameAt));
        return;
      }

      canvas.width = Math.min(video.videoWidth, 1280);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      sampleCtx.drawImage(canvas, 0, 0, 32, 18);
      const sample = [];
      const pixels = sampleCtx.getImageData(0, 0, 32, 18).data;
      for (let i = 0; i < pixels.length; i += 4) {
        sample.push(Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]));
      }

      let difference = 255;
      if (lastFrameSample) {
        difference = 0;
        for (let i = 0; i < sample.length; i++) {
          difference += Math.abs(sample[i] - lastFrameSample[i]);
        }
        difference /= sample.length;
      }

      // Frame difference filter: if static (< 8 luminance delta) and under 15s refresh, skip
      if (!force && lastFrameSample && difference < 8 && now - lastFrameAt < 15000) {
        stableSamples++;
        timer = setTimeout(() => captureCurrentFrame(), stableSamples >= 2 ? 2000 : 1000);
        return;
      }

      lastFrameSample = sample;
      lastFrameAt = now;
      stableSamples = 0;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      const data = dataUrl.split(',')[1];

      socket.send(JSON.stringify({
        realtimeInput: {
          video: {
            mimeType: 'image/jpeg',
            data,
            timestamp: new Date().toISOString()
          }
        }
      }));

      timer = setTimeout(() => captureCurrentFrame(), difference >= 18 ? 1000 : 2000);
    };

    captureCurrentFrame(true);

    screen.getVideoTracks()[0].addEventListener('ended', () => {
      sendStatus('screen-stopped');
      if (timer) clearTimeout(timer);
      timer = null;
      screen = null;
    });
  }

  sendStatus('connected');
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target !== 'offscreen') return;

  if (message.type === 'ping') {
    respond({ ready: true });
    return;
  }

  if (message.type === 'capture-stream') {
    start(message).catch(error => {
      sendStatus('error', error.message);
      stop('all');
    });
    respond({ ok: true });
    return;
  }

  if (message.type === 'stop-streams') {
    if (message.which === 'capture-frame') {
      captureCurrentFrame(true);
    } else {
      stop(message.which || 'all', message.muted);
    }
    respond({ ok: true });
    return;
  }

  if (message.type === 'tab-changed') {
    // If tab changed during tab live capture:
    // Inform panel, take a refresh frame if requested
    if (currentMode === 'tab' && captureCurrentFrame) {
      // Force frame capture on tab change after a short settle delay
      setTimeout(() => captureCurrentFrame(true), 600);
    }
    respond({ ok: true });
    return;
  }
});
