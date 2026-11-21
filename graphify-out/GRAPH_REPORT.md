# Graph Report - who-am-i  (2026-11-22)

## Corpus Check
- Corpus is ~40,886 words - fits in a single context window. You may not need a graph.

## Summary
- 382 nodes · 921 edges · 21 communities (13 shown, 8 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 70 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Channel Live Execution & Queue
- Assistant & Data Processing
- Script Rundown & Audio Storage
- App Server & AI Generation
- Script Drafting & Channel Config
- Channel Presentation & Speaker Config
- OBS Overlay & Manga Speech Bubble
- Character Testing & Preview Tool
- Bông Character Rendering & Animations
- Viewer Memory & Privacy State
- Speech Synthesis Engine (VieNeu/Edge)
- HTTP Server & API Handlers
- Live Interaction & TikTok Control
- Dashboard UI & Episode Management
- Settings & Configuration UI
- Channel Setup Interface
- Document Repository Interface

## God Nodes (most connected - your core abstractions)
1. `Rundown` - 46 edges
2. `Channel` - 41 edges
3. `InteractionError` - 40 edges
4. `Interaction` - 21 edges
5. `main()` - 16 edges
6. `write_atomic()` - 15 edges
7. `ViewerMemory` - 14 edges
8. `Presentation` - 13 edges
9. `DocumentStore` - 13 edges
10. `Flower` - 13 edges

## Surprising Connections (you probably didn't know these)
- `AI System Prompts & Safety Directives` --references--> `generate_reply()`  [INFERRED]
  PROMPT-AI-A-Z.txt → app.py
- `TikTok Live Chat & Gift Interaction` --references--> `Channel`  [INFERRED]
  TUONG-TAC-LIVE.txt → app.py
- `VieNeu CUDA & TTS Audio Architecture` --references--> `Channel`  [INFERRED]
  KET-NOI-VA-GIONG-NOI.txt → app.py
- `16 Emotional Gestures & Auto Actions` --references--> `extract_gesture()`  [EXTRACTED]
  HUONG-DAN-BIEU-CAM-GIONG-DOC.txt → app.py
- `Storytelling & Document Reader Flow` --references--> `is_story_request()`  [EXTRACTED]
  HUONG-DAN-KE-TRUYEN.txt → app.py

## Import Cycles
- None detected.

## Communities (21 total, 8 thin omitted)

### Community 0 - "Channel Live Execution & Queue"
Cohesion: 0.10
Nodes (18): approved_text(), Channel, on_comment(), on_follow(), on_gift(), on_join(), on_like(), on_share() (+10 more)

### Community 1 - "Assistant & Data Processing"
Cohesion: 0.08
Nodes (10): chunks(), document_parts(), DocumentStore, VisibleText, csv_titles(), document_segments(), excerpts(), keywords() (+2 more)

### Community 2 - "Script Rundown & Audio Storage"
Cohesion: 0.13
Nodes (4): estimate(), read_json(), write_json(), Rundown

### Community 3 - "App Server & AI Generation"
Cohesion: 0.09
Nodes (19): CommandError, generate_reply(), google_call(), is_story_request(), load_dotenv(), load_profile(), LocalServer, main() (+11 more)

### Community 4 - "Script Drafting & Channel Config"
Cohesion: 0.10
Nodes (8): ask(), write_atomic(), clip_info(), split_episodes(), generate_lines(), parse_draft(), retell_lines(), plain()

### Community 5 - "Channel Presentation & Speaker Config"
Cohesion: 0.15
Nodes (4): audio_type(), Presentation, OperatorError, OperatorSettings

### Community 6 - "OBS Overlay & Manga Speech Bubble"
Cohesion: 0.13
Nodes (22): captionNode, captionPageNode, card, cardTally, cardTitle, clearPlayback(), enableAudio(), flower (+14 more)

### Community 7 - "Character Testing & Preview Tool"
Cohesion: 0.16
Nodes (19): actionsNode, caption, effectButton, interrupt(), playSound(), previewFlower, previewVoice, setCaption() (+11 more)

### Community 10 - "Speech Synthesis Engine (VieNeu/Edge)"
Cohesion: 0.26
Nodes (4): find_espeak(), Speaker, Speech, SpeechError

### Community 12 - "Live Interaction & TikTok Control"
Cohesion: 0.39
Nodes (7): field(), fillActions(), load(), refresh(), row(), send(), status()

### Community 13 - "Dashboard UI & Episode Management"
Cohesion: 0.80
Nodes (5): command(), drawDrafts(), el(), message(), refresh()

### Community 14 - "Settings & Configuration UI"
Cohesion: 0.70
Nodes (4): apply(), refresh(), send(), show()

### Community 15 - "Channel Setup Interface"
Cohesion: 0.83
Nodes (3): change(), initialize(), render()

## Knowledge Gaps
- **9 isolated node(s):** `Bông Hoa Live Overview`, `16 Emotional Gestures & Auto Actions`, `Storytelling & Document Reader Flow`, `9Router & Studio Mirror Mode (mirror=1)`, `VieNeu CUDA & TTS Audio Architecture` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 91 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Channel` connect `Channel Live Execution & Queue` to `Assistant & Data Processing`, `Script Rundown & Audio Storage`, `App Server & AI Generation`, `Script Drafting & Channel Config`, `Channel Presentation & Speaker Config`, `Speech Synthesis Engine (VieNeu/Edge)`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Rundown` (e.g. with `Channel` and `Speech`) actually correct?**
  _`Rundown` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Bông Hoa Live Overview`, `16 Emotional Gestures & Auto Actions`, `Storytelling & Document Reader Flow` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Channel Live Execution & Queue` be split into smaller, more focused modules?**
  _Cohesion score 0.09562289562289562 - nodes in this community are weakly interconnected._
- **Why does `Rundown` connect `Script Rundown & Audio Storage` to `Channel Live Execution & Queue`, `Assistant & Data Processing`, `App Server & AI Generation`, `Script Drafting & Channel Config`, `Channel Presentation & Speaker Config`, `Speech Synthesis Engine (VieNeu/Edge)`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `Channel` (e.g. with `Presentation` and `Speaker`) actually correct?**
  _`Channel` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Assistant & Data Processing` be split into smaller, more focused modules?**
  _Cohesion score 0.07973421926910298 - nodes in this community are weakly interconnected._