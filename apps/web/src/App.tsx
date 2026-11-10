import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDown, ArrowUp, AudioLines, BarChart2, Brain, Camera, Check, CheckCircle, ChevronDown,
  CircleHelp, Command, Compass, Copy, Ellipsis, ExternalLink, FilePlus2, FileText,
  History, Image, Key, Layers2, MessageSquare, MonitorUp, Moon, PanelLeftClose, Plus,
  RefreshCw, Search, Settings2, Shield, Sparkles, Square, Sun, Trash2, Workflow, X, XCircle
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AiThinkingVisual } from './components/AiThinkingVisual'

type Model = {
  id: string
  provider: string
  name: string
  model_id?: string
  description: string
  capabilities: string[]
  configured: boolean
  image_input: boolean
  document_input: boolean
  byok?: boolean
  free?: boolean
}

type LiveModel = {
  id: string
  provider: string
  name: string
  configured: boolean
  native_realtime: boolean
  audio_input: boolean
  audio_output: boolean
  video_input: boolean
  streaming: boolean
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event?: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type Conversation = {
  id: string
  title: string
  created_at: string
  updated_at: string
  preview?: string
  summary?: string
}

type Attachment = {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at?: string
}

type Message = {
  id?: string
  conversation_id?: string
  role: 'user' | 'assistant'
  content: string
  model_id?: string
  attachments?: Attachment[]
  sources?: { title: string; url: string }[]
}

type ActionItem = {
  id: string
  conversation_id: string
  action_type: string
  payload: Record<string, any>
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  result?: { ok: boolean; message?: string } | null
  created_at: string
}

type ActivityEvent = {
  id: string
  conversation_id: string | null
  event_type: string
  detail: Record<string, any>
  created_at: string
}

const API = import.meta.env.VITE_API_BASE_URL || ''
let sessionToken = typeof window === 'undefined' ? '' : window.sessionStorage.getItem('omniassist.session') || ''

const request = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...options?.headers
    }
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

