# Voice-agent architectures and managed platforms for CallBridge (as of Oct 2026)

> Method note: All findings below come from web-search result summaries (Oct 22, 2026). Direct page fetches (WebFetch) failed for every domain tried (DNS errors for cartesia.ai, destilabs.com, thunderphone.com, telnyx.com, docs.vapi.ai), so no page was read in full. Many sources are vendor-authored or third-party blogs; treat figures as directional and verify on official pricing/docs pages. Model/version names in sources conflict (e.g. gpt-realtime-1.5 / GPT Realtime 2 / gpt-realtime-2.1; Gemini 3.8 Live).

## 1. Speech-to-speech vs cascaded vs hybrid: latency and trade-offs

### Takeaway
Speech-to-speech (S2S) still measures lowest p50 latency in most benchmarks (~0.5–0.6 s in one production test), but independent boards show OpenAI's realtime model well above its marketing target (~1.4 s median on Coval per Cartesia), and well-built cascades now land around 0.7–1.0 s. Cascades/hybrids are cheaper, easier to debug and control, and are the only path to a premium/cloned TTS voice; S2S keeps prosody/emotion end-to-end and the simplest barge-in.

### Cited Findings
- Cascade latency = turn detection + LLM time-to-first-token + TTS time-to-first-audio + network hops; a 2026 study building a cascade from scratch measured a median of 958 ms end-to-end with a cloud LLM, with the LLM stage the most variable — [Gradium](https://gradium.ai/content/cascaded-voice-agent-vs-speech-to-speech-2026); [arXiv 2602.23266](https://arxiv.org/pdf/2602.23266) (search-summary attribution; exact source of the 958 ms figure not confirmed by fetch)
- Vendor-authored ranges: cascades ~600–1,200 ms vs S2S ~300–500 ms (or 300–700 ms) time-to-first-audio — [FutureAGI](https://futureagi.com/blog/cascaded-voice-ai-vs-speech-to-speech-2026/); [Coval](https://www.coval.ai/blog/speech-to-speech-vs-cascaded-voice-ai-which-architecture-should-you-deploy/)
- A production benchmark across 10+ projects: S2S had the lowest p50 (540–580 ms); cascades ~700 ms median but cheaper at $0.07–$0.13/min vs S2S $0.18–$0.21/min — [Destilabs 2026 benchmark](https://www.destilabs.com/blog/ai-voice-agent-benchmark-2026) (search snippet only)
- Coval S2S leaderboard (as reported by Cartesia, a cascade/TTS vendor): median ~1,000 ms for Gemini 3.8 Live and ~1,420 ms for GPT Realtime 2 — [Cartesia](https://www.cartesia.ai/learn/speech-to-speech-vs-cascaded) (vendor source, unverified)
- Cascades still dominate enterprise deployments in 2026 because they are easier to evaluate, debug and control; S2S favored for latency-sensitive consumer use — [Coval](https://www.coval.ai/blog/speech-to-speech-vs-cascaded-voice-ai-which-architecture-should-you-deploy/); [Modulate ebook](https://www.modulate.ai/ebooks/beat-the-black-box-why-cascade-beats-speech-to-speech-for-enterprise-voice-agents)
- Tool calling in full-duplex speech models is an open research area (a "frontend-backend" architecture separating the speaking model from a reasoning/tool backend has been proposed) — [arXiv 2609.19334](https://arxiv.org/pdf/2609.19334)
- OpenAI's Realtime API "cuts latency for simple Q&A agents, though it sacrifices the control you get from a traditional STT → LLM → TTS pipeline" — [TextToLab](https://texttolab.com/blog/best-tts-for-voice-agents)
- OpenAI realtime pricing (token-based): flagship realtime audio $32/1M input tokens ($0.40 cached), $64/1M output tokens; text output far cheaper (gpt-realtime-1.5 text output $16/1M; one guide says $24/1M on newer flagship); a third-party estimate puts audio output at ~$0.077 per spoken minute; one guide's headline range is $0.02–$0.11/min — [Fora Soft](https://www.forasoft.com/blog/article/openai-realtime-api-pricing); [Layer3 Labs](https://www.layer3labs.io/guides/openai-realtime-api-pricing); [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-realtime)
- The gpt-realtime model page lists outputs as "Text, Audio", suggesting text-only output mode (for a hybrid with external TTS) is supported, but no source confirmed configuration details — [OpenAI model page](https://developers.openai.com/api/docs/models/gpt-realtime)
- Gemini 3.8 Live (GA reportedly Sept 15, 2026): ~$3/1M audio input tokens (~$0.005/min) and $12/1M audio output (~$0.018/min) assuming 25 tokens/s; Google forum: no flat per-minute price, and re-billing applies to all tokens including prior-turn audio (context grows cost over long calls). Sources conflict; one says Google docs give no separate 3.8 Live price — [DataCamp](https://www.datacamp.com/blog/gemini-3-8-live); [Aireiter](https://aireiter.com/blog/gemini-3-8-live-api-pricing); [Google AI forum](https://discuss.ai.google.dev/t/pricing-of-speech-to-speech-live-model/140340); [TokenKarma](https://tokenkarma.app/blog/gemini-live-api-pricing-voice-agents-2026/)
- Premium TTS latency: ElevenLabs Flash v2.5 ~75 ms model latency; Cartesia Sonic 3 ~40 ms TTFA (Turbo) / 90 ms standard; real-world Cartesia measured ~166–190 ms including network — [FutureAGI ElevenLabs vs Cartesia](https://futureagi.com/blog/elevenlabs-vs-cartesia-tts-2026/); [TextToLab](https://texttolab.com/blog/cartesia-vs-elevenlabs); [TextToLab TTS ranking](https://texttolab.com/blog/best-tts-for-voice-agents)
- ElevenLabs' 75 ms headline covers synthesis only, excluding STT, LLM and telephony — [Cekura review](https://www.cekura.ai/blogs/elevenlabs-review)

### Inferences
- For CallBridge, the realistic "more human" options are: (a) keep OpenAI Realtime S2S (best native prosody and simplest barge-in, but locked to OpenAI's built-in voices; no cloned voice); (b) hybrid: OpenAI Realtime (audio in, text out) → ElevenLabs/Cartesia streaming TTS; (c) full cascade: streaming STT (Deepgram etc.) → LLM with tools → premium TTS. Options (b) and (c) are the only ways to get a cloned voice.
- Hybrid (b) keeps the existing Realtime session, function-calling, and server VAD, so the policy engine stays intact; it adds roughly one TTS TTFA (~75–200 ms) plus a text-buffering delay before audio starts, and loses the model's native emotion/prosody coupling (TTS only sees text). Barge-in becomes the server's job: on user speech the server must cancel both the Realtime response and the TTS stream and clear Twilio's buffer (`clear` message) — CallBridge's speech gate already does part of this.
- Audio-output tokens are the expensive part of Realtime; switching to text output should cut Realtime cost materially and partly offset TTS cost (inference from the token prices above).
- For Mandarin/Japanese/Tagalog/Spanish, S2S models handle code-switching natively; with external TTS, language and voice must be selected per utterance (or a multilingual model like ElevenLabs Flash v2.5 / v3 used).

### Gaps
- No independent measurement of OpenAI Realtime text-output mode + external TTS end-to-end latency was found.
- Could not confirm exact current gpt-realtime-2.1 prices on openai.com (blocked/unfetchable); version naming in sources is inconsistent.
- No source quantified emotion/naturalness loss of hybrid vs S2S (no MOS-style comparisons found).

## 2. Orchestration frameworks (Pipecat, LiveKit Agents, Vocode, TEN) and Node compatibility

### Takeaway
Pipecat is Python-only but has a ready Twilio Media Streams serializer and local Smart Turn v3 turn detection; LiveKit Agents has both Python and Node.js SDKs plus native SIP (Twilio trunks), making it the only mainstream framework a Node team can adopt without a Python sidecar. Adopting either largely replaces logic CallBridge already owns (speech gate, barge-in), so the main value is turn-detection models and TTS/STT plugins.

### Cited Findings
- Pipecat handles Twilio via a WebSocket `TwilioFrameSerializer` converting 8 kHz μ-law media-stream audio into pipeline frames, and can end the carrier call when the pipeline finishes; serializers also exist for Telnyx, Plivo, Vonage, Exotel, Genesys — [Evalgent Pipecat Twilio](https://www.evalgent.com/blog/pipecat-twilio-telnyx-phone-calls); [Telnyx orchestration tools](https://telnyx.com/resources/voice-ai-orchestration-tools)
- Pipecat Smart Turn v3 is the default end-of-turn strategy and runs locally as an ONNX model (no hosted hop); Pipecat is BSD-2-Clause; it has no built-in SIP gateway (phone calls via carrier WebSocket or Daily SIP) — [Evalgent Pipecat vs LiveKit](https://www.evalgent.com/blog/pipecat-vs-livekit); [Channel.tel](https://www.channel.tel/blog/pipecat-vs-livekit-voice-framework-decision)
- LiveKit Agents ships Python and Node.js SDKs (Node 20+); turn-detector model is default in `AgentSession`; its model license is more restrictive than Pipecat's and some features are gated to LiveKit Cloud; LiveKit has native SIP with trunks, dispatch rules and transfers — [Evalgent](https://www.evalgent.com/blog/pipecat-vs-livekit); [AutoInterviewAI](https://www.autointerviewai.com/blog/livekit-vs-pipecat-voice-ai-framework-2026)
- Version numbers conflict between sources (Pipecat 1.12.0 Sep 25 2026 / LiveKit 1.8.4 Oct 1 2026 vs 1.11.0 / 1.8.3) — [Evalgent](https://www.evalgent.com/blog/livekit-vs-pipecat-vs-dograh); [Meetrix](https://meetrix.io/blogs/livekit-agents-vs-pipecat/)
- Three placement patterns for Twilio: Twilio behind LiveKit (SIP), behind Pipecat (Media Streams WebSocket), or on its own — [vadim.blog](https://vadim.blog/twilio-livekit-pipecat-phone-line/)
- LiveKit Cloud agent-session meter: $0.01/min (includes hosting), plan quotas (Build 1,000, Ship 5,000, Scale 50,000 min); third-party SIP minutes $0.004/min (Ship) / $0.003/min (Scale); LiveKit's worked phone example ≈ $0.0412/min excluding models; models typically add $0.03–$0.07/min — [LiveKit agent cloud](https://livekit.com/products/agent-cloud-deployment); [Fora Soft](https://www.forasoft.com/blog/article/livekit-ai-agent-development); [Duplex Compute](https://duplexcompute.com/research/livekit-pricing/)
- LiveKit's own roundup of open-source frameworks — [LiveKit blog](https://livekit.com/blog/best-open-source-voice-and-video-ai-agent-frameworks) (vendor)

### Inferences
- CallBridge's Node/Fastify bridge already does what Pipecat's Twilio serializer does. Adding Pipecat means a Python sidecar between Twilio and Node (or Node → Python over an internal WebSocket), duplicating the speech gate/barge-in. Worth it only if Smart Turn or its TTS plugin set materially beats a hand-rolled hybrid.
- LiveKit Agents (Node) would mean moving the call leg from Twilio Media Streams to Twilio SIP trunk → LiveKit room; listen-in and HITL "hold" would be re-implemented on LiveKit primitives. Larger rewrite than a hybrid inside the existing VoiceAgent interface.
- A lighter alternative is to keep the Node bridge and add a TTS adapter (ElevenLabs/Cartesia streaming WebSocket with `ulaw_8000` output) behind VoiceAgent.

### Gaps
- No current (2026) information found on Vocode or TEN Framework (status, Node support, Twilio support). Vocode's activity level in 2026 could not be verified.
- Could not confirm whether Pipecat's Smart Turn model can be used standalone from Node (e.g. via onnxruntime-node) — plausible since it is ONNX, but unverified.

## 3. Managed platforms: naturalness, cloned voices, custom tools, BYO Twilio, mid-call control, pricing, outbound

### Takeaway
ElevenLabs Agents is the strongest on voice naturalness/cloning and has a "register call" mode that works with your own Twilio setup, but it would own the LLM/turn-taking loop; Retell's custom-LLM WebSocket and Vapi's server tools/live call control are the best fits for keeping CallBridge's policy engine authoritative. All-in prices cluster around $0.07–$0.33/min; cheapest pure S2S/agent APIs (Ultravox $0.05, Deepgram $0.075, ElevenLabs $0.08) exclude LLM and/or telephony.

### Cited Findings
**ElevenLabs Agents (ElevenAgents)**
- Hosted calls ~$0.08/min after plan-included minutes (15 to 12,375 included by tier); LLM and telephony billed separately; Twilio/SIP bills carrier side directly — [ElevenLabs pricing](https://elevenlabs.io/pricing/agents); [SuperDupr](https://superdupr.com/blog/elevenlabs-pricing); [Scored.tools](https://scored.tools/blog/elevenlabs-conversational-ai-review-2026/)
- Outbound via Twilio: POST `/v1/convai/twilio/outbound-call` with agent ID, agent phone number ID, destination number, optional client initiation data — [ElevenLabs docs](https://elevenlabs.io/docs/agents-platform/api-reference/twilio/outbound-call)
- "Register call" mode: your server starts/receives the Twilio call and gets TwiML connecting it to the agent over WebSocket, keeping full control of Twilio; call transfer not available in this mode — [ElevenLabs docs](https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/register-call)
- Tools: client tools, webhook/API (server) tools, server-side code tools, MCP tools, system tools; parallel tool calls configurable (default on) — [ElevenAgents overview](https://elevenlabs.io/docs/eleven-agents/overview); [Changelog](https://elevenlabs.io/docs/changelog)
- Third-party full-turn benchmark (via Cekura) put ElevenLabs at 1.73 s p50 — the lowest of six platforms in that test; voice layer quoted <300 ms non-telephony — [Cekura](https://www.cekura.ai/blogs/elevenlabs-review); [DevToolLab](https://devtoollab.com/blog/best-ai-voice-agent-platforms)
- Most often praised for voice quality/emotional range; Tom's Guide found its agents handle interruptions and "ums/ahs" with sub-second latency — [TextToLab](https://texttolab.com/blog/best-tts-for-voice-agents); [Tom's Guide](https://www.tomsguide.com/ai/i-built-an-ai-assistant-with-its-own-phone-number-in-10-minutes-heres-how)

**Retell AI**
- Pay-as-you-go: voice infrastructure ~$0.055/min, Retell-managed Twilio telephony ~$0.015/min; custom LLM/custom telephony listed at no extra charge; BYO Twilio removes telephony from Retell bill; total ~$0.073/min lean BYO to ~$0.13–$0.31 for fuller stacks; published range $0.07–$0.31/min — [Layer3 Labs](https://www.layer3labs.io/guides/retell-ai-pricing); [CloudTalk](https://www.cloudtalk.io/retell-ai-pricing/); [Zeeg](https://zeeg.me/en/blog/post/retell-ai-pricing-guide)
- Latency claims: ~620 ms in Retell's own testing / <800 ms; another source reports 400–600 ms avg, 900 ms P95 — [Retell blog](https://www.retellai.com/blog/vapi-vs-elevenlabs) (vendor); [SuperDupr](https://superdupr.com/blog/vapi-vs-bland-vs-retell)
- Custom LLM: Retell opens one WebSocket per call to your endpoint (call ID appended); your server generates responses and can end the call; Retell decides when the agent speaks (turn-taking stays with Retell); function calling runs on your side and tool results are not auto-added to Retell's transcript; serverless/edge runtimes cannot hold the socket — [Retell LLM WebSocket](https://docs.retellai.com/api-references/llm-websocket); [Retell custom LLM overview](https://docs.retellai.com/integrate-llm/overview); [Troubleshooting](https://docs.retellai.com/integrate-llm/troubleshooting); [Function calling](https://docs.retellai.com/integrate-llm/integrate-function-calling)
- Voice cloning: sources conflict — one review says no native cloning (workaround via ElevenLabs custom voices); Retell's own comparison lists ElevenLabs voices among options — [Synthflow review](https://synthflow.ai/blog/retell-ai-review) (competitor-authored, 2025); [Retell blog](https://www.retellai.com/blog/best-voice-ai-providers)

**Vapi**
- ~$0.05/min platform fee + providers at cost (or $0 with own keys); realistic all-in $0.12–$0.33 (another: $0.15–$0.36); latency ~500–800 ms avg (other sources 700–1,000 ms) — [StackBinary](https://stackbinary.io/insights/voice-ai-pricing-per-minute-2026); [AppStackBuilder](https://appstackbuilder.com/blog/best-ai-voice-agent-platforms-2026); [Ringlyn](https://www.ringlyn.com/blog/ai-voice-agent-pricing-per-minute-2026/)
- Import an existing Twilio number (Account SID + Auth Token) for inbound/outbound — [Vapi docs](https://docs.vapi.ai/phone-numbers/import-twilio)
- Live Call Control: inject conversation elements into an ongoing call; Call Listen streams audio over WebSocket; control and listen URLs returned in the `monitor` object when creating a call via `/call` — [Vapi Live Call Control](https://docs.vapi.ai/calls/call-features)
- Example repo for bypassing Vapi's phone provider integration with your own Twilio — [VapiAI GitHub](https://github.com/VapiAI/advanced-concepts-phone-call-provider-bypass)

**Bland AI**
- Flat $0.09/min replaced (by Aug 2026) with tiered all-inclusive (LLM+STT+TTS) $0.11–$0.14/min: Start $0.14 (no platform fee, 1 voice clone), Build $0.12 + $299/mo (5 clones), Scale $0.11 + $499/mo (15 clones); telephony separate — [PxlPeak](https://pxlpeak.com/blog/ai-tools/bland-ai-pricing); [Ringly](https://www.ringly.io/blog/bland-ai-pricing); [Emitrr](https://emitrr.com/blog/bland-ai-pricing/)
- API-first, developer-heavy — [GetVoIP](https://getvoip.com/blog/bland-ai-vs-synthflow/)

**Synthflow**
- Conflicting: older vendor source $0.08/min; a 2026 source: voice engine $0.09/min, typical $0.15–$0.24/min all-in; another 2026 source: no self-serve plans, enterprise from $30,000/yr. No-code builder for SMBs/agencies — [Dograh](https://www.dograh.com/feeds/blog/synthflow-bland-ai); [Autocalls](https://autocalls.ai/ai-voice-agent-pricing); [GetVoIP](https://getvoip.com/blog/bland-ai-vs-synthflow/)

**Deepgram Voice Agent API**
- Standard $0.075/min (Growth $0.068), Advanced $0.163/min; BYO TTS ~$0.065, BYO LLM ~$0.059, BYO LLM+TTS ~$0.050; telephony not included. Rate reportedly rose from $0.056 to $0.075 on ~Sept 13, 2026 (sources conflict on date) — [Cekura Deepgram pricing](https://www.cekura.ai/blogs/deepgram-pricing); [Cartesia Deepgram pricing](https://www.cartesia.ai/learn/deepgram-pricing); [Scored.tools](https://scored.tools/blog/deepgram-pricing-plans-2026/)
- Cartesia Managed Agents: $0.06/min (vendor claim) — [Cartesia](https://www.cartesia.ai/learn/deepgram-pricing)

**Ultravox**
- $0.05/min (PAYG and Pro; Pro $100/mo removes 5-concurrency cap), billed in 6-second increments; SIP 0.5¢/min (0.48¢ Pro); external telephony extra — [Ultravox pricing](https://www.ultravox.ai/pricing); [Ultravox docs](https://docs.ultravox.ai/gettingstarted/how-ultravox-works); [rywalker.com](https://rywalker.com/research/ultravox)

**Hume EVI**
- EVI usage ~$0.06–$0.07/min overage by tier (aggregator data, conflicting); EVI 3 reportedly clones a voice from <30 s audio; cloning availability by tier disputed — [Toolradar](https://toolradar.com/tools/hume-ai/pricing); [Dupple](https://dupple.com/reviews/hume); [fish.audio comparison](https://fish.audio/ja/vs/pricing/hume-ai/) (competitor)

**Sierra / Decagon**
- No pricing or voice-capability information found in search; both sell enterprise contracts.

**Outbound / regulatory**
- FCC Feb 2024 declaratory ruling: AI-generated voices are "artificial" under the TCPA, so prior consent is required for calls using them; a Retell guide says this covers real-time conversational AI and cloned voices; penalties $500–$1,500 per call; Aug 2024 proposed AI-disclosure rule not final as of Apr 2026 — [FCC](https://WWW.FCC.GOV/document/fcc-makes-ai-generated-voices-robocalls-illegal); [Brownstein](https://www.bhfs.com/insight/fcc-declares-ai-generated-calls-subject-to-tcpa/); [Retell TCPA playbook](https://www.retellai.com/nl/blog/tcpa-compliance-playbook-voice-ai-outbound) (vendor)
- A dev.to post claims a June 5, 2026 FCC ruling requiring prior express written consent for every AI call — uncorroborated — [dev.to](https://dev.to/alfredo_romero_fc4afdcb68/tcpa-2026-the-new-compliance-rules-every-ai-voice-agency-must-follow-1a4)

### Inferences
- Policy-layer authority: Retell custom-LLM (your server generates every utterance and executes tools; Retell does STT/TTS/turn-taking/telephony) maps most cleanly onto CallBridge's "server is authoritative" design, at the cost of giving Retell turn-taking and the speech gate. Vapi (custom LLM URL + server tools + live control/listen URLs) is similar. ElevenLabs Agents with webhook tools keeps policy decisions server-side but the agent's own LLM decides when to call them — weaker guarantees unless the server also gates outputs.
- HITL "hold while asking user" maps to Vapi's live call control injection and ElevenLabs' tools/contextual messages; with Retell custom LLM it's native (your server simply decides what to say). Unverified details per platform.
- Moving to any managed platform likely means replacing CallBridge's own Media Streams bridge, speech gate and barge-in; listen-in would use the platform's listen stream (Vapi) or post-hoc transcripts.
- Consumer-initiated "call on my behalf" calls to businesses are not telemarketing robocalls in the typical sense, but the 2024 FCC ruling's consent language is broad; legal review is needed. No platform AUPs were checked.

### Gaps
- Could not verify each platform's acceptable-use policy on consumer-initiated outbound calls to third parties.
- No official confirmation of Retell native voice cloning, Vapi custom/cloned voice handling, or ElevenLabs "contextual update"/inject-message mechanics (search didn't surface them).
- No Hume EVI Twilio/telephony integration info; no Sierra/Decagon data.
- Multilingual (Tagalog in particular) support per platform not verified.

## 4. Twilio ConversationRelay specifically

### Takeaway
ConversationRelay hands Twilio STT, TTS (Google, Amazon, ElevenLabs incl. custom voice IDs) and interruption handling, and sends your server text over WebSocket; it costs $0.07/min plus voice and LLM, with Twilio's own benchmark at 491 ms p50 / 713 ms p95. It would replace CallBridge's audio-level speech gate with Twilio's, and rules out S2S models, but is the lowest-effort way to get an ElevenLabs voice on the existing Twilio stack.

### Cited Findings
- ConversationRelay fee $0.07/min, voice charges separate, LLM billed by your provider; one guide's US inbound floor $0.0785/min + LLM + $1.15/mo number; unclear whether STT/TTS sit inside the fee — [Cartesia Twilio pricing](https://www.cartesia.ai/learn/twilio-pricing); [Thunderphone](https://thunderphone.com/guides/twilio-conversationrelay-pricing)
- Twilio internal benchmark: 491 ms p50, 713 ms p95 (scope of what's included not fully defined) — [Telnyx latency comparison](https://telnyx.com/resources/voice-ai-agents-compared-latency) (competitor-authored); [Thunderphone](https://thunderphone.com/guides/twilio-conversationrelay-pricing)
- TTS providers: Google, Amazon, ElevenLabs — [ElevenLabs blog](https://elevenlabs.io/blog/twilio-conversation-relay); [Twilio blog](https://www.twilio.com/en-us/blog/integrate-elevenlabs-voices-with-twilios-conversationrelay)
- `ttsProvider="ElevenLabs"` with `voice` = ElevenLabs voice ID (custom voices usable); ElevenLabs Flash 2.5 used by default; `elevenlabsTextNormalization` toggle — [Twilio TwiML docs](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay); [Twilio voice config](https://www.twilio.com/docs/voice/conversationrelay/voice-configuration)
- `language` sets STT+TTS; `ttsLanguage` overrides; automatic language detection ("multi") requires Deepgram STT and ElevenLabs TTS, otherwise errors and ends session — [Twilio TwiML docs](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)
- Interruption: `interruptible` = none/dtmf/speech/any; `interruptSensitivity` high/medium/low; `welcomeGreetingInterruptible`; per-text-token `interruptible`/`preemptible` override via WebSocket — [Twilio TwiML docs](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay); [Twilio WebSocket messages](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages)
- SSML supported; with ElevenLabs only the phoneme tag and only en-US — [Twilio changelog](https://www.twilio.com/en-us/changelog/conversationrelay-now-supports-ssml-tags-to-fine-tune-speech)
- Reference app: ConversationRelay + ElevenLabs + OpenAI — [twilio-samples GitHub](https://github.com/twilio-samples/conversationrelay-elevenlabs-openai)

### Inferences
- Versus Media Streams: ConversationRelay is text-in/text-out over WebSocket, so CallBridge would drop OpenAI Realtime audio (use a text LLM like gpt-realtime in text mode or a chat model) and Twilio would own STT, VAD, turn-taking and barge-in. Policy engine and HITL stay server-side (server decides every text token). Live listen-in would need a separate Twilio mechanism (e.g. a parallel unidirectional Media Stream or call recording) — unverified whether both can run on one call.
- Voice quality is capped at ElevenLabs Flash 2.5 over 8 kHz μ-law; cloned ElevenLabs voices appear usable via voice ID.

### Gaps
- Exact ElevenLabs voice surcharge inside ConversationRelay, supported STT providers list, and whether ConversationRelay and a Media Stream can coexist on one call were not confirmed (twilio.com not fetchable).

## 5. Practitioner reports: which stack sounds most human for outbound calls

### Takeaway
No Reddit/HN threads surfaced; blog-level consensus is ElevenLabs for the most natural/emotional voice and cloning, Cartesia for lowest latency with slightly less emotional range, and S2S (OpenAI/Gemini) for fluid turn-taking but less voice control.

### Cited Findings
- ElevenLabs stands apart on "voice consistency and emotional range"; Cartesia voices "lack the subtle emotional range" vs ElevenLabs; recommendation: Cartesia for efficiency-focused service calls, ElevenLabs for rapport-driven calls (author opinion) — [TextToLab](https://texttolab.com/blog/best-tts-for-voice-agents)
- ElevenLabs professional voice cloning called best in class; Cartesia offers instant voice cloning ("solid") — [FutureAGI](https://futureagi.com/blog/elevenlabs-vs-cartesia-tts-2026/); [Onepin](https://onepin.ai/blog/elevenlabs-vs-cartesia-2026)
- ElevenLabs Flash v2.5: 32 languages; Eleven v3: 70+ languages; Cartesia 40–44 languages (sources conflict) — [FutureAGI](https://futureagi.com/blog/elevenlabs-vs-cartesia-tts-2026/); [Gradium](https://gradium.ai/content/best-elevenlabs-alternatives-2026-tts-apis-voice-quality-price)

### Inferences
- For CallBridge's "much more human + possibly cloned" goal, ElevenLabs (Flash v2.5 for latency, or v3-class models if latency allows) is the default TTS choice, with Cartesia Sonic as a lower-latency fallback.

### Gaps
- No Reddit/Hacker News/YouTube practitioner threads were retrieved; no blind listening tests on 8 kHz telephony audio found.
- Tagalog/Japanese/Mandarin quality not verified for either TTS vendor.

## 6. Cost per minute for realistic options

### Takeaway
Rough per-minute all-in (US, excluding numbers): current OpenAI Realtime S2S on Twilio ≈ $0.10–$0.20; hybrid Realtime-text + ElevenLabs/Cartesia ≈ similar or lower; managed platforms $0.07–$0.33; ConversationRelay ≥ $0.08 + LLM; Gemini Live on LiveKit ≈ $0.04 floor. All figures are assembled from third-party sources and need verification.

### Cited Findings
- S2S stacks $0.18–$0.21/min vs cascades $0.07–$0.13/min (production benchmark) — [Destilabs](https://www.destilabs.com/blog/ai-voice-agent-benchmark-2026)
- OpenAI Realtime $0.02–$0.11/min (third-party estimate); audio output ~$0.077/spoken minute — [Fora Soft](https://www.forasoft.com/blog/article/openai-realtime-api-pricing)
- TTS: Cartesia Sonic 3 ~$39/1M chars, ElevenLabs Flash v2.5 ~$40–$50/1M chars; ~900 chars per spoken minute → roughly $0.035–$0.045 per minute of agent speech — [FutureAGI](https://futureagi.com/blog/elevenlabs-vs-cartesia-tts-2026/); [Gradium](https://gradium.ai/content/best-elevenlabs-alternatives-2026-tts-apis-voice-quality-price)
- OpenAI gpt-4o-mini-tts ~$0.015/min — [CostGoat](https://costgoat.com/pricing/openai-tts)
- Twilio carrier ~$0.008–$0.014/min (third-party, US); toll-free inbound $0.022/min (undated Twilio support article) — [Callin.io](https://callin.io/twilio-call-pricing/); [Twilio support](https://support.twilio.com/hc/en-us/articles/223179868-How-Much-Will-My-Voice-Application-Cost-per-Minute)
- ConversationRelay $0.07/min + voice + LLM — [Thunderphone](https://thunderphone.com/guides/twilio-conversationrelay-pricing)
- Gemini Live (~$0.023/min two-way audio) + LiveKit $0.01 + SIP/carrier ≈ $0.04/min floor — [TokenKarma](https://tokenkarma.app/blog/gemini-live-api-pricing-voice-agents-2026/); [Fora Soft LiveKit](https://www.forasoft.com/blog/article/livekit-ai-agent-development)
- Platform figures: Retell $0.07–$0.31; Vapi $0.12–$0.36; Bland $0.11–$0.14 + telephony; ElevenLabs $0.08 + LLM + telephony; Deepgram $0.075 (BYO LLM+TTS $0.05) + telephony; Ultravox $0.05 + telephony; Hume ~$0.06–$0.07 — see section 3 sources.

### Inferences
- Hybrid estimate (inference): Twilio ~$0.014 + Realtime audio-in/text-out (input audio cost + cheap text output; maybe ~$0.03–$0.06) + ElevenLabs Flash ~$0.02–$0.04 (agent speaks ~half the call) ≈ $0.07–$0.12/min — likely no more expensive than today's all-audio Realtime.
- Cloned-voice cost is a subscription/plan feature (ElevenLabs plan tiers, Bland clone quotas) rather than per-minute.

### Gaps
- No verified 2026 Twilio Media Streams per-minute fee or official Twilio voice rates.
- No official ElevenLabs API per-character/per-minute price for Flash v2.5 in Oct 2026 confirmed.
