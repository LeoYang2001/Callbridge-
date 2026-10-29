# Realtime speech-to-speech models for AI phone agents (state as of 22 Oct 2026)

> Method note: WebFetch failed for every domain tried (DNS `ENOTFOUND` on artificialanalysis.ai, developers.openai.com, digitalapplied.com, datastudios.org). openai.com was not reachable either. **All findings below come from web-search result snippets**, which were summaries of the linked pages. Treat exact numbers as "reported by" the cited page and confirm them on the primary page before you build on them. The market changed a lot in Sept–Oct 2026: OpenAI GPT-Live-1 (10 Sep), Google Gemini 3.8 Live (15 Sep) and xAI Grok Voice 3.0 (14 Oct) are all newer than CallBridge's current gpt-realtime-2.1 setup.

## Q1. OpenAI Realtime (gpt-realtime-2.x, mini) and the new GPT-Live-1: voices, custom voices, steerability, SIP, pricing, phone weaknesses

### Takeaway
OpenAI now ships two voice products. **gpt-realtime-2.1** (+ mini) is token-billed and turn-based; it is what CallBridge uses today. **GPT-Live-1** (launched 10 Sep 2026) is a full-duplex "voice layer" that costs a flat $0.05/min and hands reasoning and tools to a backend model. It has a documented SIP connector, and OpenAI says it scores about 30 points higher on Full-Duplex-Bench than gpt-realtime-2.1. Custom voices exist, but sources describe access as restricted or eligibility-gated, not self-serve cloning.

