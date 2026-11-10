# MLRIT Major Project Documentation Template Analysis

## 1. Document Overview & Institutional Standards
This document outlines the structural, formatting, and content standards derived from the **MLR Institute of Technology (MLRIT)** Major Project Documentation Guidelines (Phase-II / Till Design Phase) for the Bachelor of Technology in Computer Science & Engineering (Data Science).

- **Institution:** MLR Institute of Technology (UGC Autonomous), Laxman Reddy Avenue, Dundigal, Hyderabad – 500 043.
- **Department:** Department of Computer Science & Engineering (Data Science).
- **Academic Year:** 2026–2027 (Submission: November 2026).
- **Program:** B.Tech. in Computer Science and Engineering (Data Science).
- **Project Title:** *OmniAssist – An AI-Powered Multimodal Interactive Assistant*
- **Batch Code:** Batch-A3
- **Team Composition:**
  - `23R21A6709` – BUDDEPU NAGAMANI
  - `24R25A6704` – KANAPARTHI ASEERVADHAM
  - `24R25A6701` – CHALLAWAR SAI CHARAN
- **Internal Guide:** Dr. V. Sravan Kumar, Assistant Professor, Department of CSE (Data Science), MLRIT.
- **Head of Department:** Dr. Sridhar Mourya, Professor & Head, Department of CSE (Data Science), MLRIT.
- **Principal:** Dr. S. V. S. Prasad, Principal, MLRIT.

---

## 2. Formatting & Typography Specifications

| Element | Specification |
| :--- | :--- |
| **Document Paper Size** | Standard A4 (210 mm x 297 mm), Portrait |
| **Margins** | Left: 1.25 inches (31.75 mm for binding); Right, Top, Bottom: 1.0 inch (25.4 mm) |
| **Body Font** | Times New Roman, 12 pt, Justified, 1.5 Line Spacing |
| **Primary Headings (Chapter)**| Times New Roman, 16 pt, Bold, Centered / Left-aligned, ALL CAPS |
| **Secondary Headings (1.1, 2.1)**| Times New Roman, 14 pt, Bold, Left-aligned, Title Case |
| **Tertiary Headings (1.1.1, 3.1.1)**| Times New Roman, 12 pt, Bold, Left-aligned |
| **Paragraph Spacing** | 6 pt after each paragraph; No blank lines between paragraphs |
| **Header & Footer** | Header: Chapter Name / Section Title (Right-aligned, 9 pt Italic).<br>Footer: "Dept. of CSE (Data Science), MLRIT" (Left) and Page Number (Right). |
| **Pagination** | Preliminary Pages: Lowercase Roman numerals (i, ii, iii, ... x) centered at bottom.<br>Main Body: Arabic numerals (1, 2, 3...) starting from Chapter 1. |

---

## 3. Strict Report Scope Boundary
As specified by the department curriculum guidelines for Phase-II Till Design Phase submission:
- **Mandatory Preliminary Pages:** Cover Page, Institute Vision/Mission, Department Vision/Mission, PEOs, Certificate, Declaration, Acknowledgements, Abstract, Keywords, SDG Goals Mapping, Table of Contents, List of Figures, List of Tables.
- **Chapter 1 – Introduction:** 1.1 Overview, 1.2 Objectives, 1.3 Purpose of the Project, 1.4 Motivation.
- **Chapter 2 – Literature Survey:** 2.1 Existing System, 2.2 Review of Relevant Research Papers (10 genuine papers with Methodology, Advantages, Limitations), 2.3 Comparative Analysis (Summary Table 2.6), 2.4 Limitations of Existing Approaches, 2.5 Research Gap.
- **Chapter 3 – Proposed System:** 3.1 System Architecture, 3.1.1 DFD Level 0, 3.1.2 DFD Level 1, 3.2 Key Features and Modules (Modules 1–5: UI, Real-Time Voice/Screen, Multi-Model Gateway, RAG/Knowledge, Backend/Security; each with Description, Responsibilities, I/O, Workflow, Technologies, Use Case Diagram, Class Diagram, Sequence Diagram), 3.3 System Requirements (Hardware, Software, Functional, Non-Functional), 3.4 Summary of Proposed System.
- **References:** Authentic IEEE/ACM bibliography.
- **STRICT EXCLUSION:** No Chapter 4 (Implementation / Code Listings), Chapter 5 (Testing), Results, Discussions, or Future Conclusions.

---

## 4. Alignment of OmniAssist Artifacts to Academic Guidelines

The 5 foundational engineering modules of OmniAssist map directly to Chapter 3:
1. **Module 1 (Interaction & Presentation):** Glassmorphic Web Client (React, TypeScript, Tailwind) and Manifest V3 Chrome Companion Panel.
2. **Module 2 (Real-Time Voice & Screen Perception):** MediaDevices `getDisplayMedia`, Web Audio API, WebSocket Relay, Luminance Diff Frame Sampler, and Gemini Live Bidirectional Session.
3. **Module 3 (AI Orchestration & Multi-Model Gateway):** FastAPI Model Dispatcher, Adapter Layer (OpenAI, Gemini, Anthropic BYOK, Groq, NVIDIA NIM, OpenRouter), and Transparent Fault-Tolerant Routing.
4. **Module 4 (Context, Memory & Document Retrieval):** PyPDF Text Extractor, Blake2s Hashed Lexical Vector Index (SQLite-backed local RAG), Conversation Auto-Summarizer, and User-Managed Explicit Memory.
5. **Module 5 (Backend Infrastructure, Storage & Security):** SQLite Transactional Store, PBKDF2-HMAC-SHA256 Auth, HMAC-SHA256 JWT Bearer Sessions, Sliding-Window IP Throttler, and Strict Content Validation.
