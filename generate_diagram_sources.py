"""
Script to generate all PlantUML and Mermaid diagram source files for the OmniAssist academic project report.
"""
import os
from pathlib import Path

DIAGRAMS_DIR = Path("documentation/final_report/diagrams")
DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)

# 1. System Architecture
PUML_3_1 = """@startuml
skinparam backgroundColor #FFFFFF
skinparam componentStyle uml2
skinparam packageBackgroundColor #F8F9FA
skinparam packageBorderColor #333333

title OmniAssist - 5-Tier System Architecture

package "Presentation & Client Tier" {
    [React 18 / TypeScript Web Client] as WebClient
    [Manifest V3 Chrome Extension Sidepanel] as ExtensionClient
    [Offscreen Audio & Media Document] as OffscreenDoc
}

package "API Gateway & Security Tier" {
    [FastAPI Application Server] as Gateway
    [PBKDF2 / JWT Bearer Authenticator] as AuthEngine
    [Sliding-Window Rate Limiter] as RateLimiter
    [File Validator & Sanitizer] as FileValidator
}

package "Real-Time Streaming & Relay Tier" {
    [WebSocket /api/live Relay] as WSRelay
    [Luminance Difference Filter (32x18)] as DiffFilter
    [Audio PCM Chunk Buffer] as AudioBuffer
    [Conversation Compactor] as Compactor
}

package "AI Orchestration & Retrieval Tier" {
    [Multi-Model Dispatcher & Registry] as Dispatcher
    [Blake2s Hashed-Vector RAG Engine] as RAGEngine
    [Tavily Sourced Web Search Agent] as SearchAgent
    [Model Adapters (Gemini, Claude, Groq, NVIDIA, OpenAI)] as Adapters
}

package "Persistence & Model Provider Tier" {
    database "SQLite Storage (Conversations, Messages, Files, Usage)" as SQLiteDB
    folder "Encrypted Upload Storage" as UploadDir
    cloud "Google Gemini 2.0 / Live API" as GeminiAPI
    cloud "NVIDIA NIM / OpenRouter (Nemotron)" as NvidiaAPI
    cloud "Anthropic Claude 3.5 (BYOK)" as ClaudeAPI
    cloud "Groq LPU (Llama 3.3 / Qwen)" as GroqAPI
}

WebClient --> Gateway : REST / NDJSON / WS
ExtensionClient --> Gateway : Authenticated REST / WS
ExtensionClient --> OffscreenDoc : Tab Media Stream
Gateway --> AuthEngine : Validate Session
Gateway --> RateLimiter : Check Daily Limits
Gateway --> FileValidator : Upload Validation
Gateway --> WSRelay : WS Live Upstream
WSRelay --> DiffFilter : Screen Video Track
WSRelay --> AudioBuffer : Mic Audio Track
DiffFilter --> GeminiAPI : Adaptive Live Screen (1 FPS)
AudioBuffer --> GeminiAPI : Bidirectional Audio PCM
Gateway --> Dispatcher : Stream Chat Request
Dispatcher --> RAGEngine : Query Local Knowledge
RAGEngine --> SQLiteDB : Cosine Match on Hashed Buckets
Dispatcher --> SearchAgent : Sourced Web Lookup
Dispatcher --> Adapters : Dynamic Routing
Adapters --> GeminiAPI : REST / SSE Stream
Adapters --> NvidiaAPI : Fast Vision / Failover Stream
Adapters --> ClaudeAPI : BYOK Header Injection
Adapters --> GroqAPI : Ultra-low Latency Inference
Gateway --> SQLiteDB : Transactions & WAL
Gateway --> UploadDir : Sandboxed Storage
@enduml
"""