### Cited Findings
**gpt-realtime-2.1 / mini**
- gpt-realtime-2.1 audio pricing is $32 per 1M input tokens ($0.40 cached) and $64 per 1M output tokens; text is $4 in / $24 out (OpenAI model page, via search snippet) — [OpenAI GPT-Realtime-2.1 model page](https://developers.openai.com/api/docs/models/gpt-realtime-2.1)
- Mini pricing has only third-party sources, and they disagree. One gives $10 per 1M audio in, $0.30 cached, $20 out. Another gives about $0.02–$0.05/min and dates 2.1 and 2.1-mini to July 2026 (a single unverified blog) — [Forasoft pricing](https://www.forasoft.com/blog/article/openai-realtime-api-pricing); [Crazyrouter comparison](https://crazyrouter.com/en/blog/ai-voice-cloning-api-comparison-2026)
- Per-minute range reported for the OpenAI Realtime API: "$0.02–$0.11 per minute" (third-party) — [Forasoft pricing](https://www.forasoft.com/blog/article/openai-realtime-api-pricing)
- gpt-realtime-2 is reported as a May 2026 release, described as "OpenAI's first voice model with GPT-5-class reasoning" — [Handy AI "Model Drop: GPT-Realtime-2"](https://handyai.substack.com/p/model-drop-gpt-realtime-2); [MarkTechPost TTS roundup](https://www.marktechpost.com/2026/05/30/best-text-to-speech-tts-models-in-2026-a-benchmark-based-comparison/)
- Voices: Cedar and Marin were introduced with the original gpt-realtime (Aug 2025) as Realtime-API-exclusive voices. At that launch OpenAI also added SIP phone calling, remote MCP and image input, and cut prices 20% to $32/$64 per 1M — [OpenAI "Introducing gpt-realtime" (2025)](https://openai.com/index/introducing-gpt-realtime/); [Towards AI on X](https://x.com/towards_AI/status/1961118380515365118)
- A 2026 build guide says OpenAI added Cedar and Marin "on top of eight refreshed" voices, "all preset, no cloning". It recommends a chained STT→LLM→TTS pipeline to teams that need cloned voices. It also notes that tool-call accuracy is "still a touch below a tool-tuned text model" and that S2S is harder to debug — [Forasoft production guide 2026](https://www.forasoft.com/blog/article/openai-realtime-api-voice-agent-production-guide-2026)
- **Conflicting:** another source says OpenAI documents **custom voices** for TTS, Realtime and GPT-Live: the custom voice is selected at session creation, and access is "limited to eligible customers" with project-scoped permissions — [Forasoft voice cloning guide](https://www.forasoft.com/blog/article/voice-cloning-synthesis) (secondary; I could not see OpenAI's doc)
- No source found lists voices specific to gpt-realtime-2.1, or confirms Mandarin, Japanese or Tagalog quality for 2.1 or mini — (search gap)

**GPT-Live-1 (new, 10 Sep 2026)**
- Launch and pricing: GPT-Live-1 came to the API on 10 Sep 2026 at **$0.05 per minute, billed per second**. "Backend model and tool usage is billed separately." — [OpenAI GPT-Live-1 model page](https://developers.openai.com/api/docs/models/gpt-live-1); [DataNorth news](https://datanorth.ai/news/openai-launches-gpt-live-1-in-the-api); [CellCog](https://cellcog.ai/blog/gpt-live-1/)
- Architecture: a full-duplex model (listens while speaking). Model id is `gpt-live-1` and the endpoint is `v1/live/sessions`. It delegates reasoning and tool use to a backend text model; one source names "GPT-6 Astra" as an example (unverified, single source). No image input — [OpenAI launch post](https://openai.com/index/introducing-gpt-live-1-in-the-api/); [Coursiv](https://coursiv.io/blog/gpt-live-1-api); [Meetcody comparison](https://meetcody.ai/blog/gpt-live-1-api-pricing-features/)
- OpenAI reports a **~30-point gain on Full-Duplex-Bench over gpt-realtime-2.1** (vendor figure, not independently verified) — [DataNorth](https://datanorth.ai/news/openai-launches-gpt-live-1-in-the-api)
- Voices: **12 voices** at launch. Custom voices are available through "restricted access / eligibility process" (stated by only one or two third-party sources) — [The Rundown](https://www.therundown.ai/tools/gpt-live-1); [Meetcody](https://meetcody.ai/blog/gpt-live-1-api-pricing-features/)
- Telephony: OpenAI publishes a **SIP connector** for GPT-Live-1. The endpoint looks like `sip:PROJECT_ID@sip.api.openai.com` over TLS, with incoming calls routed through a project webhook. Listed partners are LiveKit, Twilio, Telnyx and Daily/Pipecat. Carrier charges are separate — [Dograh comparison](https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents); [Evalgent](https://www.evalgent.com/blog/build-voice-agents-gpt-live)
- One blog ran an outbound Twilio call with GPT-Live-1 as the voice layer and gpt-4.1 as the backend, and got two separate billing line items per call — [Evalgent](https://www.evalgent.com/blog/build-voice-agents-gpt-live)
- A DEV Community write-up says GPT-Live-1 is the only one of GPT-Live / Gemini Live / Grok Voice that documents a native path to a phone line. It says Gemini and Grok document only socket transports (this contradicts other reports that Grok supports SIP; see Q3) — [DEV Community](https://dev.to/priteshkr/your-voice-model-probably-cant-answer-a-phone-and-the-docs-wont-tell-you-1f1h)
- No source mentioned G.711 μ-law support or codec details for GPT-Live-1 — (search gap)

### Inferences
- For CallBridge the most important development is GPT-Live-1. Full duplex with better interruption and backchannel handling is the main thing that makes an agent sound human on a call. At $0.05/min plus backend tokens, it may cost less than gpt-realtime-2.1 for long calls. Its delegation model also fits CallBridge's server-side policy layer, since the policy logic could live in the backend agent.
- Moving from gpt-realtime-2.1 to GPT-Live-1 means a new endpoint and session model, not just a parameter change. The existing Twilio Media Streams bridge may need to be replaced by, or run alongside, the SIP connector.
- Custom or cloned voices on OpenAI look like a gated sales process. They are probably not something a small app can count on.

### Gaps
- I could not open OpenAI's docs directly: the full GPT-Live-1 voice list, whether marin and cedar carry over, how custom voices work, the voice-instruction (steerability) API, supported languages, and μ-law support.
- No reliable source on official gpt-realtime-2.1-mini pricing, or on known phone-audio weaknesses of gpt-realtime-2.1 beyond generic remarks.

## Q2. Google Gemini Live API native audio (2.5 Flash native audio → 3.1 Flash Live → 3.8 Live)

### Takeaway
**Gemini 3.8 Live** (GA 15 Sep 2026, plus a "3.8 Live Extended Thinking" variant) is Google's current native speech-to-speech model. It is very cheap (reported ~$0.005/min input and ~$0.018/min output audio), offers about 30 preset voices, supports async function calling, and has proactive audio permanently on. No documented native telephony or SIP path was found, and audio is 16 kHz in / 24 kHz out PCM, so an 8 kHz μ-law bridge needs resampling.

### Cited Findings
- Gemini 3.8 Live was released 15 Sep 2026 alongside an Extended Thinking variant that "introduces background reasoning during live audio sessions" — [Google AI for Developers: Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live); [Gemini 3.8 Live Extended Thinking](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live-extended-thinking); [DataCamp](https://www.datacamp.com/blog/gemini-3-8-live)
- It replaced Gemini 3.1 Flash Live. Reported pricing is about $3 per 1M audio input tokens (~$0.005/min) and $12 per 1M audio output tokens (~$0.018/min), with a rate-limited free tier. These come from third-party blogs, not Google's pricing page — [Projedefteri](https://projedefteri.com/en/blog/gemini-3-8-live-api/); [Zentor "Two Models, One Price"](https://zentor.ai/blog/gemini-3-8-live-pricing); [rywalker.com](https://rywalker.com/research/gemini-live-api)
- **Conflict:** a June 2026 pricing blog (for the earlier Live models) lists $1/1M input and $20/1M output — [the-rogue-marketing](https://the-rogue-marketing.github.io/google-gemini-tts-speech-audio-api-pricing-may-2026/)
- Voices: Live models can use any Gemini TTS voice, about **30 prebuilt voices**, which can be auditioned in AI Studio. No mention of voice cloning — [Projedefteri](https://projedefteri.com/en/blog/gemini-3-8-live-api/)
- Languages: **97 languages** reported for 3.8 Live versus 70 for 2.5 Flash native audio (third-party). Google's docs describe "seamless multilingual switching" without a list in the snippets — [ai-tldr.dev](https://ai-tldr.dev/models/gemini-3-8-live/); [Live API capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities)
- **Proactive audio** (filters background speech and replies only when addressed) is permanently on in 3.8 Live, and setting it to false returns an error — [Google AI for Developers: Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live)
- **Affective dialog conflict:** the Gemini API model page says affective dialogue was removed and that `enable_affective_dialog` should be dropped. The Google Cloud Live API overview still lists it as a feature — [Gemini API model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live); [Google Cloud Live API overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api)
- Function calling is supported and **asynchronous by default**, so audio keeps flowing while backend calls run — [Google Cloud developer guide to Gemini 3.8 Live](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live)
- Audio format: input 16 kHz 16-bit PCM, output 24 kHz 16-bit PCM — [Live API overview](https://ai.google.dev/gemini-api/docs/live-api)
- Telephony: there is no Google-documented native SIP or phone path; only WebSocket and WebRTC transports are documented — [DEV Community](https://dev.to/priteshkr/your-voice-model-probably-cant-answer-a-phone-and-the-docs-wont-tell-you-1f1h); [Dograh](https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents)
- Gemini 2.5 Flash native audio is reported as GA on Vertex AI (older model) — [Vertex AI docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-live-api)
- AA S2S Index: Gemini 3.8 Live Extended Thinking (High) scores 82.6 (see Q4). Full-Duplex-Bench 91.9%, the lowest of the three frontier models. Speech Agent Arena Elo 990 (from xAI's release page) — [MarkTechPost](https://www.marktechpost.com/2026/10/14/meet-grok-voice-3-0-spacexai-voice-agent-model-ranks-1-on-artificial-analysis/); [Dograh](https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents)

### Inferences
- Gemini 3.8 Live is the cheapest frontier option by far, with broad language coverage that likely includes Tagalog (not confirmed). It scores lower than GPT-Live-1 and Grok on human-preference and turn-taking measures. Proactive audio being always on could cause problems on noisy phone lines, for example if the model ignores IVR prompts or a callee's side talk.
- CallBridge would need its own Twilio↔WebSocket bridge (8 kHz μ-law ↔ 16/24 kHz PCM), much like today's OpenAI bridge.

### Gaps
- Official Google pricing, the voice list, and confirmation of Tagalog, Mandarin and Japanese quality are unverified. No phone-audio (8 kHz) naturalness tests were found.

## Q3. Other realtime models: xAI Grok Voice, ElevenLabs Eleven Realtime, Hume EVI, Sesame, Kyutai, Ultravox, Deepgram, Amazon Nova Sonic, Microsoft, Alibaba Qwen, StepFun

### Takeaway
**xAI Grok Voice 3.0** (14 Oct 2026, $0.08/min) currently leads the independent indices and the human-preference arena. It supports tool calling, SIP, and self-serve voice cloning from a reference clip of up to 2 minutes (US only, excluding Illinois). **ElevenLabs Eleven Realtime v1 (Mini/Max)** is a new OpenAI-Realtime-protocol-compatible speech-to-speech model at $0.08/min plus LLM. That compatibility makes it a near drop-in for CallBridge's existing bridge, and ElevenLabs has the strongest voice-cloning ecosystem. Hume, Ultravox, Deepgram and Nova Sonic matter less at the frontier. Sesame has moved toward companion and hardware products.

### Cited Findings
**xAI Grok Voice 3.0**
- Launched 14 Oct 2026 at **$0.08/min (~$4.80/hr)** through the Voice Agent API, unchanged from the previous generation, with automatic migration — [xAI "Introducing Grok Voice 3.0"](https://x.ai/news/grok-voice-3); [ComputeLabs](https://www.computelabs.ai/research/2026-10-14/grok-voice-3-0-launched-voice-agent-api-0-08-minute-unchanged-previous); [Blockchain.News](https://blockchain.news/news/grok-voice-3-launch-unchanged-api-pricing-auto-migration)
- Earlier Grok Voice Agent API pricing was $0.05/min (now listed as deprecated) — [Medium](https://medium.com/@CherryZhouTech/xai-launches-grok-voice-agent-api-at-0-05-per-minute-6d0d6ddd553d); [The Rundown](https://www.therundown.ai/tools/grok-voice-agent)
- Reported **0.81 s latency**. It debuted at #1 on the AA Speech-to-Speech Index with 86.9, with Big Bench Audio 98.5% — [KuCoin flash](https://www.kucoin.com/news/flash/grok-voice-3-0-ranks-top-in-speech-to-speech-index-with-0-81s-latency-and-0-08-min-api-cost); [Artificial Analysis on X](https://x.com/ArtificialAnlys/status/2110421964095713743)
- Tool calling covers file search, web search, X search, remote MCP and custom functions. Supports SIP phone systems. Language support is "20+" or "25+" depending on the source, with auto-detection and mid-call switching — [Activepieces](https://www.activepieces.com/blog/grok-voice-agent-api-pricing-speed-and-setup-2026); [OmniaKey](https://omniakey.com/blog/grok-voice-3)
- Telephony add-on: $0.01/min on xAI's included number; bring-your-own SIP carrier costs are separate — [The Rundown](https://www.therundown.ai/tools/grok-voice-3-0)
- **Custom Voices API**: clone from a reference clip of up to 2 minutes, up to 30 custom voices per team free, **available only in the US excluding Illinois** — [Kie.ai](https://kie.ai/blog/what-is-grok-voice-3-0); [Windflash](https://windflash.us/blog/en/grok-voice-3-0-speech-model)
- Vendor claim: "comparable to GPT-Live-1 (Astra) at 40% lower latency" — [xAI](https://x.ai/news/grok-voice-3)
- Caution: several secondary blogs call the company "SpaceXAI" or "SpaceX Super Intelligence" (the AA tweet also says "SpaceXAI"). I did not verify the corporate naming — [MarkTechPost](https://www.marktechpost.com/2026/10/14/meet-grok-voice-3-0-spacexai-voice-agent-model-ranks-1-on-artificial-analysis/)
- **Conflict:** the DEV Community post says Grok documents only socket transport, not native phone — [DEV](https://dev.to/priteshkr/your-voice-model-probably-cant-answer-a-phone-and-the-docs-wont-tell-you-1f1h)

**ElevenLabs Eleven Realtime v1 (Mini / Max)**
- There are two new speech-to-speech models designed for real-time conversation — [The Decoder](https://the-decoder.com/elevenlabs-releases-two-new-speech-to-speech-models-designed-for-real-time-ai-conversations/)
- Both are **OpenAI-Realtime-protocol compatible**. Max targets complex multi-step tasks with tool calling; Mini targets natural conversation — [i-scoop](https://www.i-scoop.eu/eleven-realtime-elevenlabs/)
- Pricing is **$0.08/min plus LLM tokens** for both, per the official API pricing page. i-scoop's own estimates (page as of 21 Oct 2026) are about $0.084/min for Mini and $0.102/min for Max — [ElevenLabs API pricing](https://elevenlabs.io/pricing/api); [i-scoop](https://www.i-scoop.eu/eleven-realtime-elevenlabs/)
- Max scores 98.8% on Big Bench Audio with 0.57 s response time. ElevenLabs claims "no model on the AA leaderboard is both faster and more accurate" (vendor claim) — [The Decoder](https://the-decoder.com/elevenlabs-releases-two-new-speech-to-speech-models-designed-for-real-time-ai-conversations/)
- Voice cloning: Instant Voice Cloning from the Starter plan; Professional Voice Cloning from Creator (~$22/mo). **No source confirms that cloned voices work with the Realtime models** — [Gradually.ai](https://www.gradually.ai/en/elevenlabs-pricing/)
- The ElevenAgents platform supports telephony via Twilio, Genesys, Vonage, Telnyx, Plivo and SIP — [Coval review](https://www.coval.ai/blog/elevenlabs-review-2026-voice-cloning-and-synthesis-capabilities-explained/)

**Hume EVI**
- EVI 3 is English-first, with "11+ languages". EVI 4 Mini and Octave 2 add Japanese, Korean, Spanish, French, German and others. Cloning from 15–30 s of audio with consent (sources disagree on length). Plans: Starter $3/mo with 40 EVI minutes, Creator $14/mo with 200 minutes; overage $0.07/min, or $0.06/min on Pro (aggregator figures) — [Dupple review (Jul 2026)](https://dupple.com/reviews/hume); [Vantaige](https://vantaige.io/ai-tool/hume-ai); [Hume pricing](https://hume.ai/pricing); [Hume EVI 3 API announcement](https://hume.ai/blog/announcing-evi-3-api)
- Positioned as emotion-aware: it reads the caller's tone and adjusts its delivery. Telephony and orchestration must be added around it — [Inworld voice-agent platforms](https://inworld.ai/resources/best-voice-agent-platforms); [FutureAGI](https://futureagi.com/blog/best-text-to-speech-providers-2026/)

**Sesame**
- Sesame's TTS API is reported at ~200 ms latency and still in beta. It open-sourced CSM-1B (the snippet says April 2026; CSM-1B was originally released in March 2025, so the date is suspect) and has "pivoted toward companion and hardware products" — [YoungJu blog (May 2026)](https://www.youngju.dev/blog/culture/2026-05-14-ai-voice-2026-elevenlabs-openai-realtime-cartesia-vapi-sesame-deepgram-comparison-deep-dive.en); [Flaex](https://www.flaex.ai/blog/best-ai-voice-agent-platforms-in-2026-12-picks-compared)

**Ultravox, Deepgram, Amazon Nova Sonic, Microsoft**
- Ultravox: pay-as-you-go **$0.05/min**, 30 free minutes, cap of 5 concurrent calls; Pro $100/mo with no concurrency cap; SIP priced separately — [Ultravox pricing](https://www.ultravox.ai/pricing)
- Deepgram Voice Agent API: a bundle of STT, Aura TTS and turn-taking, reported at about **$0.050–$0.163/min**, and described as strong for high-volume call workflows — [Inworld](https://inworld.ai/resources/best-voice-agent-platforms); [Softcery](https://softcery.com/lab/choosing-the-right-voice-agent-platform-in-2026)
- Amazon Nova (2) Sonic: a single streaming speech-to-speech session. The only source found is an AWS-partner comparison (biased) — [rel8.cx](https://rel8.cx/blog/ai-voice-agent-platforms-comparison-2026)
- Microsoft: Azure Voice Live is billed per 1M tokens, with tiers set by the LLM chosen and separate native-audio S2S input/output rates. Actual prices did not render in the search results — [Azure Speech pricing](https://azure.microsoft.com/pricing/details/speech/). MAI-Voice-2 (TTS) supports consent-gated zero-shot cloning from 5–60 s; Microsoft's own pages give 9 to 17 languages — [Teamday](https://www.teamday.ai/blog/best-ai-voice-models-2026)

**Asian-language-native models (Alibaba Qwen, StepFun)**
- Alibaba Model Studio recommends `qwen3.8-omni-flash-realtime` for realtime audio conversation. Its docs list Mandarin, Japanese and **Tagalog** for Qwen3.5-Omni and the Qwen 3.8/3.5 Livetranslate models (coverage only, not quality) — [Alibaba Cloud S2S models](https://www.alibabacloud.com/help/en/model-studio/s2s-model)
- On the AA Big Bench Audio leaderboard, **StepAudio 3 Realtime** leads at 99.7% and **Qwen Audio 3.0 Realtime Plus** scores 99.2% (43 models evaluated) — [Artificial Analysis S2S page (via search)](https://artificialanalysis.ai/speech-to-speech)
- Qwen-Audio-3.0-TTS paper (Jul 2026) — [arXiv 2607.23938](https://arxiv.org/pdf/2607.23938)

### Inferences
- Eleven Realtime's OpenAI-protocol compatibility makes it the cheapest experiment for CallBridge: swap the endpoint and A/B test against gpt-realtime-2.1 on the same Twilio bridge.
- Grok Voice 3.0 is the only frontier model found with **self-serve** voice cloning plus SIP plus tool calling. The US-except-Illinois restriction and its newness are the risks.
- For Mandarin calls, Qwen and StepFun realtime models may sound more native than US models, but no quality evidence was found and there are data-residency and policy questions.

### Gaps
- **Kyutai (Moshi / Unmute):** I found no 2026 sources in the searches run.
- I could not find current pricing or language lists for Nova Sonic or Azure Voice Live. I found no Ultravox model-quality data.
- No Hume EVI 4 launch details, and no confirmation that Sesame offers a public conversational API.

## Q4. Independent benchmarks and blind preference tests (2026)

### Takeaway
Artificial Analysis (AA) runs a Speech-to-Speech Index. v1 was Big Bench Audio + Full-Duplex-Bench + τ-Voice. v2.0 is 25% each Big Bench Audio, τ-Voice, Arena preference and Task Success Rate. Grok Voice 3.0 debuted at #1 (86.9) in Oct 2026, ahead of GPT-Live-1 and Gemini 3.8 Live. Big Bench Audio alone is now saturated near 99%. **Benchmark leaders and listener-preference leaders disagree.** No benchmark tests 8 kHz phone audio.

### Cited Findings
- AA index v1 used equal weights across Speech Reasoning (Big Bench Audio), Conversational Dynamics (Full-Duplex-Bench subset) and Agentic Performance (τ-Voice). v2.0 gives 25% each to Big Bench Audio, τ-Voice, Arena Score and Task Success Rate — [AA methodology](https://artificialanalysis.ai/methodology/speech-to-speech-benchmarking); [AA index announcement](https://artificialanalysis.ai/articles/announcing-the-artificial-analysis-speech-to-speech-index); [AA on X](https://x.com/ArtificialAnlys/status/2069436163065282737)
- Big Bench Audio is 1,000 audio questions from four Big Bench Hard categories (250 each) — [AA methodology](https://artificialanalysis.ai/methodology/speech-to-speech-benchmarking)
- Oct 2026 AA S2S Index: Grok Voice 3.0 86.9; GPT-Live-1 (Astra, medium) 83.2; Gemini 3.8 Live Extended Thinking (High) 82.6; GPT-Live-1 (Sol, low) 80.1 — [AA on X](https://x.com/ArtificialAnlys/status/2110421964095713743). **Conflict:** Dograh reports GPT-Live-1 (Astra, medium) at 81.5, below Gemini's 82.6 (likely a different snapshot) — [Dograh](https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents)
- Big Bench Audio top scores: StepAudio 3 Realtime 99.7%, Qwen Audio 3.0 Realtime Plus 99.2%, Eleven Realtime v1 Max 98.8%, Grok Voice 3.0 98.5% — [AA S2S page](https://artificialanalysis.ai/speech-to-speech); [The Decoder](https://the-decoder.com/elevenlabs-releases-two-new-speech-to-speech-models-designed-for-real-time-ai-conversations/)
- Full-Duplex-Bench (turn-taking and interruption): Grok Voice 3.0 97.0%, GPT-Live-1 94.9%, Gemini 3.8 Live 91.9% — [MarkTechPost](https://www.marktechpost.com/2026/10/14/meet-grok-voice-3-0-spacexai-voice-agent-model-ranks-1-on-artificial-analysis/)
- Speech Agent Arena Elo (human preference): Grok Voice 3.0 1070, GPT-Live-1 1048, Gemini 3.8 Live 990 (as reported on xAI's own release page, so vendor-presented) — [xAI](https://x.ai/news/grok-voice-3); [Dograh](https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents)
- Another comparison found GPT-Live-1 had the strongest interruption handling it tested, with a lower turn-taking rate for Gemini — [Dograh](https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents)
- A Digital Applied article titled "Voice AI Benchmarks and Listener Votes Disagree: 14 Models" covers the gap between benchmark scores and listener preference. I could not read the content (fetch failed) — [Digital Applied](https://www.digitalapplied.com/blog/realtime-voice-models-benchmarks-vs-listener-preference)
- Academic work: SPEARBench (Jul 2026) is a benchmark for **naturalness** evaluation in streaming speech-to-speech LMs — [arXiv 2607.05365](https://arxiv.org/pdf/2607.05365)
- Practitioner guidance: aim for end-to-end response under ~800 ms, ideally ~500 ms, for natural phone conversation — [Cadence](https://cadence.withremote.ai/blog/best-ai-voice-services)
- Vendor benchmarks are unreliable, so teams should run their own blind tests on their own call flows — [Coval "Why vendor benchmarks lie"](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/)

### Inferences
- For "sounds human on a call", the most relevant signals are Arena preference and Full-Duplex-Bench, not Big Bench Audio. On both, the order is Grok Voice 3.0 > GPT-Live-1 > Gemini 3.8 Live, and gpt-realtime-2.1 trails GPT-Live-1 by about 30 points on Full-Duplex-Bench (OpenAI's own figure).

### Gaps
- I could not read the live AA leaderboard (fetch blocked), so I have no complete table with latency and price, and no scores for gpt-realtime-2.1, Hume, Ultravox or Nova Sonic.
- No benchmark measures naturalness at 8 kHz μ-law or on non-English (Mandarin, Japanese, Tagalog) conversations.
- I could not read SPEARBench's results or Digital Applied's 14-model findings.

## Q5. Which do practitioners say sound most human on phone calls, and why?

### Takeaway
I found no rigorous, independent listening test on real 8 kHz phone calls. Among practitioner and vendor write-ups, **GPT-Live-1** is favoured for phone "conversational feel" and has the only clearly documented SIP path. **Grok Voice 3.0** leads preference and duplex benchmarks. **ElevenLabs** is valued for voice quality and cloning. The "far more human" agents the user heard are most likely full-duplex models with natural backchannels and interruption handling (GPT-Live-1 or Grok class), or ElevenLabs-voiced pipelines, rather than turn-based gpt-realtime-2.1.

### Cited Findings
- Dograh calls GPT-Live-1 the stronger pick for conversational feel on phone agents, and the only one of the three with a documented SIP telephony path. Dograh has a commercial stake in the comparison — [Dograh](https://www.dograh.com/hub/blogs/realtime-voice-api-phone-agents)
- An eesel round-up of GPT-Live-1 alternatives (Grok, Gemini, ElevenLabs and others) exists, but its content was not readable beyond the title — [eesel](https://www.eesel.ai/blog/gpt-live-1-alternatives)
- A May 2026 practitioner overview covers the ElevenLabs / OpenAI Realtime / Cartesia / Vapi / Sesame / Deepgram stack (the full argument was not retrievable) — [YoungJu](https://www.youngju.dev/blog/culture/2026-05-14-ai-voice-2026-elevenlabs-openai-realtime-cartesia-vapi-sesame-deepgram-comparison-deep-dive.en)
- Hume EVI is valued where tone affects the outcome, such as healthcare intake, because it adapts its delivery to the caller's emotion — [Inworld](https://inworld.ai/resources/best-voice-agent-platforms)
- A 2026 guide flags that OpenAI S2S voices are preset-only, so teams wanting a distinctive cloned voice choose chained pipelines (e.g. ElevenLabs TTS) — [Forasoft](https://www.forasoft.com/blog/article/openai-realtime-api-voice-agent-production-guide-2026)

### Inferences
- What makes calls sound human, based on the measured dimensions: (1) full-duplex turn-taking, backchannels ("mm-hm") and graceful barge-in, which is what Full-Duplex-Bench measures; (2) sub-800 ms response latency; (3) voice timbre and prosody, where cloned or professional voices help; (4) no robotic filler during tool calls (Gemini's async tools and GPT-Live's backend delegation both address this).
- Suggested test plan for CallBridge: on the existing Twilio μ-law bridge, A/B test (a) gpt-realtime-2.1 with marin/cedar, (b) Eleven Realtime v1 Mini (OpenAI-protocol drop-in), (c) GPT-Live-1 via SIP connector + Twilio, and (d) Grok Voice 3.0 via SIP. Blind-rate recorded calls in English, Mandarin and Japanese. Gemini 3.8 Live is the cost floor to compare against.
- Mandatory AI disclosure at call start is compatible with all of these. Per-minute model costs range from ~$0.02 (Gemini) to $0.05 (GPT-Live-1, plus backend) to $0.08 (Grok, ElevenLabs), all before Twilio charges (~$0.014/min outbound local; $0.004/min SIP) — [Twilio voice pricing](https://static0.twilio.com/voice/pricing)

### Gaps
- No HN or forum threads with first-hand blind comparisons on PSTN calls were retrieved. No evidence was found on how the models handle Tagalog or code-switched Taglish, or Mandarin on 8 kHz lines.
- No data on whether any model's custom or cloned voices survive narrowband μ-law compression better than presets.