function App() {
  const [token, setToken] = useState(() => sessionToken)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authInviteCode, setAuthInviteCode] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [account, setAccount] = useState<{ id: string; email: string } | null>(null)
  const [models, setModels] = useState<Model[]>([])
  const [liveModel, setLiveModel] = useState<LiveModel | null>(null)
  const [modelId, setModelId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [active, setActive] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modelMenu, setModelMenu] = useState(false)
  const [dark, setDark] = useState(true)
  const [sidebar, setSidebar] = useState(true)
  const [copied, setCopied] = useState<number | null>(null)

  // Settings & Navigation
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'models' | 'byok' | 'usage' | 'memory' | 'actions' | 'extension' | 'privacy'>('models')

  // Memories & Personalization
  const [memories, setMemories] = useState<{ id: string; content: string }[]>([])
  const [memoryEnabled, setMemoryEnabled] = useState(false)
  const [memoryDraft, setMemoryDraft] = useState('')
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null)
  const [editingMemoryDraft, setEditingMemoryDraft] = useState('')

  // Browser Actions & Activity Timeline
  const [actions, setActions] = useState<ActionItem[]>([])
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [actionBusy, setActionBusy] = useState(false)

  // Usage meter
  const [usage, setUsage] = useState<{
    provider_requests: number
    daily_limit: number | null
    input_tokens: number
    output_tokens: number
    cache_write_input_tokens: number
    estimated_cost_usd: number | null
    cost_estimate_complete: boolean
    unpriced_calls: number
  } | null>(null)

  const [webSearch, setWebSearch] = useState(false)
  const [webSearchConfigured, setWebSearchConfigured] = useState(false)
  const [voiceListening, setVoiceListening] = useState(false)
  const [speakResponses, setSpeakResponses] = useState(() => {
    try {
      return localStorage.getItem('omniassist.speak_responses') === 'true'
    } catch {
      return false
    }
  })
  const speakResponsesRef = useRef(speakResponses)
  useEffect(() => {
    speakResponsesRef.current = speakResponses
    try {
      localStorage.setItem('omniassist.speak_responses', speakResponses ? 'true' : 'false')
    } catch {}
  }, [speakResponses])
  const [connection, setConnection] = useState<'loading' | 'ready' | 'offline'>('loading')

  // Gemini Live state
  const [liveActive, setLiveActive] = useState(false)
  const [liveScreen, setLiveScreen] = useState(false)
  const [liveMic, setLiveMic] = useState(false)
  const [liveMicMuted, setLiveMicMuted] = useState(false)
  const [livePreview, setLivePreview] = useState<MediaStream | null>(null)
  const [liveStatus, setLiveStatus] = useState('')
  const [liveDuration, setLiveDuration] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const liveTranscriptRef = useRef<HTMLPreElement | null>(null)
  const liveRef = useRef<{
    socket: WebSocket
    streams: (MediaStream | undefined)[]
    timer?: number
    vadTimer?: number
    audio?: AudioContext
    nextPlay: number
    playback: Set<AudioBufferSourceNode>
    processor?: ScriptProcessorNode
    source?: MediaStreamAudioSourceNode
    silent?: GainNode
    speechRec?: SpeechRecognitionLike | null
    currentAssistantId?: string | null
    screenVideo?: HTMLVideoElement
    grabFrame?: () => string | null
    isSpeaking?: boolean
    isAssistantTurn?: boolean
    turnCompletedAt?: number
    turnWatchdog?: number
  } | null>(null)
  const latestLiveFrameRef = useRef<string | null>(null)

  useEffect(() => {
    if (liveTranscriptRef.current) {
      liveTranscriptRef.current.scrollTop = liveTranscriptRef.current.scrollHeight
    }
  }, [liveTranscript])

  // Continuous live screen state
  const [continuousScreenStream, setContinuousScreenStream] = useState<MediaStream | null>(null)
  const continuousVideoRef = useRef<HTMLVideoElement | null>(null)
  const miniPreviewVideoRef = useRef<HTMLVideoElement | null>(null)

  // Anthropic Claude BYOK state
  const [byokAnthropicKey, setByokAnthropicKey] = useState<string>(() => localStorage.getItem('omniassist.byok.anthropic') || '')
  const [byokModalOpen, setByokModalOpen] = useState(false)
  const [byokTempKey, setByokTempKey] = useState('')
  const [byokShowKey, setByokShowKey] = useState(false)

  // Tavily Search BYOK state
  const [byokTavilyKey, setByokTavilyKey] = useState<string>(() => localStorage.getItem('omniassist.byok.tavily') || '')
  const [byokTempTavilyKey, setByokTempTavilyKey] = useState('')
  const [byokShowTavilyKey, setByokShowTavilyKey] = useState(false)
  const isWebSearchReady = Boolean(webSearchConfigured || byokTavilyKey)

  const [deletePassword, setDeletePassword] = useState('')
  const liveClockRef = useRef<number | undefined>(undefined)
  const liveStartedAtRef = useRef(0)
  const forceLiveFrameRef = useRef<(() => void) | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const shouldBeListeningRef = useRef(false)
  const baseInputRef = useRef('')
  const finalTranscriptRef = useRef('')
  const activeUtterancesRef = useRef(new Set<SpeechSynthesisUtterance>())
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modelPickerWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!modelMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (modelPickerWrapRef.current && !modelPickerWrapRef.current.contains(e.target as Node)) {
        setModelMenu(false)
      }
    }
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setModelMenu(false)
    }
    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [modelMenu])

  const selectedModel = models.find(m => m.id === modelId)
  const isModelConfigured = Boolean(
    selectedModel?.configured || (selectedModel?.byok && byokAnthropicKey)
  )

  const loadConversations = useCallback(async () => {
    if (!token) return
    const data = await request<{ conversations: Conversation[] }>('/api/conversations')
    setConversations(data.conversations)
    if (active?.id) {
      const match = data.conversations.find(c => c.id === active.id)
      if (match && match.title && match.title !== active.title) {
        setActive(match)
      }
    }
  }, [token, active])

  const loadActions = useCallback(async (convId?: string) => {
    const targetId = convId || active?.id
    if (!targetId || !token) {
      setActions([])
      return
    }
    try {
      const data = await request<{ actions: ActionItem[] }>(`/api/actions?conversation_id=${encodeURIComponent(targetId)}`)
      setActions(data.actions)
    } catch {
      setActions([])
    }
  }, [active, token])

  const loadActivity = useCallback(async (convId?: string) => {
    if (!token) return
    try {
      const query = convId ? `?conversation_id=${encodeURIComponent(convId)}` : ''
      const data = await request<{ events: ActivityEvent[] }>(`/api/activity${query}`)
      setActivities(data.events)
    } catch {
      setActivities([])
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    const timer = window.setTimeout(() => {
      request<{ conversations: Conversation[] }>(`/api/conversations?q=${encodeURIComponent(search)}`)
        .then(data => setConversations(data.conversations))
        .catch(e => setError(e instanceof Error ? e.message : 'Could not search conversations'))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [search, token])

  useEffect(() => {
    if (settingsOpen && token) {
      Promise.all([
        request<{ enabled: boolean; memories: { id: string; content: string }[] }>('/api/memories'),
        request<{
          provider_requests: number
          daily_limit: number | null
          input_tokens: number
          output_tokens: number
          cache_write_input_tokens: number
          estimated_cost_usd: number | null
          cost_estimate_complete: boolean
          unpriced_calls: number
        }>('/api/usage'),
        request<{ events: ActivityEvent[] }>('/api/activity')
      ])
        .then(([memData, usageData, actData]) => {
          setMemoryEnabled(memData.enabled)
          setMemories(memData.memories)
          setUsage(usageData)
          setActivities(actData.events)
        })
        .catch(e => setError(e.message))
    }
  }, [settingsOpen, token])

  useEffect(() => {
    if (!token) {
      setConnection('ready')
      return
    }
    let live = true
    Promise.all([
      request<{ models: Model[]; default_model: string; live_model: LiveModel; web_search_configured?: boolean }>('/api/models'),
      request<{ conversations: Conversation[] }>('/api/conversations'),
      request<{ id: string; email: string }>('/api/auth/me'),
    ])
      .then(([catalog, history, me]) => {
        if (!live) return
        setModels(catalog.models)
        setLiveModel(catalog.live_model)
        setModelId(catalog.default_model)
        if (catalog.web_search_configured !== undefined) {
          setWebSearchConfigured(Boolean(catalog.web_search_configured))
        }
        setConversations(history.conversations)
        setAccount(me)
        setConnection('ready')
      })
      .catch(async error => {
        if (!live) return
        if (error instanceof Error && error.message === 'Sign in to continue.') {
          sessionToken = ''
          sessionStorage.removeItem('omniassist.session')
          setToken('')
          setAccount(null)
          return
        }
        setConnection('offline')
        setError('Cannot reach OmniAssist API. Start the backend and try again.')
      })
    return () => {
      live = false
      abortRef.current?.abort()
    }
  }, [token])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: busy ? 'smooth' : 'instant' })
  }, [messages, busy])

  const openConversation = async (conversation: Conversation) => {
    if (liveActive) {
      setError('End the active Live session before switching conversations.')
      return
    }
    try {
      const data = await request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${conversation.id}`)
      setActive(data.conversation)
      setMessages(data.messages)
      setPendingFiles([])
      setError('')
      void loadActions(conversation.id)
      void loadActivity(conversation.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open conversation')
    }
  }

  const newConversation = async () => {
    if (liveActive) {
      setError('End the active Live session before starting another conversation.')
      return null
    }
    try {
      const conversation = await request<Conversation>('/api/conversations', { method: 'POST', body: JSON.stringify({}) })
      setActive(conversation)
      setMessages([])
      setPendingFiles([])
      setActions([])
      setInput('')
      setError('')
      await loadConversations()
      textareaRef.current?.focus()
      return conversation
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create conversation')
      return null
    }
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!token) return
      const target = event.target as HTMLElement | null
      const typing = target && ['INPUT', 'TEXTAREA'].includes(target.tagName)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!liveActive) void newConversation()
      }
      if (!typing && event.key === '/') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search-box input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [token, liveActive])

  const stopContinuousScreen = useCallback(() => {
    if (continuousScreenStream) {
      continuousScreenStream.getTracks().forEach(track => track.stop())
      setContinuousScreenStream(null)
    }
    if (miniPreviewVideoRef.current) {
      miniPreviewVideoRef.current.srcObject = null
    }
  }, [continuousScreenStream])

  const captureTrackToBlob = async (stream: MediaStream): Promise<Blob | null> => {
    const track = stream.getVideoTracks()[0]
    if (!track || track.readyState !== 'live') return null

    // 1. ImageCapture API (Chromium native, directly grabs OS hardware frame buffer without rendering)
    const windowWithCapture = window as unknown as {
      ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> }
    }
    if (typeof windowWithCapture.ImageCapture === 'function') {
      try {
        const capturer = new windowWithCapture.ImageCapture(track)
        const bitmap = await capturer.grabFrame()
        if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
          const canvas = document.createElement('canvas')
          const maxWidth = 1280
          canvas.width = Math.min(bitmap.width, maxWidth)
          canvas.height = Math.max(1, Math.round((canvas.width * bitmap.height) / bitmap.width))
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
            bitmap.close()
            return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
          }
        }
      } catch (err) {
        console.warn('ImageCapture grabFrame failed, falling back to composited video element:', err)
      }
    }

    // 2. Offscreen composited video element with explicit play() & readyState check
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.autoplay = true
    video.srcObject = new MediaStream([track])
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:320px;height:180px;opacity:0.01;pointer-events:none;z-index:-1;'
    document.body.appendChild(video)
    try {
      await video.play().catch(() => {})
      if (video.readyState < 2) {
        await new Promise<void>(resolve => {
          const onData = () => {
            video.removeEventListener('loadeddata', onData)
            resolve()
          }
          video.addEventListener('loadeddata', onData)
          setTimeout(resolve, 600)
        })
      }
      await new Promise(r => setTimeout(r, 80))
      const canvas = document.createElement('canvas')
      const width = video.videoWidth || 1280
      const height = video.videoHeight || 720
      canvas.width = Math.min(width, 1280)
      canvas.height = Math.max(1, Math.round((canvas.width * height) / width))
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      }
      return null
    } finally {
      video.srcObject = null
      video.remove()
    }
  }

  const startContinuousScreen = async () => {
    if (busy || uploading) return
    setError('')
    if (!active) {
      await newConversation()
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      setContinuousScreenStream(stream)
      // Auto-switch to vision model if current model is text-only
      if (selectedModel && !selectedModel.image_input) {
        const visionModel = models.find(m => m.image_input && m.configured)
        if (visionModel) {
          setModelId(visionModel.id)
        }
      }
      if (miniPreviewVideoRef.current) {
        miniPreviewVideoRef.current.srcObject = stream
        void miniPreviewVideoRef.current.play().catch(() => {})
      }
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setContinuousScreenStream(null)
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') return
      setError(e instanceof Error ? e.message : 'Could not start live screen streaming.')
    }
  }

  const grabContinuousFrame = async (conversationId: string): Promise<Attachment | null> => {
    if (!continuousScreenStream) return null
    const blob = await captureTrackToBlob(continuousScreenStream)
    if (!blob) return null
    const timeStr = new Date().toLocaleTimeString().replace(/:/g, '-')
    const form = new FormData()
    form.append('conversation_id', conversationId)
    form.append('file', new File([blob], `live-screen-${timeStr}.jpg`, { type: 'image/jpeg' }))
    const res = await fetch(`${API}/api/files`, {
      method: 'POST',
      body: form,
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
    })
    if (!res.ok) return null
    return await res.json()
  }

  const streamReply = async (
    prompt: string,
    history = messages,
    fileIds: string[] = pendingFiles.map(file => file.id),
    targetConv: Conversation | null = active
  ) => {
    const conv = targetConv || active
    if (!conv || !isModelConfigured || busy || uploading) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    const attachments = fileIds
      .map(id => pendingFiles.find(file => file.id === id) || history.flatMap(message => message.attachments || []).find(file => file.id === id))
      .filter((file): file is Attachment => Boolean(file))
    const userMsgId = `user-${Date.now()}`
    const assistantMsgId = `assistant-${Date.now()}`
    const next = [
      ...history,
      { role: 'user' as const, content: prompt, attachments, id: userMsgId },
      { role: 'assistant' as const, content: '', id: assistantMsgId }
    ]
    setMessages(next)
    let rafId: number | null = null
    try {
      const response = await fetch(`${API}/api/chat/stream`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/x-ndjson',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        body: JSON.stringify({
          conversation_id: conv.id,
          message: prompt,
          model_id: modelId,
          file_ids: fileIds,
          web_search: webSearch,
          anthropic_api_key: byokAnthropicKey,
          tavily_api_key: byokTavilyKey
        })
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed (${response.status})`)
      }
      if (!response.body) throw new Error('Streaming is not available in this browser.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = '',
        answer = '',
        speechBuffer = '',
        sources: { title: string; url: string }[] = []

      let renderPending = false

      const scheduleUpdate = () => {
        if (renderPending) return
        renderPending = true
        rafId = requestAnimationFrame(() => {
          renderPending = false
          setMessages([...next.slice(0, -1), { role: 'assistant', content: answer, model_id: modelId, sources, id: assistantMsgId }])
        })
      }

      const flushUpdate = () => {
        if (rafId) {
          cancelAnimationFrame(rafId)
          rafId = null
        }
        renderPending = false
        setMessages([...next.slice(0, -1), { role: 'assistant', content: answer, model_id: modelId, sources, id: assistantMsgId }])
      }

      const speakSentence = (sentence: string) => {
        if (!speakResponsesRef.current || !('speechSynthesis' in window)) return
        const clean = sentence
          .replace(/```[\s\S]*?```/g, '')
          .replace(/[*_#`~[\]()]/g, '')
          .trim()
        if (clean.length > 1) {
          try {
            if (speechSynthesis.paused) {
              speechSynthesis.resume()
            }
            const utterance = new SpeechSynthesisUtterance(clean)
            utterance.rate = 1.05
            activeUtterancesRef.current.add(utterance)
            utterance.onend = () => {
              activeUtterancesRef.current.delete(utterance)
            }
            utterance.onerror = () => {
              activeUtterancesRef.current.delete(utterance)
            }
            speechSynthesis.speak(utterance)
          } catch (err) {
            console.warn('Speech synthesis error:', err)
          }
        }
      }

      const consume = (line: string) => {
        if (!line.trim()) return
        const event = JSON.parse(line)
        if (event.type === 'title' && event.title) {
          const t = event.title
          setActive(curr => (curr ? { ...curr, title: t } : curr))
          setConversations(list => list.map(c => (c.id === conv.id ? { ...c, title: t } : c)))
        }
        if (event.type === 'sources') {
          sources = event.sources || []
          scheduleUpdate()
        }
        if (event.type === 'delta') {
          answer += event.text
          scheduleUpdate()
          if (speakResponsesRef.current) {
            speechBuffer += event.text
            const match = speechBuffer.match(/^([\s\S]*?[.!?\n]+)\s+([\s\S]*)$/)
            if (match) {
              speakSentence(match[1])
              speechBuffer = match[2]
            }
          }
        }
        if (event.type === 'error') throw new Error(event.message)
      }
      while (true) {
        const { value, done } = await reader.read()
        pending += decoder.decode(value || new Uint8Array(), { stream: !done })
        const lines = pending.split('\n')
        pending = lines.pop() || ''
        for (const line of lines) consume(line)
        if (done) break
      }
      if (pending) consume(pending)
      flushUpdate()
      if (speakResponsesRef.current && speechBuffer.trim()) {
        speakSentence(speechBuffer)
        speechBuffer = ''
      }
      await loadConversations()
      void loadActions(conv.id)
      void loadActivity(conv.id)
    } catch (e) {
      if (rafId) cancelAnimationFrame(rafId)
      if (e instanceof DOMException && e.name === 'AbortError') {
        speechSynthesis.cancel()
        activeUtterancesRef.current.clear()
        setMessages(current => (current.at(-1)?.content ? current : current.slice(0, -1)))
        await loadConversations()
      } else {
        const errorMsg = e instanceof Error ? e.message : 'The response failed.'
        setError(errorMsg)
        setMessages(current => {
          const last = current.at(-1)
          if (last && last.role === 'assistant' && !last.content) {
            return [
              ...current.slice(0, -1),
              {
                role: 'assistant',
                content: `⚠️ **Unable to complete response**\n\n${errorMsg}\n\n*Tip: Check that the backend server is running and the selected model is configured with a valid API key.*`,
                model_id: modelId
              }
            ]
          }
          return current
        })
        await loadConversations()
      }
    } finally {
      setBusy(false)
      abortRef.current = null
      textareaRef.current?.focus()
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const prompt = input.trim() || (continuousScreenStream ? 'What is on my screen currently? Please analyze and explain.' : (pendingFiles.length ? 'Please analyze the attached file(s).' : ''))
    if (!prompt || busy || uploading) return

    if (selectedModel?.byok && !byokAnthropicKey) {
      setByokTempKey('')
      setByokModalOpen(true)
      return
    }

    let conversation = active
    if (!conversation) {
      conversation = await newConversation()
      if (!conversation) return
    }

    if (liveActive && liveRef.current?.socket?.readyState !== WebSocket.OPEN) {
      stopLive()
    }

    if (liveActive && liveRef.current?.socket?.readyState === WebSocket.OPEN) {
      const socket = liveRef.current.socket
      setInput('')
      setLiveTranscript(current => {
        const trimmed = current.trimEnd()
        return (trimmed ? `${trimmed}\n\nYou: ${prompt}\n` : `You: ${prompt}\n`).slice(-1800)
      })
      setLiveStatus('Thinking…')

      const tempUserId = 'u-' + Date.now()
      const tempAssId = 'ass-' + Date.now()
      if (liveRef.current) {
        liveRef.current.currentAssistantId = tempAssId
        liveRef.current.isAssistantTurn = true
      }
      setMessages(current => [
        ...current,
        {
          id: tempUserId,
          conversation_id: conversation.id,
          role: 'user',
          content: prompt,
          model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
          created_at: new Date().toISOString()
        },
        {
          id: tempAssId,
          conversation_id: conversation.id,
          role: 'assistant',
          content: '',
          model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
          created_at: new Date().toISOString()
        }
      ])

      const live = liveRef.current
      const isScreenActive = Boolean(live?.streams[0] && live?.grabFrame && live?.streams[0].getVideoTracks().some(t => t.readyState === 'live'))
      const frame = isScreenActive ? ((live?.grabFrame ? live.grabFrame() : null) || latestLiveFrameRef.current) : null
      const parts: any[] = []
      if (frame) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: frame } })
      }
      parts.push({ text: prompt })
      socket.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts
              }
            ],
            turnComplete: true
          }
        })
      )
      return
    }

    shouldBeListeningRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {}
    recognitionRef.current = null
    setVoiceListening(false)

    let currentPending = [...pendingFiles]
    if (continuousScreenStream) {
      if (selectedModel && !selectedModel.image_input) {
        setError(`${selectedModel.provider} (${selectedModel.name}) is a text-only model. Please switch to Google Gemini or Claude for visual screen understanding.`)
        return
      }
      setUploading(true)
      try {
        const liveFrame = await grabContinuousFrame(conversation.id)
        if (liveFrame) {
          currentPending = [...currentPending, liveFrame]
        }
      } catch (err) {
        console.warn('Frame capture error:', err)
      } finally {
        setUploading(false)
      }
    }

    if (selectedModel && !selectedModel.image_input && currentPending.some(file => file.mime_type.startsWith('image/'))) {
      setError(`${selectedModel.provider} (${selectedModel.name}) does not support image attachments. Please select Google Gemini or Claude.`)
      return
    }

    const ids = currentPending.map(file => file.id)
    setInput('')
    setPendingFiles([])
    streamReply(prompt, messages, ids, conversation)
  }

  const uploadSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selected.length) return
    let conversation = active
    if (!conversation) {
      conversation = await newConversation()
      if (!conversation) return
    }
    if (selected.length + pendingFiles.length > 3) {
      setError('Attach up to 3 files to each message.')
      return
    }
    setUploading(true)
    setError('')
    try {
      for (const file of selected) {
        const form = new FormData()
        form.append('conversation_id', conversation.id)
        form.append('file', file)
        const response = await fetch(`${API}/api/files`, {
          method: 'POST',
          body: form,
          headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Could not upload ${file.name}`)
        }
        const uploaded = await response.json()
        setPendingFiles(current => [...current, uploaded])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File upload failed')
    } finally {
      setUploading(false)
    }
  }

  const removeFile = async (file: Attachment) => {
    try {
      await request(`/api/files/${file.id}`, { method: 'DELETE' })
      setPendingFiles(current => current.filter(item => item.id !== file.id))
      setMessages(current =>
        current.map(message => ({
          ...message,
          attachments: message.attachments?.filter(item => item.id !== file.id)
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove file')
    }
  }

  const keySubmit = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      textareaRef.current?.form?.requestSubmit()
    }
  }

  const deleteConversation = async (event: React.MouseEvent, conversation: Conversation) => {
    event.stopPropagation()
    try {
      await request(`/api/conversations/${conversation.id}`, { method: 'DELETE' })
      if (active?.id === conversation.id) {
        setActive(null)
        setMessages([])
        setActions([])
      }
      await loadConversations()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete conversation')
    }
  }

  const renameConversation = async (event: React.MouseEvent, conversation: Conversation) => {
    event.stopPropagation()
    const title = window.prompt('Rename conversation', conversation.title)?.trim()
    if (!title) return
    try {
      await request(`/api/conversations/${conversation.id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
      await loadConversations()
      if (active?.id === conversation.id) setActive({ ...active, title })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename conversation')
    }
  }

  const copy = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text)
    setCopied(index)
    window.setTimeout(() => setCopied(null), 1200)
  }

  const regenerate = () => {
    if (!busy && messages.length > 1) {
      const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
      if (lastUserIndex >= 0) {
        streamReply(
          messages[lastUserIndex].content,
          messages.slice(0, lastUserIndex),
          messages[lastUserIndex].attachments?.map(file => file.id) || []
        )
      }
    }
  }

  const authenticate = async (event: FormEvent) => {
    event.preventDefault()
    setAuthBusy(true)
    setError('')
    try {
      const result = await request<{ access_token: string }>(`/api/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ email: authEmail, password: authPassword, invite_code: authInviteCode })
      })
      sessionToken = result.access_token
      sessionStorage.setItem('omniassist.session', sessionToken)
      setToken(sessionToken)
      setAuthPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.')
    } finally {
      setAuthBusy(false)
    }
  }

  const clearConversationSummary = async () => {
    if (!active || !window.confirm('Clear the compact summary for this conversation? Original messages will remain.')) return
    try {
      await request(`/api/conversations/${active.id}/summary`, { method: 'DELETE' })
      setActive({ ...active, summary: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear the summary.')
    }
  }

  const signOut = () => {
    stopContinuousScreen()
    shouldBeListeningRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {}
    recognitionRef.current = null
    setVoiceListening(false)
    speechSynthesis.cancel()
    stopLive()
    sessionToken = ''
    sessionStorage.removeItem('omniassist.session')
    setToken('')
    setAccount(null)
    setActive(null)
    setMessages([])
    setConversations([])
    setActions([])
  }

  const stopScreen = () => {
    const live = liveRef.current
    if (!live) return
    if (live.timer) window.clearTimeout(live.timer)
    live.timer = undefined
    forceLiveFrameRef.current = null
    latestLiveFrameRef.current = null
    try {
      live.screenVideo?.remove()
      live.screenVideo = undefined
    } catch {}
    live.grabFrame = undefined
    live.streams[0]?.getTracks().forEach(track => track.stop())
    live.streams[0] = undefined
    setLivePreview(null)
    setLiveScreen(false)
  }

  const stopMic = () => {
    const live = liveRef.current
    if (!live) return
    live.streams[1]?.getTracks().forEach(track => track.stop())
    live.streams[1] = undefined
    if (live.socket.readyState === WebSocket.OPEN) {
      live.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
    }
    setLiveMic(false)
    setLiveMicMuted(false)
  }

  const toggleMicMute = () => {
    const live = liveRef.current
    if (!live || !liveMic) return
    const muted = !liveMicMuted
    live.streams[1]?.getAudioTracks().forEach(track => (track.enabled = !muted))
    setLiveMicMuted(muted)
  }

  const toggleDictation = () => {
    if (recognitionRef.current || shouldBeListeningRef.current) {
      shouldBeListeningRef.current = false
      try {
        recognitionRef.current?.stop()
      } catch {}
      recognitionRef.current = null
      setVoiceListening(false)
      return
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setError('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.')
      return
    }
    try {
      speechSynthesis.cancel()
      activeUtterancesRef.current.clear()
    } catch {}

    // Automatically enable voice response so the assistant replies in voice form
    setSpeakResponses(true)
    speakResponsesRef.current = true

    baseInputRef.current = input.trim()
    finalTranscriptRef.current = ''
    shouldBeListeningRef.current = true

    const recognition = new Recognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = event => {
      let sessionFinal = ''
      let sessionInterim = ''
      for (let i = 0; i < event.results.length; i++) {
        const item = event.results[i]
        if (item.isFinal) {
          sessionFinal += item[0].transcript + ' '
        } else {
          sessionInterim += item[0].transcript
        }
      }
      const allFinal = (finalTranscriptRef.current + sessionFinal).trim()
      const spoken = (allFinal + (sessionInterim ? ' ' + sessionInterim : '')).trim()
      const base = baseInputRef.current
      const combined = base ? `${base} ${spoken}` : spoken
      setInput(combined)
    }

    recognition.onerror = event => {
      const err = event?.error
      if (err === 'no-speech' || err === 'aborted') {
        // Natural pause: do not terminate continuous dictation
        return
      }
      if (err === 'not-allowed' || err === 'audio-capture') {
        shouldBeListeningRef.current = false
        setVoiceListening(false)
        recognitionRef.current = null
        setError('Microphone access was denied. Please allow microphone permissions in your browser.')
      }
    }

    recognition.onend = () => {
      if (shouldBeListeningRef.current) {
        // Keep listening across pauses
        try {
          recognition.start()
          return
        } catch {}
      }
      shouldBeListeningRef.current = false
      setVoiceListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    setVoiceListening(true)
    try {
      recognition.start()
    } catch {
      shouldBeListeningRef.current = false
      setVoiceListening(false)
      recognitionRef.current = null
      setError('Could not start speech recognition.')
    }
  }

  const stopLive = () => {
    const live = liveRef.current
    if (!live) return
    if (live.timer) window.clearTimeout(live.timer)
    if (live.vadTimer) window.clearTimeout(live.vadTimer)
    if (live.turnWatchdog) window.clearTimeout(live.turnWatchdog)
    if (liveClockRef.current) window.clearInterval(liveClockRef.current)
    liveClockRef.current = undefined
    liveStartedAtRef.current = 0
    forceLiveFrameRef.current = null
    latestLiveFrameRef.current = null
    try {
      live.screenVideo?.remove()
      live.screenVideo = undefined
    } catch {}
    live.grabFrame = undefined
    try {
      if (live.speechRec) {
        live.speechRec.onend = null
        live.speechRec.stop()
      }
      live.processor?.disconnect()
      live.source?.disconnect()
      live.silent?.disconnect()
    } catch {}
    live.streams.forEach(stream => stream?.getTracks().forEach(track => track.stop()))
    live.audio?.close().catch(() => {})
    try {
      live.socket.close()
    } catch {}
    liveRef.current = null
    setLiveActive(false)
    setLiveScreen(false)
    setLiveMic(false)
    setLiveMicMuted(false)
    setLivePreview(null)
    setLiveStatus('')
    setLiveDuration(0)
  }

  const attachLiveScreen = (screen: MediaStream) => {
    const live = liveRef.current
    if (!live) {
      screen.getTracks().forEach(track => track.stop())
      return
    }
    try {
      live.screenVideo?.remove()
    } catch {}
    live.streams[0]?.getTracks().forEach(track => track.stop())
    live.streams[0] = screen
    setLivePreview(screen)
    setLiveScreen(true)
    const socket = live.socket
    const track = screen.getVideoTracks()[0]
    if (!track) return

    // Offscreen mounted video element ensures Chrome actively decodes screen frames
    const video = document.createElement('video')
    video.playsInline = true
    video.muted = true
    video.autoplay = true
    video.srcObject = screen
    video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:320px;height:180px;opacity:0.001;pointer-events:none;z-index:-1;'
    document.body.appendChild(video)
    live.screenVideo = video
    void video.play().catch(() => {})

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    const grabFrame = (): string | null => {
      try {
        if (!ctx) return latestLiveFrameRef.current
        const w = video.videoWidth || (video as any).naturalWidth
        const h = video.videoHeight || (video as any).naturalHeight
        if (!w || !h) return latestLiveFrameRef.current
        const maxWidth = 1024
        canvas.width = Math.min(w, maxWidth)
        canvas.height = Math.max(1, Math.round((canvas.width * h) / w))
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const b64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]
        if (b64 && b64.length > 50) {
          latestLiveFrameRef.current = b64
          return b64
        }
      } catch (err) {
        console.warn('Live frame capture error:', err)
      }
      return latestLiveFrameRef.current
    }

    live.grabFrame = grabFrame

    // Background periodic capture to keep frame cache fresh and stream video frames to Gemini Live
    const scheduleNext = () => {
      if (liveRef.current !== live || socket.readyState !== WebSocket.OPEN) return
      grabFrame()
      live.timer = window.setTimeout(scheduleNext, 1000)
    }

    if (video.readyState >= 2) {
      grabFrame()
      live.timer = window.setTimeout(scheduleNext, 1000)
    } else {
      video.onloadeddata = () => {
        grabFrame()
        live.timer = window.setTimeout(scheduleNext, 1000)
      }
      live.timer = window.setTimeout(scheduleNext, 400)
    }

    const sendCurrentLiveFrame = async (customPrompt?: string) => {
      if (socket.readyState !== WebSocket.OPEN) return
      const frame = grabFrame()
      const prompt = customPrompt || 'Analyze what is currently displayed on my screen and explain what you see.'
      setLiveStatus('Thinking…')
      setLiveTranscript(prev => {
        const trimmed = prev.trimEnd()
        return (trimmed ? `${trimmed}\n\nYou: ${prompt}\n` : `You: ${prompt}\n`).slice(-1800)
      })
      const tempUserId = 'u-' + Date.now()
      const tempAssId = 'ass-' + Date.now()
      if (liveRef.current) {
        liveRef.current.currentAssistantId = tempAssId
        liveRef.current.isAssistantTurn = true
      }
      setMessages(current => [
        ...current,
        {
          id: tempUserId,
          conversation_id: active?.id || '',
          role: 'user',
          content: prompt,
          model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
          created_at: new Date().toISOString()
        },
        {
          id: tempAssId,
          conversation_id: active?.id || '',
          role: 'assistant',
          content: '',
          model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
          created_at: new Date().toISOString()
        }
      ])
      const parts: any[] = []
      if (frame) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: frame } })
      }
      parts.push({ text: prompt })
      socket.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts }],
            turnComplete: true
          }
        })
      )
    }

    forceLiveFrameRef.current = () => void sendCurrentLiveFrame()
    track.addEventListener('ended', stopScreen)
  }

  const shareLiveScreen = async () => {
    if (!liveActive) return
    try {
      setLiveStatus('Allow screen access…')
      attachLiveScreen(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }))
      setLiveStatus('Listening')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share the screen.')
    }
  }

  const captureScreenSnapshot = async (conversationTarget = active) => {
    if (uploading || busy || liveActive) return
    let conversation = conversationTarget
    if (!conversation) {
      conversation = await newConversation()
      if (!conversation) return
    }
    setUploading(true)
    setError('')
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const blob = await captureTrackToBlob(stream)
      if (!blob) throw new Error('Could not capture a screen frame.')
      const form = new FormData()
      form.append('conversation_id', conversation.id)
      form.append('file', new File([blob], 'screen-capture.jpg', { type: 'image/jpeg' }))
      const response = await fetch(`${API}/api/files`, {
        method: 'POST',
        body: form,
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail || 'Could not upload the screen capture.')
      }
      const uploadedCapture = await response.json()
      setPendingFiles(current => [...current, uploadedCapture])
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') return
      setError(e instanceof Error ? e.message : 'Could not capture the screen.')
    } finally {
      stream?.getTracks().forEach(track => track.stop())
      setUploading(false)
    }
  }

  const startLive = async (targetConversation?: Conversation | null) => {
    if (liveActive || !token) return
    setModelMenu(false)
    speechSynthesis.cancel()

    // Create and resume AudioContext synchronously within user click event to preserve autoplay permission
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    let context: AudioContext
    try {
      context = new AudioContextClass({ sampleRate: 16000 })
    } catch {
      context = new AudioContextClass()
    }
    if (context.state === 'suspended') {
      void context.resume()
    }

    let conversation = targetConversation || active
    if (!conversation) {
      conversation = await newConversation()
      if (!conversation) return
    }
    if (!liveModel?.configured) {
      setError('Gemini Live is not configured on the server. Add a Gemini API key and enable live mode in backend/.env.')
      return
    }
    try {
      setLiveStatus('Allow microphone access…')
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      const apiUrl = new URL(API || location.origin, location.href)
      apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
      apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, '')}/api/live`
      const socket = new WebSocket(apiUrl.toString())
      const live: {
        socket: WebSocket
        streams: (MediaStream | undefined)[]
        audio?: AudioContext
        nextPlay: number
        playback: Set<AudioBufferSourceNode>
        processor?: ScriptProcessorNode
        source?: MediaStreamAudioSourceNode
        silent?: GainNode
        timer?: number
    vadTimer?: number
        speechRec?: SpeechRecognitionLike | null
        currentAssistantId?: string | null
        screenVideo?: HTMLVideoElement
        grabFrame?: () => string | null
        isSpeaking?: boolean
        isAssistantTurn?: boolean
        turnCompletedAt?: number
        turnWatchdog?: number
      } = {
        socket,
        streams: [undefined, mic],
        audio: context,
        nextPlay: context.currentTime + 0.1,
        playback: new Set<AudioBufferSourceNode>(),
        currentAssistantId: null
      }
      liveRef.current = live
      setLiveTranscript('')
      forceLiveFrameRef.current = null
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => {
          socket.send(JSON.stringify({ token: sessionToken, conversation_id: conversation.id }))
          setLiveStatus('Connecting to Gemini Live…')
          resolve()
        }
        socket.onerror = () => reject(new Error('Could not connect to the live service.'))
      })
      let liveTurnComplete = false
      let isUserSpeaking = false
      let lastVoiceDetectedAt = 0
      let lastSpokenText = ''

      const triggerVoiceTurnComplete = () => {
        if (!isUserSpeaking || socket.readyState !== WebSocket.OPEN) return
        isUserSpeaking = false
        if (live.vadTimer) {
          window.clearTimeout(live.vadTimer)
          live.vadTimer = undefined
        }

        const promptText = lastSpokenText.trim()
        lastSpokenText = ''

        live.isSpeaking = false
        live.isAssistantTurn = true
        setLiveStatus('Thinking…')

        if (live.turnWatchdog) {
          window.clearTimeout(live.turnWatchdog)
        }
        live.turnWatchdog = window.setTimeout(() => {
          if (liveRef.current === live && live.isAssistantTurn && !live.isSpeaking && live.playback.size === 0) {
            console.warn('[Live] Turn watchdog expired - restoring Listening state')
            finishTurn()
          }
        }, 12000)

        // Pause speech recognition while thinking and speaking to avoid self-pickup
        if (live.speechRec) {
          try {
            live.speechRec.stop()
          } catch {}
        }

        const tempUserId = 'u-' + Date.now()
        const tempAssId = 'ass-' + Date.now()
        live.currentAssistantId = tempAssId

        if (promptText) {
          setMessages(current => [
            ...current,
            {
              id: tempUserId,
              conversation_id: conversation.id,
              role: 'user',
              content: promptText,
              model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
              created_at: new Date().toISOString()
            },
            {
              id: tempAssId,
              conversation_id: conversation.id,
              role: 'assistant',
              content: '',
              model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
              created_at: new Date().toISOString()
            }
          ])
        }

        const isScreenActive = Boolean(live.streams[0] && live.grabFrame && live.streams[0].getVideoTracks().some(t => t.readyState === 'live'))
        const frame = isScreenActive ? ((live.grabFrame ? live.grabFrame() : null) || latestLiveFrameRef.current) : null
        const parts: any[] = []
        if (frame) {
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: frame } })
        }
        if (promptText) {
          parts.push({ text: promptText })
        } else if (frame) {
          parts.push({ text: 'What do you see on my screen?' })
        }

        if (parts.length > 0) {
          socket.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts
                  }
                ],
                turnComplete: true
              }
            })
          )
        } else {
          socket.send(
            JSON.stringify({
              clientContent: {
                turnComplete: true
              }
            })
          )
        }
      }

      const finishTurn = () => {
        live.isSpeaking = false
        live.isAssistantTurn = false
        isUserSpeaking = false
        lastSpokenText = ''
        if (live.vadTimer) {
          window.clearTimeout(live.vadTimer)
          live.vadTimer = undefined
        }
        if (live.turnWatchdog) {
          window.clearTimeout(live.turnWatchdog)
          live.turnWatchdog = undefined
        }
        live.turnCompletedAt = Date.now()
        live.currentAssistantId = null
        setLiveStatus('Listening')
        if (live.speechRec) {
          try {
            live.speechRec.start()
          } catch {}
        }
      }

      const speechWindow = window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionLike
        webkitSpeechRecognition?: new () => SpeechRecognitionLike
      }
      const RecognitionClass = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition

      if (RecognitionClass) {
        try {
          const rec = new RecognitionClass()
          rec.lang = navigator.language || 'en-US'
          rec.continuous = true
          rec.interimResults = true

          rec.onresult = (event: any) => {
            if (live.isSpeaking || live.playback.size > 0 || live.isAssistantTurn) return
            let interim = ''
            let final = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const item = event.results[i]
              if (item.isFinal) {
                final += item[0].transcript + ' '
              } else {
                interim += item[0].transcript
              }
            }
            const currentSpoken = (final + interim).trim()
            if (currentSpoken) {
              lastSpokenText = currentSpoken
              isUserSpeaking = true
              lastVoiceDetectedAt = Date.now()
              setLiveStatus('Listening (hearing you…)')
              setLiveTranscript(prev => {
                const trimmed = prev.trimEnd()
                const lines = trimmed.split('\n')
                const last = lines[lines.length - 1] || ''
                if (last.startsWith('You:')) {
                  const prefix = lines.slice(0, -1).join('\n')
                  return (prefix ? `${prefix}\n\nYou: ${currentSpoken}` : `You: ${currentSpoken}`).slice(-2000)
                }
                return (trimmed ? `${trimmed}\n\nYou: ${currentSpoken}` : `You: ${currentSpoken}`).slice(-2000)
              })
              if (live.vadTimer) {
                window.clearTimeout(live.vadTimer)
              }
              live.vadTimer = window.setTimeout(triggerVoiceTurnComplete, 800)
            }
          }

          rec.onerror = (err: any) => {
            if (err?.error !== 'no-speech' && err?.error !== 'aborted') {
              console.warn('[Live SpeechRec] non-fatal:', err?.error)
            }
          }

          rec.onend = () => {
            if (liveRef.current === live && !live.isSpeaking) {
              try {
                rec.start()
              } catch {}
            }
          }

          try {
            rec.start()
          } catch {}
          live.speechRec = rec
        } catch (err) {
          console.warn('[Live] Speech recognition init error:', err)
        }
      }

      socket.onmessage = async event => {
        const packet = JSON.parse(event.data)
        if (packet.error) {
          setError(packet.error)
          stopLive()
          return
        }
        if (packet.sessionState === 'resuming') setLiveStatus('Reconnecting…')
        if (packet.liveSessionStarted?.conversation_id) {
          const newConvId = packet.liveSessionStarted.conversation_id
          if (!active || active.id !== newConvId) {
            void loadConversations().then(() => {
              void request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${newConvId}`)
                .then(data => {
                  setActive(data.conversation)
                  setMessages(data.messages)
                })
                .catch(() => {})
            })
          }
        }
        if (packet.liveTurnSaved) {
          const { user_text, assistant_text, title: liveTitle, conversation_id: savedConvId } = packet.liveTurnSaved
          if (liveTitle) {
            setActive(curr => (curr ? { ...curr, title: liveTitle } : curr))
            setConversations(list => list.map(c => (c.id === (savedConvId || conversation.id) ? { ...c, title: liveTitle } : c)))
          }
          if (assistant_text) {
            setLiveTranscript(prev => {
              if (!prev.includes(assistant_text.slice(0, 30))) {
                const trimmed = prev.trimEnd()
                return (trimmed ? `${trimmed}\n\nOmniAssist: ${assistant_text}` : `OmniAssist: ${assistant_text}`).slice(-2000)
              }
              return prev
            })
            setMessages(current => {
              const targetId = live.currentAssistantId
              if (targetId && current.some(m => m.id === targetId)) {
                return current.map(m => (m.id === targetId ? { ...m, content: assistant_text } : m))
              }
              const last = current[current.length - 1]
              if (last && last.role === 'assistant') {
                return [...current.slice(0, -1), { ...last, content: assistant_text }]
              }
              return current
            })
          }
          if (conversation?.id || savedConvId) {
            void request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${savedConvId || conversation.id}`)
              .then(data => {
                if (data?.messages) setMessages(data.messages)
                if (data?.conversation) setConversations(c => [data.conversation, ...c.filter(i => i.id !== data.conversation.id)])
              })
              .catch(() => {})
          }
        }
        const serverContent = packet.serverContent
        if (serverContent?.inputTranscription?.text) {
          liveTurnComplete = false
          setLiveStatus('Listening (hearing you…)')
          lastVoiceDetectedAt = Date.now()
          if (!isUserSpeaking) {
            isUserSpeaking = true
          }
          if (live.vadTimer) {
            window.clearTimeout(live.vadTimer)
          }
          live.vadTimer = window.setTimeout(triggerVoiceTurnComplete, 850)
          const userChunk = serverContent.inputTranscription.text
          setLiveTranscript(current => {
            const trimmed = current.trimEnd()
            const lines = trimmed.split('\n')
            const last = lines[lines.length - 1] || ''
            if (last.startsWith('You:')) {
              return (current + userChunk).slice(-2000)
            }
            return (trimmed ? `${trimmed}\n\nYou: ${userChunk}` : `You: ${userChunk}`).slice(-2000)
          })
          setMessages(current => {
            const last = current[current.length - 1]
            if (last && last.role === 'user' && last.id?.startsWith('live-u-')) {
              return [...current.slice(0, -1), { ...last, content: last.content + userChunk }]
            }
            return [
              ...current,
              {
                id: 'live-u-' + Date.now(),
                conversation_id: conversation.id,
                role: 'user',
                content: userChunk,
                model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
                created_at: new Date().toISOString()
              }
            ]
          })
        }
        const directText = (serverContent?.modelTurn?.parts || [])
          .filter((p: any) => typeof p.text === 'string')
          .map((p: any) => p.text)
          .join('')
        const chunk = (serverContent?.outputTranscription?.text || '') + directText
        if (chunk) {
          live.isSpeaking = true
          live.isAssistantTurn = true
          setLiveStatus('Speaking…')
          setLiveTranscript(current => {
            const trimmed = current.trimEnd()
            const lines = trimmed.split('\n')
            const last = lines[lines.length - 1] || ''
            if (last.startsWith('OmniAssist:')) {
              return (current + chunk).slice(-2000)
            }
            return (trimmed ? `${trimmed}\n\nOmniAssist: ${chunk}` : `OmniAssist: ${chunk}`).slice(-2000)
          })
          setMessages(current => {
            const targetId = live.currentAssistantId
            if (targetId && current.some(m => m.id === targetId)) {
              return current.map(m => (m.id === targetId ? { ...m, content: (m.content || '') + chunk } : m))
            }
            const last = current[current.length - 1]
            if (last && last.role === 'assistant') {
              return [...current.slice(0, -1), { ...last, content: (last.content || '') + chunk }]
            }
            const newId = 'ass-' + Date.now()
            live.currentAssistantId = newId
            return [
              ...current,
              {
                id: newId,
                conversation_id: conversation.id,
                role: 'assistant',
                content: chunk,
                model_id: 'gemini-live:' + (liveModel?.name || 'gemini-3.8-live'),
                created_at: new Date().toISOString()
              }
            ]
          })
        }
        if (serverContent?.turnComplete || serverContent?.generationComplete) {
          liveTurnComplete = true
          if (live.playback.size === 0) {
            finishTurn()
          }
          request<{ conversation: Conversation; messages: Message[] }>(`/api/conversations/${conversation.id}`)
            .then(data => {
              if (data?.messages) {
                setMessages(data.messages)
                setConversations(current => [data.conversation, ...current.filter(item => item.id !== data.conversation.id)])
              }
            })
            .catch(() => {})
        }
        if (packet.serverContent?.interrupted) {
          for (const item of live.playback) {
            try {
              item.stop()
            } catch {}
          }
          live.playback.clear()
          live.nextPlay = context.currentTime
          finishTurn()
          liveTurnComplete = false
        }
        const data = packet.serverContent?.modelTurn?.parts?.find(
          (part: { inlineData?: { mimeType: string; data: string } }) => part.inlineData?.mimeType?.startsWith('audio/')
        )?.inlineData?.data
        if (data) {
          live.isSpeaking = true
          live.isAssistantTurn = true
          if (live.speechRec) {
            try {
              live.speechRec.stop()
            } catch {}
          }
          setLiveStatus('Speaking…')
          try {
            if (context.state === 'suspended') {
              void context.resume()
            }
            const binaryString = atob(data)
            const sampleCount = Math.floor(binaryString.length / 2)
            if (sampleCount > 0) {
              const floats = new Float32Array(sampleCount)
              for (let i = 0; i < sampleCount; i++) {
                const low = binaryString.charCodeAt(i * 2)
                const high = binaryString.charCodeAt(i * 2 + 1)
                let val = (high << 8) | low
                if (val >= 32768) val -= 65536
                floats[i] = val / 32768
              }
              const buffer = context.createBuffer(1, sampleCount, 24000)
              buffer.copyToChannel(floats, 0)
              const source = context.createBufferSource()
              source.buffer = buffer
              source.connect(context.destination)
              live.playback.add(source)
              source.onended = () => {
                live.playback.delete(source)
                if (liveTurnComplete && live.playback.size === 0) {
                  finishTurn()
                }
              }
              const start = Math.max(context.currentTime, live.nextPlay)
              source.start(start)
              live.nextPlay = start + buffer.duration
            }
          } catch (err) {
            console.error('Gemini Live audio playback error:', err)
          }
        }
        if (packet.setupComplete) {
          finishTurn()
        }
      }
      socket.onclose = () => {
        if (liveRef.current === live) stopLive()
      }
      const source = context.createMediaStreamSource(mic)
      const processor = context.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = event => {
        if (socket.readyState !== WebSocket.OPEN) return
        // Do not stream mic audio to Google while assistant is actively speaking, playing audio, or thinking
        if (live.isSpeaking || live.playback.size > 0 || live.isAssistantTurn) return
        if (live.turnCompletedAt && Date.now() - live.turnCompletedAt < 400) return

        const inBuf = event.inputBuffer.getChannelData(0)
        let sum = 0
        for (let i = 0; i < inBuf.length; i++) {
          sum += inBuf[i] * inBuf[i]
        }
        const rms = Math.sqrt(sum / inBuf.length)

        const SPEECH_THRESHOLD = 0.012
        const now = Date.now()

        if (rms >= SPEECH_THRESHOLD) {
          lastVoiceDetectedAt = now
          if (!isUserSpeaking) {
            isUserSpeaking = true
            setLiveStatus('Listening (hearing you…)')
          }
          if (live.vadTimer) {
            window.clearTimeout(live.vadTimer)
          }
          live.vadTimer = window.setTimeout(triggerVoiceTurnComplete, 800)
        } else if (isUserSpeaking) {
          if (!live.vadTimer) {
            const elapsed = now - lastVoiceDetectedAt
            const remaining = Math.max(100, 800 - elapsed)
            live.vadTimer = window.setTimeout(triggerVoiceTurnComplete, remaining)
          }
        } else {
          // Ambient room noise before speech starts - skip to avoid streaming empty noise
          if (rms < 0.005) return
        }

        const ratio = context.sampleRate / 16000
        const pcm = new Int16Array(Math.floor(inBuf.length / ratio))
        for (let i = 0; i < pcm.length; i++) {
          const sample = Math.max(-1, Math.min(1, inBuf[Math.floor(i * ratio)]))
          pcm[i] = sample < 0 ? sample * 32768 : sample * 32767
        }
        const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
        let binary = ''
        for (let j = 0; j < bytes.byteLength; j++) {
          binary += String.fromCharCode(bytes[j])
        }
        socket.send(
          JSON.stringify({
            realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(binary) }] }
          })
        )
      }
      const silent = context.createGain()
      silent.gain.value = 0
      source.connect(processor)
      processor.connect(silent)
      silent.connect(context.destination)
      live.processor = processor
      live.source = source
      live.silent = silent
      setLiveActive(true)
      setLiveScreen(false)
      setLiveMic(true)
      setLiveStatus('Listening')
      liveStartedAtRef.current = Date.now()
      setLiveDuration(0)
      liveClockRef.current = window.setInterval(
        () => setLiveDuration(Math.floor((Date.now() - liveStartedAtRef.current) / 1000)),
        1000
      )
    } catch (e) {
      stopLive()
      setLivePreview(null)
      setError(e instanceof Error ? e.message : 'Could not start live assistance.')
    }
  }

  // Browser Action Handlers
  const approveAction = async (actionId: string) => {
    try {
      await request(`/api/actions/${actionId}/approve`, { method: 'POST' })
      void loadActions()
      void loadActivity()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve action.')
    }
  }

  const rejectAction = async (actionId: string) => {
    try {
      await request(`/api/actions/${actionId}/reject`, { method: 'POST' })
      void loadActions()
      void loadActivity()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject action.')
    }
  }

  const executeWebAction = async (action: ActionItem) => {
    try {
      let result: { ok: boolean; message: string } = { ok: true, message: 'Action executed' }
      if (action.action_type === 'navigate_url' || action.action_type === 'open_tab') {
        window.open(action.payload.url, '_blank')
        result = { ok: true, message: `Opened URL: ${action.payload.url}` }
      } else if (action.action_type === 'web_search') {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(action.payload.query)}`, '_blank')
        result = { ok: true, message: `Searched for "${action.payload.query}"` }
      } else if (action.action_type === 'copy_text') {
        await navigator.clipboard.writeText(action.payload.text)
        result = { ok: true, message: 'Copied text to clipboard' }
      } else {
        result = { ok: true, message: 'Marked executed in web client' }
      }
      await request(`/api/actions/${action.id}/result`, { method: 'POST', body: JSON.stringify({ result }) })
      void loadActions()
      void loadActivity()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not execute action.')
    }
  }

  const suggestActionPrompt = async () => {
    if (!isModelConfigured || actionBusy) return
    const conversation = active || (await newConversation())
    if (!conversation) return
    const intent = input.trim()
    if (!intent) {
      setInput('Search for the latest research on multimodal interactive AI assistants')
      return
    }
    setActionBusy(true)
    setError('')
    try {
      await request('/api/actions/suggest', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversation.id,
          model_id: modelId,
          intent
        })
      })
      setInput('')
      void loadActions()
      void loadActivity()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not suggest action.')
    } finally {
      setActionBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <form className="auth-card" onSubmit={authenticate}>
          <div className="brand-mark">
            <Layers2 size={19} />
          </div>
          <div className="eyebrow">PRIVATE AI WORKSPACE</div>
          <h1>{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p>Sign in to access your conversations and files.</p>
          {error && <div className="error-banner">{error}</div>}
          <label>
            Email
            <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              minLength={10}
              required
            />
            <small>At least 10 characters.</small>
          </label>
          {authMode === 'register' && (
            <label>
              Invitation code (if required)
              <input value={authInviteCode} onChange={e => setAuthInviteCode(e.target.value)} autoComplete="one-time-code" />
            </label>
          )}
          <button className="auth-submit" disabled={authBusy}>
            {authBusy ? 'Please wait…' : authMode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login')
              setError('')
            }}
          >
            {authMode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}
          </button>
        </form>
      </div>
    )
  }

  const pendingActions = actions.filter(a => a.status === 'pending')

  return (
    <div className={`app-shell ${dark ? 'theme-dark' : 'theme-light'}`}>
      {sidebar && (
        <aside className="sidebar">
          <div className="brand-row">
            <div className="brand-mark">
              <Layers2 size={18} />
            </div>
            <span className="brand-name">
              omni<span>assist</span>
            </span>
            <button className="icon-button sidebar-collapse" title="Hide sidebar" onClick={() => setSidebar(false)}>
              <PanelLeftClose size={17} />
            </button>
          </div>
          <button className="new-chat" onClick={newConversation}>
            <Plus size={17} />
            <span>New conversation</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="side-label">
            <span>WORKSPACE</span>
          </div>
          <button className="nav-item selected">
            <MessageSquare size={16} />
            <span>Conversations</span>
          </button>
          <div className="history-heading">
            <span>RECENT</span>
            <History size={14} />
          </div>
          <div className="search-box">
            <Search size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations" />
            <kbd>/</kbd>
          </div>
          <div className="conversation-list">
            {conversations.map(c => (
              <div
                key={c.id}
                className={`conversation-item ${active?.id === c.id ? 'active' : ''}`}
                onClick={() => openConversation(c)}
                title={c.title}
              >
                <MessageSquare size={14} />
                <span>{c.title || 'New conversation'}</span>
                <button className="row-more" title="Rename" onClick={e => renameConversation(e, c)}>
                  <Ellipsis size={15} />
                </button>
                <button className="row-delete" title="Delete" onClick={e => deleteConversation(e, c)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {!conversations.length && (
              <div className="empty-history">{search ? 'No matching chats' : 'Your conversations will appear here'}</div>
            )}
          </div>
          <div className="sidebar-bottom">
            <button
              className="nav-item"
              onClick={() => {
                setSettingsTab('models')
                setSettingsOpen(true)
              }}
            >
              <Settings2 size={16} />
              <span>Settings</span>
            </button>
            <div className="profile-card">
              <div className="avatar">{account?.email.slice(0, 1).toUpperCase() || 'O'}</div>
              <div className="profile-copy">
                <strong>{account?.email || 'OmniAssist'}</strong>
                <small>Private workspace</small>
              </div>
              <button className="icon-button" onClick={signOut} title="Sign out">
                <X size={16} />
              </button>
              <button className="icon-button" onClick={() => setDark(!dark)} title="Toggle theme">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
          </div>
        </aside>
      )}

      <main className="main-panel">
        <header className="topbar">
          {!sidebar && (
            <button className="icon-button" onClick={() => setSidebar(true)} title="Show sidebar">
              <PanelLeftClose size={18} />
            </button>
          )}
          <div className="crumb">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{active?.title || 'New conversation'}</strong>
          </div>
          <div className="topbar-right">
            {active?.summary && (
              <button className="icon-button" onClick={clearConversationSummary} title="Clear compact conversation summary">
                Clear summary
              </button>
            )}
            <div className={`connection ${connection}`}>
              <i />
              {connection === 'ready' ? 'Backend connected' : connection === 'offline' ? 'Backend offline' : 'Connecting'}
            </div>
            <button
              className="icon-button help-button"
              title="Settings & Integrations"
              onClick={() => {
                setSettingsTab('models')
                setSettingsOpen(true)
              }}
            >
              <CircleHelp size={17} />
            </button>
          </div>
        </header>

        <section className={`chat-scroll ${messages.length === 0 ? 'is-empty' : ''}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-glyph">
                <Sparkles size={22} />
              </div>
              <div className="eyebrow">YOUR MULTIMODAL AI WORKSPACE</div>
              <h1>
                What can I help you
                <br />
                <span>think through?</span>
              </h1>
              <p>Chat, attach files, capture your screen, or start a live voice session about what you choose to share.</p>
              <div className="suggestion-grid">
                {[
                  ['Explain a concept', 'Break down a complex topic into clear ideas.', '✳'],
                  ['Analyze this screen', 'Capture the window or tab you are looking at, then ask about it.', '▣'],
                  ['Review a document', 'Attach a PDF, image, or notes and ask for a summary.', '☰'],
                  ['Talk it through', 'Start Gemini Live and ask questions out loud.', '◌']
                ].map(([title, desc, glyph]) => (
                  <button
                    key={title}
                    className="suggestion"
                    onClick={() => {
                      const withConversation = async (action: (conversation: Conversation) => void | Promise<void>) => {
                        const conversation = active || (await newConversation())
                        if (conversation) await action(conversation)
                      }
                      if (title === 'Analyze this screen') {
                        void withConversation(captureScreenSnapshot)
                        return
                      }
                      if (title === 'Review a document') {
                        void withConversation(() => fileInputRef.current?.click())
                        return
                      }
                      if (title === 'Talk it through') {
                        void withConversation(startLive)
                        return
                      }
                      void withConversation(() => {
                        setInput('Can you explain this concept step-by-step? ')
                        textareaRef.current?.focus()
                      })
                    }}
                  >
                    <span className="suggestion-glyph">{glyph}</span>
                    <strong>{title}</strong>
                    <small>{desc}</small>
                    <ArrowDown size={14} className="suggestion-arrow motion-reduce:transform-none" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={message.id || `${index}-${message.role}`}>
                  {message.role === 'assistant' ? (
                    <div className={`assistant-avatar ${busy && index === messages.length - 1 ? 'is-thinking' : ''}`}>
                      <AiThinkingVisual
                        state={
                          busy && index === messages.length - 1
                            ? message.content
                              ? 'streaming'
                              : 'thinking'
                            : 'idle'
                        }
                        hasScreenShare={Boolean(continuousScreenStream || (liveActive && liveScreen))}
                        minimal
                        size="sm"
                      />
                    </div>
                  ) : (
                    <div className="user-avatar">Y</div>
                  )}
                  <div className="message-body">
                    <div className="message-meta">
                      <strong>{message.role === 'user' ? 'You' : 'OmniAssist'}</strong>
                      {message.role === 'assistant' && message.model_id && (
                        <span className="model-chip">
                          {models.find(m => m.id === message.model_id)?.name || message.model_id.split(':').pop()}
                        </span>
                      )}
                      {message.role === 'assistant' && busy && index === messages.length - 1 && Boolean(message.content) && (
                        <span className="streaming-badge">Streaming…</span>
                      )}
                    </div>
                    {message.role === 'assistant' ? (
                      <>
                        <div className="markdown">
                          {message.content ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.content}
                            </ReactMarkdown>
                          ) : (
                            <AiThinkingVisual
                              state={busy || liveActive ? 'thinking' : 'idle'}
                              label={liveActive && liveStatus === 'Speaking…' ? 'Speaking…' : busy ? 'Thinking & generating…' : 'Thinking…'}
                            />
                          )}
                          {(busy || (liveActive && liveStatus === 'Speaking…')) && index === messages.length - 1 && <span className="typing-caret" />}
                        </div>
                        {Boolean(message.sources?.length) && (
                          <div className="source-list">
                            <span>Sources</span>
                            {message.sources?.map(source => (
                              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                                {source.title || source.url}
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="user-text">{message.content}</div>
                        {Boolean(message.attachments?.length) && (
                          <div className="message-attachments">
                            {message.attachments?.map(file => (
                              <span className="attachment-chip" key={file.id}>
                                {file.mime_type.startsWith('image/') ? <Image size={13} /> : <FileText size={13} />}
                                <span>{file.filename}</span>
                                <button
                                  type="button"
                                  onClick={() => removeFile(file)}
                                  title={`Delete ${file.filename}`}
                                  aria-label={`Delete ${file.filename}`}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {message.role === 'assistant' && message.content && (
                      <div className="message-actions">
                        <button onClick={() => copy(message.content, index)}>
                          {copied === index ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copied === index ? 'Copied' : 'Copy'}</span>
                        </button>
                        {index === messages.length - 1 && (
                          <button onClick={regenerate} disabled={busy}>
                            <ArrowDown size={14} />
                            <span>Regenerate</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}

              {/* Pending Actions Tray */}
              {pendingActions.length > 0 && (
                <div className="actions-tray">
                  <div className="actions-tray-title">
                    <span>Browser actions awaiting approval ({pendingActions.length})</span>
                    <Compass size={13} />
                  </div>
                  {pendingActions.map(action => (
                    <div className="action-card" key={action.id}>
                      <div className="action-card-header">
                        <span className="action-type-badge">{action.action_type}</span>
                        <span className={`action-status-badge ${action.status}`}>{action.status}</span>
                      </div>
                      <div className="action-payload-text">{JSON.stringify(action.payload)}</div>
                      <div className="action-buttons-row">
                        <button className="action-btn approve" onClick={() => approveAction(action.id)}>
                          Approve
                        </button>
                        <button className="action-btn reject" onClick={() => rejectAction(action.id)}>
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div ref={endRef} />
            </div>
          )}
        </section>

        <footer className="composer-area">
          {error && (
            <div className="error-banner">
              <span>{error}</span>
              <button onClick={() => setError('')} aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )}
          {!isModelConfigured && connection === 'ready' && (
            <div className="config-note">
              {selectedModel?.byok ? (
                <span>
                  Anthropic Claude is a Bring-Your-Own-Key model.{' '}
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    onClick={() => {
                      setByokTempKey(byokAnthropicKey)
                      setByokModalOpen(true)
                    }}
                  >
                    Enter your Anthropic API Key
                  </button>{' '}
                  to start chatting.
                </span>
              ) : (
                <span>Add a provider API key in <code>backend/.env</code> to start chatting with this model.</span>
              )}
            </div>
          )}
          {pendingFiles.some(file => file.mime_type.startsWith('image/')) && !selectedModel?.image_input && (
            <div className="config-note">
              The selected model does not have image input enabled. Choose a vision-capable model to send this image.
            </div>
          )}

          <form className="composer" onSubmit={submit}>
            {pendingFiles.length > 0 && (
              <div className="pending-files">
                {pendingFiles.map(file => (
                  <span className="attachment-chip" key={file.id}>
                    {file.mime_type.startsWith('image/') ? <Image size={13} /> : <FileText size={13} />}
                    <span>{file.filename}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(file)}
                      title={`Remove ${file.filename}`}
                      aria-label={`Remove ${file.filename}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {continuousScreenStream && (
              <div className="continuous-screen-banner">
                <div className="screen-preview-row">
                  <div className="screen-preview-wrapper">
                    <video
                      className="screen-preview-mini"
                      autoPlay
                      muted
                      playsInline
                      ref={element => {
                        miniPreviewVideoRef.current = element
                        if (element && continuousScreenStream && element.srcObject !== continuousScreenStream) {
                          element.srcObject = continuousScreenStream
                          void element.play().catch(() => {})
                        }
                      }}
                    />
                    <div className="screen-preview-glare" />
                  </div>
                  <div>
                    {selectedModel && !selectedModel.image_input ? (
                      <div className="screen-badge warning">
                        <span>⚠️ {selectedModel.provider} is text-only</span>
                      </div>
                    ) : (
                      <div className="screen-live-badge">
                        <span className="screen-live-dot" />
                        <span>LIVE SCREEN STREAMING</span>
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: 'var(--subtle)', marginTop: '4px' }}>
                      {selectedModel && !selectedModel.image_input
                        ? 'Image input is disabled for this model. Switch to Vision for screen understanding.'
                        : 'Real-time visual context active • Fresh frame sent on every prompt or voice question'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {selectedModel && !selectedModel.image_input && (
                    <button
                      type="button"
                      className="btn-mini-switch"
                      onClick={() => {
                        const v = models.find(m => m.image_input && m.configured)
                        if (v) setModelId(v.id)
                      }}
                      title="Switch to a vision-capable model"
                    >
                      Switch to Vision
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-mini-snap"
                    onClick={() => void captureScreenSnapshot()}
                    title="Capture explicit snapshot to pending files"
                  >
                    Snap Frame
                  </button>
                  <button
                    type="button"
                    className="btn-mini-stop"
                    onClick={stopContinuousScreen}
                    title="Stop screen streaming"
                  >
                    Stop Screen
                  </button>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="visually-hidden"
              accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.py,.js,.jsx,.ts,.tsx,.json,.html,.css,.sql,.yaml,.yml,.csv,.sh,.toml,.xml,.log,.r,.go,.java,.c,.cpp,.h,.hpp,.cs,.php,.rb,.rs,.swift,.kt,.scala,.ipynb,.dockerfile,.ini,.conf"
              multiple
              onChange={uploadSelected}
            />
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={keySubmit}
              placeholder={
                isModelConfigured
                  ? 'Message OmniAssist…'
                  : selectedModel?.byok
                    ? 'Enter Anthropic API key to chat with Claude…'
                    : 'Configure a model in backend/.env to begin'
              }
              disabled={!isModelConfigured || connection !== 'ready'}
            />

            {liveActive && (
              <div className="live-status">
                <div className="live-status-header">
                  <div className="live-indicator-pill">
                    <span className="live-indicator-dot" />
                    <strong>Gemini Live Assistant</strong>
                    <span className="live-status-model">{liveModel?.name || 'gemini-3.8-live'}</span>
                  </div>
                  <div className="live-status-badges">
                    <span className="live-status-badge status-state">
                      {liveStatus === 'Thinking…' ? (
                        <AiThinkingVisual state="thinking" size="sm" minimal />
                      ) : liveStatus.startsWith('Speaking') ? (
                        <AiThinkingVisual state="streaming" size="sm" minimal />
                      ) : (
                        <AudioLines size={13} />
                      )}
                      <span>{liveStatus || 'Connected'}</span>
                    </span>
                    <span className={`live-status-badge ${liveScreen ? 'screen-on' : ''}`}>
                      <MonitorUp size={13} />
                      <span>Screen {liveScreen ? 'Streaming Live' : 'Off'}</span>
                    </span>
                    <span className="live-status-badge">
                      <span>{String(Math.floor(liveDuration / 60)).padStart(2, '0')}:{String(liveDuration % 60).padStart(2, '0')}</span>
                    </span>
                  </div>
                </div>

                {livePreview && (
                  <div className="live-preview-box">
                    <div className="screen-preview-wrapper">
                      <video
                        className="live-preview"
                        autoPlay
                        muted
                        playsInline
                        ref={element => {
                          if (element && element.srcObject !== livePreview) element.srcObject = livePreview
                        }}
                      />
                      <div className="screen-preview-glare" />
                    </div>
                    <div className="live-preview-info">
                      <div className="screen-live-badge">
                        <span className="screen-live-dot" />
                        <span>LIVE SCREEN ACTIVE</span>
                      </div>
                      <p>Gemini continuously sees your screen and provides real-time guidance as you speak.</p>
                    </div>
                  </div>
                )}

                {liveTranscript && <pre className="live-transcript" ref={liveTranscriptRef}>{liveTranscript}</pre>}

                <div className="live-status-actions">
                  {!liveScreen ? (
                    <button type="button" className="btn-live-action primary" onClick={shareLiveScreen}>
                      <MonitorUp size={14} />
                      <span>Share Screen with Gemini</span>
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn-live-action" onClick={() => forceLiveFrameRef.current?.()} title="Send high-priority screen frame">
                        <Camera size={14} />
                        <span>Send Frame Now</span>
                      </button>
                      <button type="button" className="btn-live-action" onClick={stopScreen}>
                        <X size={14} />
                        <span>Stop Screen</span>
                      </button>
                    </>
                  )}
                  {liveMic && (
                    <button type="button" className="btn-live-action" onClick={toggleMicMute}>
                      <AudioLines size={14} />
                      <span>{liveMicMuted ? 'Resume Mic' : 'Mute Mic'}</span>
                    </button>
                  )}
                  <button type="button" className="btn-live-action danger" onClick={stopLive}>
                    <Square size={13} fill="currentColor" />
                    <span>End Live Session</span>
                  </button>
                </div>
              </div>
            )}

            <div className="composer-bottom">
              <div className="model-picker-wrap" ref={modelPickerWrapRef}>
                <button
                  type="button"
                  className={`model-picker ${modelMenu ? 'open' : ''}`}
                  disabled={liveActive}
                  title={liveActive ? 'Gemini Live is active. End the session before changing the model.' : 'Choose the chat model.'}
                  onClick={() => setModelMenu(!modelMenu)}
                >
                  <span className={`provider-dot ${selectedModel?.provider.split(' ')[0].toLowerCase() || ''}`} />
                  <span>{selectedModel?.provider || 'Choose model'}</span>
                  <span className="model-separator">/</span>
                  <strong>{selectedModel?.name || ''}</strong>
                  {selectedModel?.byok && (
                    <span className={`capability-pill ${byokAnthropicKey ? 'byok-active' : 'byok-needed'}`} style={{ marginLeft: 6 }}>
                      {byokAnthropicKey ? '🔑 BYOK' : '🔑 Key Needed'}
                    </span>
                  )}
                  <ChevronDown size={14} />
                </button>
                {modelMenu && (
                  <div className="model-menu">
                    {Object.entries(
                      models.reduce<Record<string, Model[]>>((acc, m) => {
                        acc[m.provider] = acc[m.provider] || []
                        acc[m.provider].push(m)
                        return acc
                      }, {})
                    ).map(([providerName, providerModels]) => (
                      <div key={providerName} className="model-group">
                        <div className="model-group-header">
                          <span className={`provider-dot ${providerName.split(' ')[0].toLowerCase()}`} />
                          <span className="model-group-title">{providerName}</span>
                        </div>
                        <div className="model-group-items">
                          {providerModels.map(m => {
                            const isConfigured = m.byok ? Boolean(byokAnthropicKey || m.configured) : m.configured
                            return (
                              <button
                                type="button"
                                key={m.id}
                                disabled={liveActive}
                                className={`model-option ${m.id === modelId ? 'current' : ''}`}
                                onClick={() => {
                                  if (m.byok && !byokAnthropicKey && !m.configured) {
                                    setByokTempKey('')
                                    setByokModalOpen(true)
                                    setModelId(m.id)
                                    setModelMenu(false)
                                    return
                                  }
                                  setModelId(m.id)
                                  setModelMenu(false)
                                }}
                              >
                                <span className="model-option-copy">
                                  <strong>
                                    <span>{m.name}</span>
                                    {m.free && <span className="capability-pill free">✨ Free</span>}
                                    {m.byok ? (
                                      byokAnthropicKey || m.configured ? (
                                        <span className="capability-pill byok-active">🔑 BYOK Active</span>
                                      ) : (
                                        <span className="capability-pill byok-needed">🔑 BYOK</span>
                                      )
                                    ) : null}
                                    {m.image_input ? (
                                      <span className="capability-pill vision">👁️ Vision</span>
                                    ) : (
                                      <span className="capability-pill text">📝 Text only</span>
                                    )}
                                  </strong>
                                  <small>{m.byok && !isConfigured ? 'Bring Your Own Key required (Anthropic)' : m.description}</small>
                                </span>
                                <span className={`configured-tag ${isConfigured ? 'yes' : ''}`}>
                                  {m.byok
                                    ? isConfigured
                                      ? 'Active Key'
                                      : 'Key Needed'
                                    : isConfigured
                                      ? m.free
                                        ? 'Ready (Free)'
                                        : 'Ready'
                                      : 'Needs API key'}
                                </span>
                                {m.id === modelId && <Check size={15} />}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="composer-tools">
                <button
                  type="button"
                  className="tool-button"
                  disabled={uploading || busy}
                  onClick={() => fileInputRef.current?.click()}
                  title={
                    selectedModel && !selectedModel.image_input
                      ? 'Attach text, PDF, code or document file (Image input disabled for this model)'
                      : 'Attach an image, PDF, text or code file'
                  }
                >
                  <FilePlus2 size={16} />
                  <span>{uploading ? 'Uploading…' : 'Attach'}</span>
                </button>
                <button
                  type="button"
                  className={`tool-button ${webSearch ? 'selected' : ''}`}
                  onClick={() => {
                    if (!isWebSearchReady && !webSearch) {
                      setError('Web search requires a Tavily API key. Add TAVILY_API_KEY to backend/.env or enter it in Settings > API Keys (BYOK).')
                    }
                    setWebSearch(!webSearch)
                  }}
                  title={isWebSearchReady ? "Include current web search results via Tavily" : "Web search requires TAVILY_API_KEY in backend/.env or Settings"}
                >
                  <Search size={15} />
                  <span>Web {webSearch ? 'on' : 'search'}</span>
                </button>
                <button
                  type="button"
                  className={`tool-button ${continuousScreenStream ? 'live-screen-active' : ''}`}
                  disabled={uploading || busy || (!liveActive && !selectedModel?.image_input)}
                  onClick={
                    liveActive
                      ? liveScreen
                        ? () => forceLiveFrameRef.current?.()
                        : shareLiveScreen
                      : continuousScreenStream
                        ? stopContinuousScreen
                        : () => void startContinuousScreen()
                  }
                  title={
                    liveActive
                      ? liveScreen
                        ? 'Send the current live frame now'
                        : 'Share screen with live session'
                      : !selectedModel?.image_input
                        ? 'Selected model does not support image analysis. Switch to a vision model (Gemini, Nemotron, Gemma, Qwen 3.8, or Llama Vision) for screen streaming.'
                        : continuousScreenStream
                          ? 'Stop continuous live screen streaming'
                          : 'Stream screen continuously in real-time (auto-analyzes screen on every prompt)'
                  }
                >
                  <MonitorUp size={16} />
                  <span>
                    {liveActive
                      ? liveScreen
                        ? 'Capture frame'
                        : 'Share screen'
                      : continuousScreenStream
                        ? 'Streaming Screen'
                        : 'Live Screen'}
                  </span>
                </button>
                <button
                  type="button"
                  className="tool-button"
                  disabled={uploading || busy || (!liveActive && !selectedModel?.image_input)}
                  onClick={() => void captureScreenSnapshot()}
                  title={
                    !selectedModel?.image_input
                      ? 'Selected model does not support image analysis. Switch to a vision model to capture snapshots.'
                      : 'Capture a single snapshot frame and attach it'
                  }
                >
                  <Image size={15} />
                  <span>Snapshot</span>
                </button>
                <button
                  type="button"
                  className="tool-button live-tool"
                  onClick={liveActive ? stopLive : () => void startLive()}
                  title="Start a Gemini Live voice session with visual context."
                >
                  <AudioLines size={16} />
                  <span>{liveActive ? 'End live' : 'Gemini Live'}</span>
                </button>
                <button
                  type="button"
                  className="tool-button"
                  disabled={busy || actionBusy || !isModelConfigured}
                  onClick={suggestActionPrompt}
                  title="Ask AI to propose a structured browser action"
                >
                  <Compass size={15} />
                  <span>{actionBusy ? 'Proposing…' : 'Action'}</span>
                </button>
              </div>

              <div className="send-controls">
                <button
                  type="button"
                  className={`voice-button ${voiceListening ? 'listening' : ''}`}
                  disabled={!isModelConfigured || busy}
                  onClick={toggleDictation}
                  title={
                    voiceListening
                      ? 'Listening continuously… Click to finish dictating or press Enter to send'
                      : 'Dictate with voice (continuous speech + voice replies)'
                  }
                >
                  <AudioLines size={17} />
                </button>
                {busy ? (
                  <button
                    type="button"
                    className="send-button stop"
                    onClick={() => {
                      speechSynthesis.cancel()
                      abortRef.current?.abort()
                    }}
                    title="Stop generating"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send-button"
                    disabled={
                      (!input.trim() && pendingFiles.length === 0 && !continuousScreenStream) ||
                      !isModelConfigured ||
                      uploading ||
                      (pendingFiles.some(file => file.mime_type.startsWith('image/')) && !selectedModel?.image_input)
                    }
                    title="Send message"
                  >
                    <ArrowUp size={17} />
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="composer-disclaimer">
            <span>OmniAssist can make mistakes. Check important information.</span>
            <span>
              <label className="speak-toggle">
                <input
                  type="checkbox"
                  checked={speakResponses}
                  onChange={e => {
                    setSpeakResponses(e.target.checked)
                    if (!e.target.checked) speechSynthesis.cancel()
                  }}
                />{' '}
                Read replies aloud
              </label>
              <Command size={12} /> Enter to send <b>·</b> Shift + Enter for a new line
            </span>
          </div>
        </footer>
      </main>

      {/* Settings & Configuration Modal */}
      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setSettingsOpen(false)
          }}
        >
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header>
              <div>
                <span className="eyebrow">WORKSPACE SETTINGS</span>
                <h2 id="settings-title">OmniAssist Control Center</h2>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                <X size={18} />
              </button>
            </header>

            {/* Tab navigation */}
            <div className="settings-tabs">
              <button
                className={`settings-tab ${settingsTab === 'models' ? 'active' : ''}`}
                onClick={() => setSettingsTab('models')}
              >
                Models & Gateway
              </button>
              <button
                className={`settings-tab ${settingsTab === 'byok' ? 'active' : ''}`}
                onClick={() => {
                  setByokTempKey(byokAnthropicKey)
                  setSettingsTab('byok')
                }}
              >
                API Keys (BYOK)
              </button>
              <button
                className={`settings-tab ${settingsTab === 'usage' ? 'active' : ''}`}
                onClick={() => setSettingsTab('usage')}
              >
                Usage & Limits
              </button>
              <button
                className={`settings-tab ${settingsTab === 'memory' ? 'active' : ''}`}
                onClick={() => setSettingsTab('memory')}
              >
                Memory
              </button>
              <button
                className={`settings-tab ${settingsTab === 'actions' ? 'active' : ''}`}
                onClick={() => {
                  setSettingsTab('actions')
                  void loadActions()
                  void loadActivity()
                }}
              >
                Actions & Activity
              </button>
              <button
                className={`settings-tab ${settingsTab === 'extension' ? 'active' : ''}`}
                onClick={() => setSettingsTab('extension')}
              >
                Chrome Extension
              </button>
              <button
                className={`settings-tab ${settingsTab === 'privacy' ? 'active' : ''}`}
                onClick={() => setSettingsTab('privacy')}
              >
                Privacy & Data
              </button>
            </div>

            {/* Tab 1: Models */}
            {settingsTab === 'models' && (
              <div>
                <p className="settings-intro">
                  Provider credentials stay secure on the FastAPI backend. Set keys and capability flags in <code>backend/.env</code>.
                </p>
                <div className="settings-models">
                  {models.map(m => (
                    <div className="settings-model" key={m.id}>
                      <span className={`provider-dot ${m.provider.split(' ')[0].toLowerCase()}`} />
                      <div>
                        <strong>{m.provider}</strong>
                        <small>
                          {m.name} · Text, {m.document_input ? 'documents/PDFs' : 'no documents'},{' '}
                          {m.image_input ? 'images' : 'no images'}
                        </small>
                      </div>
                      <span className={`settings-status ${m.configured ? 'online' : ''}`}>
                        {m.configured ? 'Configured' : 'Needs API key'}
                      </span>
                    </div>
                  ))}
                  {liveModel && (
                    <div className="settings-model">
                      <span className="provider-dot google" />
                      <div>
                        <strong>{liveModel.provider}</strong>
                        <small>{liveModel.name} · Native realtime audio & sampled video observations</small>
                      </div>
                      <span className={`settings-status ${liveModel.configured ? 'online' : ''}`}>
                        {liveModel.configured ? 'Configured' : 'Needs API key'}
                      </span>
                    </div>
                  )}
                  <div className="settings-model">
                    <span className="provider-dot tavily" />
                    <div>
                      <strong>Tavily Search</strong>
                      <small>Live web retrieval & citations grounding</small>
                    </div>
                    <span className={`settings-status ${isWebSearchReady ? 'online' : ''}`}>
                      {isWebSearchReady ? 'Configured' : 'Needs API key'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: BYOK */}
            {settingsTab === 'byok' && (
              <div>
                <p className="settings-intro">
                  Bring Your Own Key (BYOK) lets you provide your personal API keys directly from your browser. Keys are stored locally on your device and sent only with relevant requests.
                </p>

                {/* Claude BYOK Card */}
                <div className="byok-card">
                  <div className="byok-header">
                    <div>
                      <strong>Anthropic Claude 3.5 Sonnet</strong>
                      <span className={`capability-pill ${byokAnthropicKey ? 'byok-active' : 'byok-needed'}`} style={{ marginLeft: 8 }}>
                        {byokAnthropicKey ? '🔑 Active' : '🔑 Key Needed'}
                      </span>
                    </div>
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="byok-link"
                    >
                      Get Anthropic API Key ↗
                    </a>
                  </div>
                  <div className="byok-input-row">
                    <input
                      type={byokShowKey ? 'text' : 'password'}
                      value={byokTempKey}
                      onChange={e => setByokTempKey(e.target.value)}
                      placeholder={byokAnthropicKey ? '••••••••••••••••••••••••••••••••' : 'sk-ant-api03-...'}
                    />
                    <button
                      type="button"
                      className="btn-byok-toggle"
                      onClick={() => setByokShowKey(!byokShowKey)}
                      title={byokShowKey ? 'Hide key' : 'Show key'}
                    >
                      {byokShowKey ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="btn-byok-save"
                      onClick={() => {
                        const trimmed = byokTempKey.trim()
                        if (trimmed) {
                          localStorage.setItem('omniassist.byok.anthropic', trimmed)
                          setByokAnthropicKey(trimmed)
                        }
                      }}
                    >
                      Save Key
                    </button>
                    {byokAnthropicKey && (
                      <button
                        type="button"
                        className="btn-byok-clear"
                        onClick={() => {
                          localStorage.removeItem('omniassist.byok.anthropic')
                          setByokAnthropicKey('')
                          setByokTempKey('')
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {byokAnthropicKey && (
                    <small style={{ color: 'var(--accent)', marginTop: 8, display: 'inline-block' }}>
                      ✓ Your Anthropic API key is saved and ready to use.
                    </small>
                  )}
                </div>

                {/* Tavily BYOK Card */}
                <div className="byok-card">
                  <div className="byok-header">
                    <div>
                      <strong>Tavily Web Search</strong>
                      <span className={`capability-pill ${isWebSearchReady ? 'byok-active' : 'byok-needed'}`} style={{ marginLeft: 8 }}>
                        {webSearchConfigured ? '🔑 Active (from .env)' : byokTavilyKey ? '🔑 Active (User Key)' : '🔑 Key Needed'}
                      </span>
                    </div>
                    <a
                      href="https://tavily.com"
                      target="_blank"
                      rel="noreferrer"
                      className="byok-link"
                    >
                      Get Free Tavily Key (1,000 req/mo) ↗
                    </a>
                  </div>
                  <div className="byok-input-row">
                    <input
                      type={byokShowTavilyKey ? 'text' : 'password'}
                      value={byokTempTavilyKey}
                      onChange={e => setByokTempTavilyKey(e.target.value)}
                      placeholder={byokTavilyKey ? '••••••••••••••••••••••••••••••••' : webSearchConfigured ? 'Configured in backend/.env' : 'tvly-...'}
                    />
                    <button
                      type="button"
                      className="btn-byok-toggle"
                      onClick={() => setByokShowTavilyKey(!byokShowTavilyKey)}
                      title={byokShowTavilyKey ? 'Hide key' : 'Show key'}
                    >
                      {byokShowTavilyKey ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="btn-byok-save"
                      onClick={() => {
                        const trimmed = byokTempTavilyKey.trim()
                        if (trimmed) {
                          localStorage.setItem('omniassist.byok.tavily', trimmed)
                          setByokTavilyKey(trimmed)
                          setByokTempTavilyKey('')
                        }
                      }}
                    >
                      Save Key
                    </button>
                    {byokTavilyKey && (
                      <button
                        type="button"
                        className="btn-byok-clear"
                        onClick={() => {
                          localStorage.removeItem('omniassist.byok.tavily')
                          setByokTavilyKey('')
                          setByokTempTavilyKey('')
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {isWebSearchReady && (
                    <small style={{ color: 'var(--accent)', marginTop: 8, display: 'inline-block' }}>
                      ✓ Tavily search is active and ready for live web retrieval.
                    </small>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Usage */}
            {settingsTab === 'usage' && (
              <div>
                <h3>Usage today (UTC)</h3>
                <p>
                  {usage
                    ? `${usage.provider_requests} provider requests${usage.daily_limit ? ` of ${usage.daily_limit} max daily limit` : ''} · ${usage.input_tokens.toLocaleString()} input / ${usage.output_tokens.toLocaleString()} output tokens · ${usage.estimated_cost_usd === null ? 'Pricing rates not configured' : `~$${usage.estimated_cost_usd.toFixed(6)}${usage.cost_estimate_complete ? '' : ' (partial)'}`}`
                    : 'Usage metrics unavailable'}
                </p>
                {usage?.unpriced_calls ? (
                  <small className="settings-status">{usage.unpriced_calls} calls have incomplete metering.</small>
                ) : null}
              </div>
            )}

            {/* Tab 3: Memory */}
            {settingsTab === 'memory' && (
              <div>
                <h3>Saved memory & preferences</h3>
                <label className="memory-toggle">
                  <input
                    type="checkbox"
                    checked={memoryEnabled}
                    onChange={async e => {
                      const enabled = e.target.checked
                      setMemoryEnabled(enabled)
                      await request('/api/memories/settings', { method: 'PATCH', body: JSON.stringify({ enabled }) })
                    }}
                  />{' '}
                  Use these preferences in future conversations
                </label>
                <form
                  className="memory-add"
                  onSubmit={async e => {
                    e.preventDefault()
                    if (!memoryDraft.trim()) return
                    const memory = await request<{ id: string; content: string }>('/api/memories', {
                      method: 'POST',
                      body: JSON.stringify({ content: memoryDraft.trim() })
                    })
                    setMemories([memory, ...memories])
                    setMemoryDraft('')
                    setMemoryEnabled(true)
                  }}
                >
                  <input
                    value={memoryDraft}
                    onChange={e => setMemoryDraft(e.target.value)}
                    placeholder="Add a preference you want OmniAssist to remember"
                  />
                  <button>Add</button>
                </form>
                {memories.map(memory => (
                  <div className="memory-row" key={memory.id}>
                    {editingMemoryId === memory.id ? (
                      <input
                        aria-label="Edit saved memory"
                        value={editingMemoryDraft}
                        onChange={e => setEditingMemoryDraft(e.target.value)}
                      />
                    ) : (
                      <span>{memory.content}</span>
                    )}
                    {editingMemoryId === memory.id ? (
                      <>
                        <button
                          disabled={!editingMemoryDraft.trim()}
                          onClick={async () => {
                            const edited = await request<{ id: string; content: string }>(`/api/memories/${memory.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ content: editingMemoryDraft.trim() })
                            })
                            setMemories(memories.map(item => (item.id === edited.id ? { ...item, content: edited.content } : item)))
                            setEditingMemoryId(null)
                            setEditingMemoryDraft('')
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingMemoryId(null)
                            setEditingMemoryDraft('')
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingMemoryId(memory.id)
                            setEditingMemoryDraft(memory.content)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            await request(`/api/memories/${memory.id}`, { method: 'DELETE' })
                            setMemories(memories.filter(item => item.id !== memory.id))
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Tab 4: Actions & Activity */}
            {settingsTab === 'actions' && (
              <div>
                <h3>Browser Actions for Current Conversation</h3>
                {actions.length === 0 ? (
                  <p style={{ color: 'var(--subtle)', fontSize: '11px' }}>No browser actions proposed yet for this conversation.</p>
                ) : (
                  actions.map(action => (
                    <div className="action-card" key={action.id}>
                      <div className="action-card-header">
                        <span className="action-type-badge">{action.action_type}</span>
                        <span className={`action-status-badge ${action.status}`}>{action.status}</span>
                      </div>
                      <div className="action-payload-text">{JSON.stringify(action.payload)}</div>
                      <div className="action-buttons-row">
                        {action.status === 'pending' && (
                          <>
                            <button className="action-btn approve" onClick={() => approveAction(action.id)}>
                              Approve
                            </button>
                            <button className="action-btn reject" onClick={() => rejectAction(action.id)}>
                              Reject
                            </button>
                          </>
                        )}
                        {action.status === 'approved' && (
                          <button className="action-btn execute" onClick={() => executeWebAction(action)}>
                            Execute in browser
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}

                <h3 style={{ marginTop: '18px' }}>Recent Activity Timeline</h3>
                {activities.length === 0 ? (
                  <p style={{ color: 'var(--subtle)', fontSize: '11px' }}>No activity events recorded yet.</p>
                ) : (
                  <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                    {activities.slice(0, 25).map(act => (
                      <div className="activity-item" key={act.id}>
                        <span className="activity-badge">{act.event_type.replace(/_/g, ' ')}</span>
                        <div className="activity-meta">
                          {act.conversation_id ? `Conv: ${act.conversation_id.slice(0, 8)}… ` : ''}
                          {Object.keys(act.detail).length > 0 ? JSON.stringify(act.detail) : ''}
                        </div>
                        <span className="activity-time">{new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 5: Chrome Extension */}
            {settingsTab === 'extension' && (
              <div>
                <h3>OmniAssist Chrome Extension Companion</h3>
                <p className="settings-intro">
                  The Chrome side panel companion connects directly to this workspace to extract webpage context, explain selected text,
                  capture tab frames, and execute approved browser actions.
                </p>
                <div className="extension-card">
                  <h4>How to install in Chrome:</h4>
                  <ol>
                    <li>
                      Open <code>chrome://extensions</code> in Google Chrome.
                    </li>
                    <li>Toggle on <strong>Developer mode</strong> in the top-right corner.</li>
                    <li>
                      Click <strong>Load unpacked</strong> and select the directory:
                      <br />
                      <code>c:\Projects\OmniAssist\apps\extension</code>
                    </li>
                    <li>
                      Click the OmniAssist icon on your Chrome toolbar to open the side panel beside any tab!
                    </li>
                  </ol>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="action-btn approve"
                    onClick={() => {
                      navigator.clipboard.writeText('http://localhost:8000')
                      alert('Copied backend URL (http://localhost:8000) to clipboard!')
                    }}
                  >
                    Copy Backend URL
                  </button>
                </div>
              </div>
            )}

            {/* Tab 6: Privacy */}
            {settingsTab === 'privacy' && (
              <div>
                <h3>Privacy and data controls</h3>
                <p>Delete stored conversations, uploads, and memories for this account.</p>
                <div className="settings-footer">
                  <button
                    onClick={async () => {
                      if (!window.confirm('Delete every conversation, upload, and saved memory in this workspace?')) return
                      try {
                        await request('/api/workspace', { method: 'DELETE' })
                        setActive(null)
                        setMessages([])
                        setPendingFiles([])
                        setMemories([])
                        setActions([])
                        await loadConversations()
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Could not clear the workspace.')
                      }
                    }}
                  >
                    Clear workspace
                  </button>
                </div>
                <form
                  className="memory-add"
                  style={{ marginTop: '16px' }}
                  onSubmit={async event => {
                    event.preventDefault()
                    if (!deletePassword || !window.confirm('Permanently delete this account and all stored OmniAssist data?')) return
                    try {
                      await request('/api/auth/account', {
                        method: 'DELETE',
                        body: JSON.stringify({ password: deletePassword })
                      })
                      setDeletePassword('')
                      signOut()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not delete the account.')
                    }
                  }}
                >
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={e => setDeletePassword(e.target.value)}
                    placeholder="Confirm password to delete account"
                    autoComplete="current-password"
                  />
                  <button>Delete account</button>
                </form>
              </div>
            )}

            <div className="settings-footer" style={{ marginTop: '18px' }}>
              <span>API keys and uploaded files remain server-side.</span>
              <button
                onClick={async () => {
                  try {
                    const catalog = await request<{ models: Model[]; default_model: string; live_model: LiveModel; web_search_configured?: boolean }>('/api/models')
                    setModels(catalog.models)
                    setLiveModel(catalog.live_model)
                    if (catalog.web_search_configured !== undefined) {
                      setWebSearchConfigured(Boolean(catalog.web_search_configured))
                    }
                    if (!modelId || !catalog.models.some(m => m.id === modelId)) setModelId(catalog.default_model)
                    setConnection('ready')
                  } catch {
                    setConnection('offline')
                  }
                }}
              >
                Refresh status
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Anthropic Claude BYOK Modal */}
      {byokModalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setByokModalOpen(false)
          }}
        >
          <section className="byok-modal" role="dialog" aria-modal="true" aria-labelledby="byok-modal-title">
            <header>
              <div>
                <span className="eyebrow">BRING YOUR OWN KEY</span>
                <h3 id="byok-modal-title">Anthropic Claude Access</h3>
              </div>
              <button className="icon-button" onClick={() => setByokModalOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <div className="byok-modal-body">
              <p>
                Unlike Gemini and Groq, Anthropic does not provide a free tier API. To chat with Claude 3.5 Sonnet, please provide your personal Anthropic API key.
              </p>
              <div className="byok-info-pill">
                🔒 <strong>Privacy First:</strong> Your key is stored strictly in your browser&apos;s local storage and passed securely with your Claude prompts. Other models (Gemini, Groq) remain free default options.
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="byok-input-label">
                  Anthropic API Key (sk-ant-...)
                  <div className="byok-input-group">
                    <input
                      type={byokShowKey ? 'text' : 'password'}
                      value={byokTempKey}
                      onChange={e => setByokTempKey(e.target.value)}
                      placeholder="sk-ant-api03-..."
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn-byok-toggle"
                      onClick={() => setByokShowKey(!byokShowKey)}
                    >
                      {byokShowKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
              </div>

              <div style={{ marginTop: 12 }}>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="byok-help-link"
                >
                  Don&apos;t have an Anthropic key? Create one in Anthropic Console ↗
                </a>
              </div>

              <div className="byok-modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setByokModalOpen(false)}
                >
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  {byokAnthropicKey && (
                    <button
                      type="button"
                      className="btn-byok-clear"
                      onClick={() => {
                        localStorage.removeItem('omniassist.byok.anthropic')
                        setByokAnthropicKey('')
                        setByokTempKey('')
                        setByokModalOpen(false)
                      }}
                    >
                      Remove Key
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!byokTempKey.trim() && !byokAnthropicKey}
                    onClick={() => {
                      const trimmed = byokTempKey.trim()
                      if (trimmed) {
                        localStorage.setItem('omniassist.byok.anthropic', trimmed)
                        setByokAnthropicKey(trimmed)
                      }
                      setByokModalOpen(false)
                    }}
                  >
                    Save & Enable Claude
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