MMD_3_1 = """flowchart TD
    subgraph PresentationTier ["1. Presentation & Client Tier"]
        WebClient["React 18 / TS Web Workspace"]
        ExtClient["Chrome MV3 Sidepanel Companion"]
        OffscreenMedia["Offscreen Media Processor"]
    end

    subgraph GatewayTier ["2. API Gateway & Security Tier"]
        FastAPIServer["FastAPI Gateway (/api)"]
        AuthService["PBKDF2 & JWT Auth"]
        RateThrottler["Sliding-Window Rate Limiter"]
        FileInspector["File Validator & Image Sanitizer"]
    end

    subgraph StreamingTier ["3. Real-Time Streaming & Relay Tier"]
        WSRelay["WebSocket Relay (/api/live)"]
        FrameSampler["Luminance Diff Filter (32x18)"]
        AudioStreamer["PCM Audio Chunk Streamer"]
    end

    subgraph OrchestrationTier ["4. AI Orchestration & Retrieval Tier"]
        ModelRegistry["Provider Gateway & Fallback Registry"]
        RAGEngine["Blake2s Hashed Vector RAG (4096 Buckets)"]
        WebSearchService["Tavily Sourced Web Search"]
    end

    subgraph ProviderStorageTier ["5. Storage & Remote Providers"]
        SQLiteDB[("SQLite Database (WAL Mode)")]
        UploadStore[("Private Upload Storage")]
        GeminiCloud["Google Gemini Live & Multimodal"]
        NvidiaCloud["NVIDIA NIM Nemotron 3.5 VL"]
        GroqCloud["Groq LPU (Llama 3.3 / Qwen)"]
        ClaudeCloud["Anthropic Claude 3.5 (BYOK)"]
    end

    WebClient -->|REST, NDJSON, WS| FastAPIServer
    ExtClient -->|Tab Stream, REST| FastAPIServer
    ExtClient --> OffscreenMedia
    FastAPIServer --> AuthService
    FastAPIServer --> RateThrottler
    FastAPIServer --> FileInspector
    FastAPIServer --> WSRelay
    WSRelay --> FrameSampler
    WSRelay --> AudioStreamer
    FrameSampler -->|1 FPS JPEGs| GeminiCloud
    AudioStreamer -->|Bi-directional PCM| GeminiCloud
    FastAPIServer --> ModelRegistry
    ModelRegistry --> RAGEngine
    RAGEngine --> SQLiteDB
    ModelRegistry --> WebSearchService
    ModelRegistry -->|Adaptive Failover| NvidiaCloud
    ModelRegistry --> GroqCloud
    ModelRegistry --> ClaudeCloud
    ModelRegistry --> GeminiCloud
    FastAPIServer --> SQLiteDB
    FastAPIServer --> UploadStore
"""

# 2. DFD Level 0
PUML_DFD0 = """@startuml
skinparam backgroundColor #FFFFFF
title OmniAssist - Data Flow Diagram (Level 0: Context Level)

actor "End User (Web / Extension)" as User
rectangle "0.0\\nOmniAssist Multimodal System" as System
cloud "External AI Providers\\n(Gemini, NVIDIA, Groq, Claude)" as Providers
cloud "Tavily Web Search" as SearchEngine

User -> System : User Prompts, Screen Stream, Audio PCM, Documents
System -> User : Streaming Text, Audio Responses, Visual Analysis, Action Timeline

System -> Providers : Multimodal Context, Vision Frames, Audio Chunks, BYOK Keys
Providers -> System : Streamed Tokens, Token Usage Metadata, Live Audio Output

System -> SearchEngine : Real-Time Query Terms
SearchEngine -> System : Search Snippets & Source URLs
@enduml
"""

MMD_DFD0 = """flowchart LR
    User["End User (Web / Extension)"]
    System(("0.0 OmniAssist Multimodal System"))
    AIProviders["External AI Model Providers\n(Gemini, NVIDIA NIM, Groq, Claude)"]
    Tavily["Tavily Search Engine"]

    User -->|Prompts, Screen Stream, Audio PCM, Documents| System
    System -->|Streaming Responses, Live Audio, Action Cards| User
    System -->|Vision Frames, Audio Chunks, Formatted Context| AIProviders
    AIProviders -->|NDJSON Tokens, Audio Chunks, Usage Metrics| System
    System -->|Search Queries| Tavily
    Tavily -->|Citations & URLs| System
"""

# 3. DFD Level 1
PUML_DFD1 = """@startuml
skinparam backgroundColor #FFFFFF
title OmniAssist - Data Flow Diagram (Level 1: Internal Processes)

actor "End User" as User
cloud "AI Providers" as Providers
database "SQLite Data Store" as DB
folder "Upload Storage" as FS

rectangle "1.0\\nAuthentication & Session Management" as P1
rectangle "2.0\\nMedia & Screen Stream Ingestion" as P2
rectangle "3.0\\nDocument Processing & Vector RAG" as P3
rectangle "4.0\\nAI Gateway & Multi-Model Orchestration" as P4
rectangle "5.0\\nUsage Metering & Action Dispatcher" as P5

User --> P1 : Login / Register / Token
P1 --> DB : Validate / Store User Record
P1 --> User : JWT Bearer Token

User --> P2 : DisplayMedia & Microphone Audio
P2 --> P4 : Filtered Video Frames (1 FPS) & Audio PCM
P2 <--> Providers : Bidirectional Live WebSocket

User --> P3 : Upload Document (PDF / Code / Image)
P3 --> FS : Store Binary File
P3 --> DB : Store Metadata & Text Chunks
P3 --> P4 : Retrieve Relevant Lexical Context

User --> P4 : Prompt / Conversation Context
P4 --> DB : Query Conversation History
P4 --> Providers : Dispatched Prompt & Context
Providers --> P4 : Token Stream & Metadata
P4 --> User : NDJSON Stream

P4 --> P5 : Record Token Count & Actions
P5 --> DB : Log Usage Events & Action Status
P5 --> User : Timeline & Usage Dashboard
@enduml
"""

MMD_DFD1 = """flowchart TD
    User["End User"]
    AI["AI Model Providers"]
    DB[("SQLite Storage")]
    Storage[("File Storage")]

    P1("1.0 Authentication & Rate Limiting")
    P2("2.0 Media Capture & Adaptive Sampling")
    P3("3.0 Document Ingestion & Blake2s RAG")
    P4("4.0 AI Gateway & Streaming Orchestration")
    P5("5.0 Usage Tracking & Action Pipeline")

    User -->|Credentials| P1
    P1 -->|Store / Check Users| DB
    P1 -->|JWT Token| User

    User -->|Screen Capture & Audio| P2
    P2 -->|Luminance Filtered Frames| P4
    P2 <-->|Live WS Protocol| AI

    User -->|PDF, Images, Code| P3
    P3 -->|Save Binary| Storage
    P3 -->|Chunks & Vectors| DB
    P3 -->|Retrieved Chunks| P4

    User -->|Chat Queries| P4
    P4 -->|Context History| DB
    P4 -->|Dispatched Request| AI
    AI -->|Token Stream & Usage| P4
    P4 -->|NDJSON Response| User

    P4 -->|Token Event| P5
    P5 -->|Daily Aggregates| DB
    P5 -->|Action Cards| User
"""

# Modules 1 to 5 Diagrams
MODULES = {
    "module1": {
        "title": "Module 1: User Interface and Interaction Module",
        "usecase": """@startuml
skinparam backgroundColor #FFFFFF
left to right direction
actor "End User" as User
rectangle "Module 1: UI & Interaction" {
    usecase "Authenticate (Login / Register)" as UC1
    usecase "Manage Conversations (CRUD, Search, Rename)" as UC2
    usecase "Compose Multimodal Prompt" as UC3
    usecase "Select AI Model & BYOK Keys" as UC4
    usecase "Toggle Web Search / Live Dictation" as UC5
    usecase "Interact via Side Panel Extension" as UC6
    usecase "Inspect & Approve Proposed Actions" as UC7
}
User --> UC1
User --> UC2
User --> UC3
User --> UC4
User --> UC5
User --> UC6
User --> UC7
@enduml""",
        "class": """@startuml
skinparam backgroundColor #FFFFFF
class WorkspaceState {
    + activeConversationId: string
    + models: Model[]
    + selectedModelId: string
    + isStreaming: boolean
    + webSearchEnabled: boolean
    + attachments: UploadedFile[]
    + selectConversation(id: string): void
    + sendMessage(text: string): Promise<void>
    + stopGeneration(): void
}
class ChatComposer {
    + inputContent: string
    + isRecording: boolean
    + handleFileUpload(file: File): void
    + triggerDictation(): void
    + openModelMenu(): void
}
class SidepanelCompanion {
    + activeTabId: number
    + pageContent: string
    + captureTabScreenshot(): Promise<Blob>
    + explainSelection(): void
    + startTabLiveSession(): void
}
class ActionCard {
    + actionId: string
    + actionType: string
    + payload: object
    + status: string
    + handleApprove(): void
    + handleReject(): void
}
WorkspaceState *-- ChatComposer
WorkspaceState *-- ActionCard
SidepanelCompanion ..> WorkspaceState : Synchronizes via API
@enduml""",
        "sequence": """@startuml
skinparam backgroundColor #FFFFFF
actor User
participant "ChatComposer" as UI
participant "WorkspaceState" as State
participant "FastAPI Gateway" as API
participant "Model Adapter" as Adapter

User -> UI : Enter prompt & click Send
UI -> State : sendMessage(content, attachments)
State -> API : POST /api/chat/stream (NDJSON)
activate API
API -> Adapter : Stream completion
activate Adapter
Adapter --> API : Yield chunk
API --> State : Transfer NDJSON token chunk
State --> UI : Progressively render markdown
Adapter --> API : Complete + usage metadata
deactivate Adapter
API --> State : Close stream
deactivate API
State --> UI : Finalize assistant bubble & update word wrap
@enduml"""
    },
    "module2": {
        "title": "Module 2: Real-Time Voice and Screen Processing Module",
        "usecase": """@startuml
skinparam backgroundColor #FFFFFF
left to right direction
actor "User" as User
rectangle "Module 2: Real-Time Voice & Screen Processing" {
    usecase "Initiate Screen Sharing (getDisplayMedia)" as UC1
    usecase "Stream PCM Audio from Microphone" as UC2
    usecase "Compute Luminance Difference (32x18 Grid)" as UC3
    usecase "Adaptive Frame Throttling (1 FPS Max)" as UC4
    usecase "Gemini Live WebSocket Bidirectional Relay" as UC5
    usecase "Offscreen Audio Synthesis & Playback" as UC6
}
User --> UC1
User --> UC2
UC1 ..> UC3 : include
UC3 ..> UC4 : include
UC4 --> UC5
UC2 --> UC5
UC5 --> UC6
UC6 --> User : Spoken Response
@enduml""",
        "class": """@startuml
skinparam backgroundColor #FFFFFF
class ScreenCaptureController {
    + mediaStream: MediaStream
    + canvas: HTMLCanvasElement
    + isCapturing: boolean
    + lastLuminanceGrid: number[][]
    + startCapture(): Promise<void>
    + sampleFrame(): Blob
    + computeDiff(currentGrid: number[][]): number
    + stopCapture(): void
}
class AudioStreamController {
    + audioContext: AudioContext
    + processorNode: ScriptProcessorNode
    + isMuted: boolean
    + startMic(): Promise<void>
    + encodePCM16(buffer: Float32Array): ArrayBuffer
    + muteMic(muted: boolean): void
}
class LiveWebSocketClient {
    + socket: WebSocket
    + sessionId: string
    + connect(token: string): void
    + sendRealtimeInput(mediaChunk: object): void
    + handleServerEvent(event: MessageEvent): void
}
class OffscreenMediaHost {
    + targetStreamId: string
    + captureStream(): void
    + routeAudioToContext(): void
}
ScreenCaptureController --> LiveWebSocketClient : Dispatches Sampled JPEG
AudioStreamController --> LiveWebSocketClient : Dispatches PCM16 Audio
OffscreenMediaHost ..> ScreenCaptureController : Bridges Chrome tabCapture
@enduml""",
        "sequence": """@startuml
skinparam backgroundColor #FFFFFF
actor User
participant "ScreenCaptureController" as Screen
participant "AudioStreamController" as Audio
participant "LiveWebSocketClient" as WS
participant "FastAPI Relay (/api/live)" as Relay
participant "Google Gemini Live" as Gemini

User -> Screen : Click "Live Screen" & Grant Permission
User -> Audio : Enable Microphone
Screen -> WS : Initialize WebSocket connection
WS -> Relay : Connect with Bearer Token
Relay -> Gemini : Establish Bidi WebSocket session
loop Every 1000ms
    Screen -> Screen : Capture Frame & Downscale to 32x18
    alt Luminance Delta > Threshold or 15s Timeout
        Screen -> WS : Send Resized JPEG (Base64)
        WS -> Relay : realtime_input(media_chunks: image/jpeg)
        Relay -> Gemini : Forward Realtime Frame
    else Frame Unchanged
        Screen -> Screen : Suppress Frame
    end
    Audio -> WS : Send PCM16 Audio Slice
    WS -> Relay : realtime_input(media_chunks: audio/pcm)
    Relay -> Gemini : Forward Audio Slice
end
Gemini --> Relay : Stream Audio Response & Transcript
Relay --> WS : Forward Audio & Transcript
WS --> User : Play Audio via AudioContext & Render Subtitles
@enduml"""
    },
    "module3": {
        "title": "Module 3: AI Processing and Multi-Model Orchestration Module",
        "usecase": """@startuml
skinparam backgroundColor #FFFFFF
left to right direction
actor "Client Layer" as Client
rectangle "Module 3: AI Orchestration & Multi-Model Gateway" {
    usecase "Inspect Model Registry & Capabilities" as UC1
    usecase "Stream Completion Request" as UC2
    usecase "BYOK Header Injection (Anthropic Claude)" as UC3
    usecase "Automatic Quota Failover (OpenAI -> NVIDIA NIM)" as UC4
    usecase "Token Usage Extraction & Ledger Logging" as UC5
    usecase "Integrate Tavily Sourced Search" as UC6
}
Client --> UC1
Client --> UC2
UC2 ..> UC3 : conditional
UC2 ..> UC4 : on 429/quota error
UC2 ..> UC5 : on complete
UC2 ..> UC6 : if enabled
@enduml""",
        "class": """@startuml
skinparam backgroundColor #FFFFFF
class ModelRegistry {
    + models: List<Model>
    + getModel(modelId: string): Model
    + listConfiguredModels(): List<ModelPublic>
}
class Model {
    + id: string
    + provider: string
    + rawModelId: string
    + capabilities: tuple
    + key: string
    + imageInput: boolean
    + byok: boolean
    + free: boolean
}
class StreamingGateway {
    + streamCompletion(model: Model, messages: list): AsyncIterator
    + executeFallback(originalModel: Model, messages: list): AsyncIterator
}
class OpenAICompatibleAdapter {
    + stream(baseUrl: string, model: string, key: string, messages: list): AsyncIterator
}
class GeminiAdapter {
    + stream(model: string, key: string, messages: list): AsyncIterator
}
class AnthropicAdapter {
    + stream(model: string, key: string, messages: list): AsyncIterator
}
ModelRegistry *-- Model
StreamingGateway --> ModelRegistry
StreamingGateway --> OpenAICompatibleAdapter
StreamingGateway --> GeminiAdapter
StreamingGateway --> AnthropicAdapter
@enduml""",
        "sequence": """@startuml
skinparam backgroundColor #FFFFFF
participant "FastAPI Main" as Main
participant "StreamingGateway" as Gateway
participant "OpenAI Adapter" as OpenAI
participant "NVIDIA NIM Adapter" as Nvidia
participant "UsageMeter" as Meter

Main -> Gateway : streamCompletion(model='openai:gpt-4o-mini', messages)
Gateway -> OpenAI : Send Request
alt Quota Exceeded (429 / Insufficient Credit)
    OpenAI --> Gateway : Error (429 Rate Limit / $0 balance)
    Gateway -> Gateway : Identify Healthy Fallback ('nvidia:nemotron-3.5-super-vl')
    Gateway --> Main : Yield Notice: "(Auto-routed to Nemotron 3.5 VL)"
    Gateway -> Nvidia : Stream Completion
    activate Nvidia
    loop Stream Chunks
        Nvidia --> Gateway : Token Chunk
        Gateway --> Main : Yield Chunk
    end
    Nvidia --> Gateway : Finish + Token Metadata
    deactivate Nvidia
else Successful Generation
    loop Stream Chunks
        OpenAI --> Gateway : Token Chunk
        Gateway --> Main : Yield Chunk
    end
    OpenAI --> Gateway : Finish + Usage Metadata
end
Gateway -> Meter : persistUsageEvent(ownerId, modelId, tokens, cost)
@enduml"""
    },
    "module4": {
        "title": "Module 4: Knowledge, Memory and Document Processing (RAG) Module",
        "usecase": """@startuml
skinparam backgroundColor #FFFFFF
left to right direction
actor "User" as User
rectangle "Module 4: Knowledge, Memory & RAG" {
    usecase "Upload PDF / Code / Text Document" as UC1
    usecase "Validate File Signature & Sanitize Name" as UC2
    usecase "Extract Text & Chunk (1100 chars, 150 overlap)" as UC3
    usecase "Generate Blake2s Hashed Vectors (4096 Buckets)" as UC4
    usecase "Perform Local Cosine Similarity Search" as UC5
    usecase "Compress Long Conversations (Auto-Summarizer)" as UC6
    usecase "Manage Explicit Personal Memories" as UC7
}
User --> UC1
UC1 ..> UC2 : include
UC2 ..> UC3 : include
UC3 ..> UC4 : include
User --> UC5
User --> UC6
User --> UC7
@enduml""",
        "class": """@startuml
skinparam backgroundColor #FFFFFF
class FileService {
    + processUpload(filename: string, content: bytes): ProcessedUpload
    + safeFilename(name: string): string
    + extractPdfText(content: bytes): string
}
class LocalRAGEngine {
    + chunks(text: string, size: int, overlap: int): Generator
    + computeHashedVector(text: string): Map<string, float>
    + indexFile(conn, fileId: string, text: string): void
    + retrieve(conn, convId: string, query: string, limit: int): List<ChunkMatch>
}
class ConversationCompactor {
    + shouldSummarize(messageCount: int): boolean
    + generateCompactSummary(messages: list): string
    + clearSummary(conn, convId: string): void
}
class MemoryManager {
    + addMemory(userId: string, content: string): Memory
    + listMemories(userId: string): List<Memory>
    + toggleMemoryState(userId: string, enabled: boolean): void
}
FileService --> LocalRAGEngine : Passes Extracted Text
LocalRAGEngine ..> SQLite : Stores Chunks & JSON Vectors
ConversationCompactor ..> SQLite : Updates conversation.summary
MemoryManager ..> SQLite : Stores user memories
@enduml""",
        "sequence": """@startuml
skinparam backgroundColor #FFFFFF
actor User
participant "FastAPI Main" as API
participant "FileService" as FS
participant "LocalRAGEngine" as RAG
participant "SQLite Database" as DB

User -> API : POST /api/files (multipart/form-data)
API -> FS : processUpload(filename, bytes)
FS -> FS : Verify Signature (%PDF- / Magic Bytes) & Bounds
FS -> FS : Extract text with PyPDF / UTF-8 decoder
FS --> API : ProcessedUpload(extractedText, mimeType)
API -> DB : Insert into files table
API -> RAG : indexFile(fileId, extractedText)
loop For each 1100 char chunk (150 overlap)
    RAG -> RAG : Hash tokens with Blake2s into 4096 buckets
    RAG -> RAG : L2 normalize vector
    RAG -> DB : INSERT INTO file_chunks (vector_json)
end
API --> User : File Uploaded & Indexed (201 Created)
... User Sends Message ...
User -> API : POST /api/chat/stream (query)
API -> RAG : retrieve(conversationId, query)
RAG -> DB : SELECT file_chunks for conversation
RAG -> RAG : Compute Cosine Dot-Product Against Query Vector
RAG --> API : Top 5 Relevant Chunks
API -> API : Inject Chunks into Model Context Prompt
@enduml"""
    },
    "module5": {
        "title": "Module 5: Backend, Storage and Security Module",
        "usecase": """@startuml
skinparam backgroundColor #FFFFFF
left to right direction
actor "User / Client" as Client
rectangle "Module 5: Backend, Storage & Security" {
    usecase "Hash Password (PBKDF2-HMAC-SHA256, 310k)" as UC1
    usecase "Verify Password & Issue JWT Bearer Token" as UC2
    usecase "Execute SQLite Transaction (WAL Mode)" as UC3
    usecase "Apply Sliding-Window Rate Limit by IP" as UC4
    usecase "Validate CORS & Extension Origin Regex" as UC5
    usecase "Manage Browser Action Pipeline (Suggest, Approve, Reject)" as UC6
    usecase "Log Daily Provider Token Usage & Quotas" as UC7
}
Client --> UC1
Client --> UC2
Client --> UC3
Client --> UC4
Client --> UC5
Client --> UC6
Client --> UC7
@enduml""",
        "class": """@startuml
skinparam backgroundColor #FFFFFF
class AuthManager {
    + hashPassword(password: string): string
    + verifyPassword(password: string, hash: string): boolean
    + issueToken(userId: string): string
    + authenticateToken(token: string): UserRecord
}
class DatabaseManager {
    + connect(): sqlite3.Connection
    + initialize(): void
    + transaction(): ContextManager
}
class SecurityGuardrails {
    + verifyAuthRateLimit(clientKey: string): void
    + validateOrigin(origin: string): boolean
    + enforceDailyProviderCap(userId: string): void
}
class ActionPipeline {
    + proposeAction(ownerId: string, actionType: string, payload: object): Action
    + approveAction(actionId: string): void
    + recordResult(actionId: string, result: object): void
}
DatabaseManager <.. AuthManager : Stores Users & Limits
DatabaseManager <.. SecurityGuardrails : Queries Usage Limits
DatabaseManager <.. ActionPipeline : Persists Actions & Status
@enduml""",
        "sequence": """@startuml
skinparam backgroundColor #FFFFFF
actor Client
participant "FastAPI Middleware" as Guard
participant "AuthRouter" as Auth
participant "DatabaseManager" as DB
participant "UsageMeter" as Meter

Client -> Guard : POST /api/auth/login (email, password)
Guard -> Guard : Check Sliding-Window IP Rate Limit (5 attempts/min)
Guard -> Auth : Route Request
Auth -> DB : SELECT password_hash FROM users WHERE email=?
DB --> Auth : User record
Auth -> Auth : verify_password() using hmac.compare_digest
alt Valid Credentials
    Auth -> Auth : issue_token(HS256 with 12h expiry)
    Auth --> Client : 200 OK + {token: "..."}
else Invalid Password
    Auth -> Auth : Execute constant-time dummy hash verification
    Auth --> Client : 401 Unauthorized
end
... Authenticated Chat Request ...
Client -> Guard : POST /api/chat/stream with Authorization: Bearer
Guard -> DB : _reserve_provider_request(ownerId)
alt Request Under Daily Limit
    DB --> Guard : Approved (Counter incremented)
    Guard --> Client : Stream NDJSON Response
else Exceeded Daily Quota
    Guard --> Client : 429 Too Many Requests
end
@enduml"""
    }
}

for mod_key, mod_val in MODULES.items():
    # Write PlantUML
    with open(DIAGRAMS_DIR / f"{mod_key}_usecase.puml", "w", encoding="utf-8") as f:
        f.write(mod_val["usecase"])
    with open(DIAGRAMS_DIR / f"{mod_key}_class.puml", "w", encoding="utf-8") as f:
        f.write(mod_val["class"])
    with open(DIAGRAMS_DIR / f"{mod_key}_sequence.puml", "w", encoding="utf-8") as f:
        f.write(mod_val["sequence"])

# Write architecture & DFD
with open(DIAGRAMS_DIR / "3.1_system_architecture.puml", "w", encoding="utf-8") as f:
    f.write(PUML_3_1)
with open(DIAGRAMS_DIR / "3.1_system_architecture.mmd", "w", encoding="utf-8") as f:
    f.write(MMD_3_1)

with open(DIAGRAMS_DIR / "3.1.1_dfd_level_0.puml", "w", encoding="utf-8") as f:
    f.write(PUML_DFD0)
with open(DIAGRAMS_DIR / "3.1.1_dfd_level_0.mmd", "w", encoding="utf-8") as f:
    f.write(MMD_DFD0)

with open(DIAGRAMS_DIR / "3.1.2_dfd_level_1.puml", "w", encoding="utf-8") as f:
    f.write(PUML_DFD1)
with open(DIAGRAMS_DIR / "3.1.2_dfd_level_1.mmd", "w", encoding="utf-8") as f:
    f.write(MMD_DFD1)

print("All diagram source files generated successfully in", DIAGRAMS_DIR)
