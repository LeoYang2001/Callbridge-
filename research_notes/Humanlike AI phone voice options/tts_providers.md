# Streaming TTS Providers for Real-Time Phone Agents (state as of 22 Oct 2026)

> Method note: research done 22 Oct 2026. Direct page fetches to artificialanalysis.ai and elevenlabs.io were blocked by the sandbox egress proxy, so almost all findings below come from web-search result extracts (official pages where the search surfaced them, otherwise third-party coverage). Numbers marked "vendor-reported" were not independently measured. Items marked "[prior knowledge, not re-verified]" come from pre-2026 knowledge of provider docs and should be checked before relying on them. The TTS market moved very fast in Aug–Oct 2026 (Sonic 3.6, Eleven v4/v4 Turbo, Inworld Realtime TTS-2, HeyGen Voice), so leaderboard positions change week to week.

## 1. Which models rate highest in blind preference tests (Artificial Analysis, HF arena, etc.) as of Oct 2026?

### Takeaway
There is no stable #1. Through Aug–Oct 2026 the top of the Artificial Analysis (AA) Speech Arena has rotated among Cartesia Sonic 3.6, ElevenLabs Eleven v4 / v4 Turbo, Inworld Realtime TTS-2, HeyGen Voice, Speechify Simba 3.2, Alibaba Qwen-Audio-TTS / Fun-Realtime-TTS and Google Gemini 3.1 Flash TTS, usually within ~50–100 Elo of each other. The realistic short-list of real-time, phone-usable engines at the frontier is **Cartesia Sonic 3.6, ElevenLabs Eleven v4 Turbo and Inworld Realtime TTS-2**. All three are newer than and reportedly better than the older "default" choices (ElevenLabs Flash v2.5, Sonic 2/3, Deepgram Aura-2, Azure/Google/Polly).

### Cited Findings
- AA now runs several boards: "Provider Voice" (each vendor's own best voice), "Controlled Voice" (standardized cloned voices) and, since 22 Sep 2026, multilingual boards for 9 languages beyond English. Elo values from different boards are not comparable — [AA leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard); [AA Controlled Voice](https://artificialanalysis.ai/text-to-speech/leaderboard/controlled-voice); [AA multilingual announcement on X](https://x.com/ArtificialAnlys/status/2102490340678856997)
- **Aug 2026:** "Cartesia's Sonic 3.6 takes the #1 spot on both the Provider Voice and Controlled Voice Artificial Analysis Speech Arena leaderboards, surpassing Speechify AI's Simba 3.2 and Alibaba's Qwen-Audio-3.0-TTS-Plus, with Sonic 3.5 holding #2 on Controlled Voice" — [Artificial Analysis on X](https://x.com/ArtificialAnlys/status/2089400880688976062); [MarkTechPost, 18 Aug 2026](https://www.marktechpost.com/2026/08/18/cartesia-ships-sonic-3-6-a-streaming-tts-model-that-now-leads-both-artificial-analysis-speech-arenas/); [Cartesia blog: Introducing Sonic-3.6](https://www.cartesia.ai/blog/sonic-3.6)
- A Speechify-published analysis said Sonic 3.6 held the top score on 23 Sep 2026 at 1,273 Elo — [Speechify blog](https://speechify.ai/blog/simba-3-tops-artificial-analysis-tts-leaderboard). (Speechify itself claimed #1 earlier with Simba 3.2 — [PRWeb](https://www.prweb.com/releases/speechifys-simba-3-2-ranks-1-on-independent-artificial-analysis-tts-leaderboard-worlds-best-real-time-voice-model-above-elevenlabs-openai-google-deepmind--others-302819731.html).)
- **Late Sep 2026:** ElevenLabs launched Eleven v4 and v4 Turbo on 28 Sep 2026; one report says v4 launched as "the No. 1 voice model on the Artificial Analysis benchmark" — [TechCrunch](https://techcrunch.com/2026/09/28/elevenlabs-new-v4-speech-model-supports-more-expression-control-and-90-languages/); [Tech Times](https://www.techtimes.com/articles/328298/20260930/elevenlabs-eleven-v4-shifts-voice-ai-reading-acting-turbo-hits-sub-150ms-latency.htm). A search snapshot of AA's provider-voice board listed **Eleven v4 Turbo #1 (Elo 1335), Eleven v4 #2, Qwen-Audio-3.1-TTS-Plus #3** — [AA provider-voice board](https://artificialanalysis.ai/text-to-speech/leaderboard/provider-voice) (snapshot date unknown; could not open page directly).
- Inworld Realtime TTS-2 was reported as ranking #1 on AA at its GA launch — [Inworld](https://inworld.ai/); [Inworld Realtime TTS-2 page](https://inworld.ai/realtime-tts-2). In a May 2026 snapshot, Realtime TTS-2 (research preview) was #2 and Alibaba Fun-Realtime-TTS-Preview #5 (Elo 1190) — [MarkTechPost, 30 May 2026](https://www.marktechpost.com/2026/05/30/best-text-to-speech-tts-models-in-2026-a-benchmark-based-comparison/). AA also published an article on Alibaba's Fun-Realtime-TTS "topping" the leaderboard (~mid-2026), priced at $27.59/1M chars — [AA article](https://artificialanalysis.ai/articles/fun-realtime-tts-new-text-to-speech-model-topping-artificial-analysis-leaderboard)
- Another undated snapshot of the main AA TTS page showed **Gemini 3.1 Flash TTS on top (Elo 1214)**, followed by Realtime TTS-2 and Sonic 3.5; Fish Audio S2 Pro the highest open-weights model (Elo 1123) — [AA leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard) (snapshot timing unclear; likely pre-Sonic-3.6).
- **22 Oct 2026 (today):** a social post says HeyGen Voice Turbo is now #1 and standard HeyGen Voice #2 on AA; HeyGen announced it 22 Oct; Turbo endpoint free until 30 Nov — [AGTP on X](https://x.com/AGTPinsights/status/2113135273169362972); [AlphaSignal](https://alphasignal.ai/news/heygen-s-voice-turbo-tops-speech-leaderboard-at-87-less-cost). A secondary comparison instead reports HeyGen Voice (non-Turbo) #1 on Controlled Voice (Elo 1,202, #1 of 42) but "not ranked, insufficient votes" on Provider Voice — [OrcaRouter](https://www.orcarouter.ai/blog/heygen-voice-vs-cartesia-sonic-3-6). OpenRouter lists HeyGen Voice 1 Turbo at 39 languages, 5,000 chars/request, $7.50/1M chars (50% promo off $15), with measured P50 round-trip latency of 1.68–2.06 s — [OpenRouter](https://openrouter.ai/heygen/heygen-voice-1-turbo). Another comparison quotes a 57-Elo gap and "50 ms" vs Inworld TTS-2 — [OrcaRouter](https://orcarouter.ai/blog/heygen-voice-turbo-vs-inworld-realtime-tts-2).
- Vapi publishes a "Humanness Index" with per-model humanness and latency (e.g. a Cartesia Sonic 3 page) — [Vapi Humanness Index](https://humannessindex.vapi.ai/models/cartesia-sonic-3). Hugging Face hosts an "Open TTS Leaderboard" for multilingual/voice-cloning evaluation (mostly open models) — [HF blog](https://huggingface.co/blog/open-tts-leaderboard). A separate "Voice Arena" (different organization) runs per-language boards — [Voice Arena Japanese](https://voicearena.com/tts-leaderboard/japanese)
- Practitioner caution: vendor benchmarks are frequently misleading; Coval's independent measurements give materially higher latencies than vendor claims (e.g. Deepgram Aura-2 290 ms median perceived TTFA vs <90 ms claimed) — [Coval](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/)

### Inferences
- For a phone agent, the arena "winner" matters less than: (a) is the model streamable with low TTFA, (b) does it sound good after 8 kHz μ-law band-limiting, and (c) quality in the specific language. Arena voting is done at full bandwidth; differences of ~50 Elo between top models are likely much less audible over PSTN audio.
- HeyGen Voice's ~2 s round-trip latency (OpenRouter) suggests it is not currently a realistic real-time phone TTS despite topping the arena; Sonic 3.6, Eleven v4 Turbo and Inworld TTS-2 are the leaders that are also built for streaming.

### Gaps
- Could not open the live AA leaderboard to confirm the exact ranking as of 22 Oct 2026 (egress blocked). The HeyGen #1 claim is from social/secondary sources only.
- No current (2026) Hugging Face TTS Arena or Labelbox results were found.

## 2. Provider-by-provider: naturalness, latency, languages, streaming, conversational features, pricing

### Takeaway
ElevenLabs (v4 Turbo / Flash v2.5), Cartesia (Sonic 3.6) and Inworld (Realtime TTS-2) are the top commercial streaming engines; Rime and Deepgram Aura-2 are telephony-focused but narrower in languages; MiniMax and Alibaba are strong for Chinese; Google/Azure/Polly are broad in languages (incl. Filipino) but less expressive or not agent-first; PlayHT is defunct.

### Cited Findings

**ElevenLabs**
- Eleven v4 and **Eleven v4 Turbo** launched 28 Sep 2026: 90+ languages (v3 had 70+); v4 is the quality model (audiobooks, ads, games; up to 10,000 chars/request), v4 Turbo targets voice agents; inline audio tags, multi-speaker dialogue, cloning from ~10 s — [TechCrunch](https://techcrunch.com/2026/09/28/elevenlabs-new-v4-speech-model-supports-more-expression-control-and-90-languages/); [DataNorth](https://datanorth.ai/news/elevenlabs-releases-eleven-v4-and-eleven-v4-turbo)
- v4 Turbo latency (vendor-reported): ~100 ms median inference, ~150 ms median time-to-first-speech; same report cites Sonic 3.6 at 262 ms and OpenAI gpt-4o-mini-tts at 814 ms in ElevenLabs' test. Figures are TTS-only with network removed — [Tech Times](https://www.techtimes.com/articles/328298/20260930/elevenlabs-eleven-v4-shifts-voice-ai-reading-acting-turbo-hits-sub-150ms-latency.htm); [iotdigitaltwinplm analysis](https://iotdigitaltwinplm.com/elevenlabs-eleven-v4-expressive-tts-voice-ai-architecture-2026/)
- **Flash v2.5**: ~75 ms model latency, 32 languages including Filipino (fil); positioned as the low-latency multilingual model for agents — [Replicate](https://replicate.com/elevenlabs/flash-v2.5); [ElevenLabs blog](https://elevenlabs.io/blog/text-to-speech-api-integration)
- **Eleven v3**: 70+ languages incl. Filipino; ElevenLabs says it has higher latency and is not suited to real-time/conversational use; launch post said a real-time version was in development — [ElevenLabs Eleven v3 blog](https://elevenlabs.io/blog/eleven-v3); [Inworld review of v3](https://inworld.ai/resources/elevenlabs-v3-review). (v4 Turbo appears to be the answer to "expressive v3-style audio in real time".)
- Multilingual v2 / Turbo v2.5: older generation; [prior knowledge, not re-verified] Multilingual v2 = 29 languages, high quality but not low-latency; Turbo v2.5 = 32 languages, ~250–300 ms; both now superseded for agents.
- `ulaw_8000` output format exists for telephony (Twilio) — [ElevenLabs blog](https://elevenlabs.io/blog/text-to-speech-api-integration). WebSocket streaming input endpoint exists [prior knowledge, not re-verified].
- Pricing (third-party, conflicting): Eleven v4 Turbo $0.04/1K chars list (~$0.04/min), launch discount 72% off ended 12 Oct 2026 — [eesel.ai](https://www.eesel.ai/blog/eleven-v4-pricing); older Flash/Turbo $0.05/1K chars (~$0.045/min at ~900 chars/min) — [Puter guide, Jun 2026](https://developer.puter.com/tutorials/elevenlabs-api-pricing/); [HappyRobot](https://www.happyrobot.ai/hub/elevenlabs-pricing). ElevenLabs Agents platform ~$0.08/min (June 2026, possibly outdated) — [Puter](https://developer.puter.com/tutorials/elevenlabs-api-pricing/)
- Voice library: one aggregator lists 119 Filipino voices in the ElevenLabs library — [json2video](https://json2video.com/ai-voices/elevenlabs/languages/filipino/)
- ElevenLabs is the **default** TTS provider in Twilio ConversationRelay — [Twilio docs](https://www.twilio.com/docs/voice/conversationrelay/voice-configuration)

**Cartesia Sonic**
- Sonic 3.6 shipped Aug 2026; led both AA arenas at launch; 44 languages per most sources (one says 42); laughter via `[laughter]` tag, infers emotion from context — [MarkTechPost](https://www.marktechpost.com/2026/08/18/cartesia-ships-sonic-3-6-a-streaming-tts-model-that-now-leads-both-artificial-analysis-speech-arenas/); [The Rundown](https://www.therundown.ai/tools/sonic-3-6); [Cartesia blog](https://www.cartesia.ai/blog/sonic-3.6). Status conflict: one source calls 3.6 beta with 3.5 still "stable"; another calls 3.6 the current GA model — [The Rundown](https://www.therundown.ai/tools/sonic-3-6)
- Sonic 3: 42 languages; vendor claims sub-90 ms; one independent measurement 166 ms median incl. network; "Sonic Turbo" ~40 ms (third-party) — [invideo](https://invideo.io/blog/cartesia-sonic-ai-voice/); [texttolab](https://texttolab.com/blog/cartesia-ai-review); [Cekura](https://www.cekura.ai/blogs/best-tts-for-ai-voice-agents)
- Pricing: credit plans — Free 20k credits (~27 Sonic-3.6 min, no commercial license), Pro $5/mo, Startup $49, Scale $299; AA normalizes Sonic 3.6 at **$49/1M chars**; others quote $37–65/1M (Together AI lists Sonic-3 at $65/1M) — [The Rundown](https://www.therundown.ai/tools/sonic-3-6); [Together AI](https://www.together.ai/models/cartesia-sonic-3)
- `pcm_mulaw` 8 kHz output supported per a comparison table — [Telnyx](https://telnyx.com/resources/best-voice-apis-tts); [Inworld telephony ranking](https://inworld.ai/resources/best-voice-ai-for-ai-phone-agents). WebSocket streaming with context continuation [prior knowledge, not re-verified].

**Inworld (Realtime TTS-2 / Flash; formerly TTS-1/1.5 Max/Mini)**
- Realtime TTS-2 GA (2026): natural-language steering of delivery; vendor latency "as little as 90 ms" P90 for TTS-2 and 50 ms for Flash; other sources sub-200 ms median TTFA; nothing independently audited end-to-end — [Inworld Realtime TTS-2](https://inworld.ai/realtime-tts-2); [OrcaRouter](https://www.orcarouter.ai/blog/inworld-realtime-tts-2-flash-launch)
- Pricing: TTS-2 $25/1M chars on-demand, $12.50 Growth, ~$10 Enterprise; Flash $15 / $7 / $5 — [Inworld](https://inworld.ai/realtime-tts-2); [Inworld pricing comparison](https://inworld.ai/resources/tts-api-pricing-comparison)
- Languages: conflicting — Inworld says ~500 languages/dialects; Replicate says 100+ with only **15 production** and 90+ experimental; The Rundown says 200+ — [Inworld](https://inworld.ai/realtime-tts-2); [Replicate](https://replicate.com/inworld/realtime-tts-2); [The Rundown](https://www.therundown.ai/tools/inworld-tts)
- Earlier TTS 1.5 Max ~180 ms TTFB, 28 languages (Coval) — [Coval](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/)
- Native MULAW/ALAW 8 kHz claimed by one source, unconfirmed by another — [Inworld phone-agent ranking](https://inworld.ai/resources/best-voice-ai-for-ai-phone-agents); [Telnyx](https://telnyx.com/resources/best-voice-apis-tts)

**MiniMax Speech (02 / 2.6 / 2.8, HD & Turbo)**
- Official pricing: speech-2.6-turbo / 02-turbo $60/1M chars; 2.6-hd / 02-hd $100/1M; third-party reports same for 2.8 — [MiniMax pricing docs](https://platform.minimax.io/docs/pricing/overview); [invideo](https://invideo.io/blog/minimax-ai-voice-models/); [OpenRouter Speech 2.8 Turbo](https://openrouter.ai/minimax/speech-2.8-turbo)
- ~40 languages via `language_boost` incl. Chinese, Cantonese, English, Japanese, Korean, Vietnamese; Filipino not confirmed — [invideo](https://invideo.io/blog/minimax-ai-voice-models/)
- WebSocket endpoint `wss://api.minimax.io/ws/v1/t2a_v2` — [minimax-ai.chat guide](https://minimax-ai.chat/models/minimax-speech-26/)
- Turbo targets agents at <250 ms (vendor-aligned); Speech 2.6 HD scored ~1,156 Elo on AA per Inworld's page — [Inworld benchmarks](https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks); [Coval](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/)

**Rime (Mist, Arcana → Coda)**
- Pricing page: Mist $0.03/1K chars, Coda $0.05/1K; Dec 2025: Arcana $40/1M, Mist $30/1M — [Rime pricing](https://www.rime.ai/pricing); [Rime pricing post](https://www.rime.ai/blog/introducing-new-pricing/)
- Arcana reportedly deprecated 15 Aug 2026 and served by Coda (unconfirmed against Rime changelog). Coda languages reportedly English, Spanish, French, German, Portuguese, Japanese — [rywalker.com](https://rywalker.com/research/rime); [llm-stats](https://llm-stats.com/organizations/rime)
- Positioned for US-English telephony; μ-law 8 kHz output; Mist v3 37 ms TTFA (vendor-reported) — [Telnyx](https://telnyx.com/resources/best-voice-apis-tts)

**Deepgram Aura-2**
- $0.030/1K chars ($0.027 at Growth), launched Apr 2025 English-only; reportedly added Spanish, then Dutch, French, German, Italian, Japanese in Jan 2026 (single secondary source) — [BusinessWire launch](https://www.businesswire.com/news/home/20250415446781/en); [rywalker.com](https://rywalker.com/research/deepgram-aura)
- mulaw/alaw 8 kHz encodings; latency claim <90 ms vs Coval-measured 290 ms median perceived TTFA (~313 ms P50 elsewhere); "professional" rather than highly expressive — [Telnyx](https://telnyx.com/resources/best-voice-apis-tts); [Coval](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/)

**Google (Gemini 3.1 Flash TTS; Chirp 3 HD)**
- Gemini 3.1 Flash TTS: 70+ languages, audio tags, single/multi-speaker; ~$1/M text tokens in + $20/M audio tokens out ≈ $0.03/min; preview; developer forum reports inconsistent streaming latency (sub-2 s to 10–20 s), aggregator P50 4.57 s round-trip; Google points interactive voice to the Gemini Live API instead — [The Rundown](https://www.therundown.ai/tools/gemini-3-1-flash-tts); [Google AI forum](https://discuss.ai.google.dev/t/3-1-flash-tts-preview-streaming-latency/176050); [OpenRouter](https://openrouter.ai/google/gemini-3.1-flash-tts-preview); [ALM Corp guide](https://almcorp.com/blog/gemini-3-1-flash-tts/)
- Google voices (Journey/Chirp) are a built-in ConversationRelay option — [Twilio docs](https://www.twilio.com/docs/voice/conversationrelay/voice-configuration)
- [prior knowledge, not re-verified] Chirp 3 HD: streaming synthesis, ~30 voices × many locales incl. fil-PH, cmn-CN, ja-JP, es-US; ~$30/1M chars; Cloud TTS supports `MULAW` encoding at 8 kHz.

**Microsoft Azure (Neural, HD/DragonHD)**
- DragonHD voices auto-detect emotion and adjust tone; official HD page lists opus/mp3/pcm/truesilk at 8/16/24/48 kHz (μ-law not listed for HD); fil-PH-Angelo and fil-PH-Blessica DragonHDLatestNeural exist in Preview; newer "DragonHDOmni" model with 500+ voices — [Azure HD voices docs](https://docs.azure.cn/en-us/ai-services/speech-service/high-definition-voices); [Microsoft Learn HD voices](https://learn.microsoft.com/en-my/Azure/ai-services/speech-service/high-definition-voices)
- `Raw8Khz8BitMonoMULaw` appears in a third-party client's Azure format list — [aspeak](https://github.com/everythingsuckz/aspeak). [prior knowledge, not re-verified] Standard Azure neural voices support this format and SSML (prosody, mstts:express-as styles); ~$15/1M chars neural, ~$30/1M HD.

**Amazon Polly**
- Built-in ConversationRelay provider (e.g., Joanna-Neural) — [Twilio docs](https://www.twilio.com/docs/voice/conversationrelay/voice-configuration). [prior knowledge, not re-verified] Generative engine limited to a few languages (English variants, Spanish, etc.); outputs 8 kHz PCM but not μ-law; no Tagalog.

**HeyGen Voice / Speechify Simba**
- HeyGen Voice 1 Turbo: 39 languages, $7.50/1M promo, ~2 s P50 round-trip on OpenRouter — [OpenRouter](https://openrouter.ai/heygen/heygen-voice-1-turbo). Speechify Simba 3.2 marketed as #1 real-time model (mid-2026) — [PRWeb](https://www.prweb.com/releases/speechifys-simba-3-2-ranks-1-on-independent-artificial-analysis-tts-leaderboard-worlds-best-real-time-voice-model-above-elevenlabs-openai-google-deepmind--others-302819731.html)

**Hume Octave 2**
- <200 ms (vendor; ~100 ms excl. network in preview doc), 11 languages (Arabic, English, French, German, Hindi, Italian, Japanese, Korean, Portuguese, Russian, Spanish) — no Mandarin or Tagalog; half the price of Octave 1 (~$0.063/1K chars third-party, unconfirmed) — [Hume blog](https://hume.ai/blog/octave-2-launch); [aiwiki](https://aiwiki.ai/wiki/hume_octave_2)

**PlayHT**
- Meta acqui-hired the PlayAI/PlayHT team (July 2025); service shut down, most sources say 31 Dec 2025; voice clones lost — [Infrabase](https://infrabase.ai/audio/playht); [aitoolspolice](https://aitoolspolice.com/reviews/playht/) (secondary sources only). **Not an option.**

**Sesame**
- No official hosted API found; only the open-source CSM-1B (requires Llama 3.2 weights), deployable self-hosted — [Cerebrium](https://cerebrium.ai/blog/deploying-sesame-csm-the-most-realistic-voice-model)

**Open source**
- Fish Audio S2 Pro: highest/2nd-highest open-weights model on AA (Elo ~1123), inline emotion tags — [AA leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard); [pinggy](https://pinggy.io/blog/best_open_source_self_hosted_text_to_speech_models/)
- Qwen3-TTS (Alibaba, open-source): streaming, first packet after one character, end-to-end latency as low as 97 ms (vendor); hosted `qwen3-tts-flash-realtime` — [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS); [Alibaba Cloud realtime TTS docs](https://www.alibabacloud.com/help/en/model-studio/realtime-tts-user-guide)
- CosyVoice 2/3: ~150 ms streaming (CosyVoice2-0.5B), instruction controls for dialect/emotion — [SiliconFlow](https://www.siliconflow.com/articles/best-open-source-text-to-speech-models)
- Chatterbox: MIT, 23 languages, cloning; Kokoro: tiny, CPU, Apache-2.0, no cloning; Orpheus: streaming-oriented — [pinggy](https://pinggy.io/blog/best_open_source_self_hosted_text_to_speech_models/); [openvoxai](https://openvoxai.com/blog/best-tts-models-local-cloud-2026)
- Picovoice on-device benchmark: Kokoro ~3.7 s, Chatterbox-Turbo ~48 s first-speech in single-synthesis mode on device (not GPU-served) — [Picovoice](https://picovoice.ai/blog/on-device-tts/)

### Inferences
- Approximate per-minute TTS cost at ~900 chars/min (spoken): Inworld TTS-2 ~$0.02, Deepgram ~$0.027, Rime Mist ~$0.027, ElevenLabs v4 Turbo ~$0.036–0.045, Cartesia Sonic 3.6 ~$0.044, MiniMax Turbo ~$0.054. All are small relative to telephony+LLM costs, so cost should not drive the choice.
- Hume, Rime, Deepgram and Polly do not cover all of CallBridge's languages (Mandarin/Tagalog gaps), so they are weak fits for a multilingual product.

### Gaps
- Official ElevenLabs model docs (exact v4 Turbo language list, whether v4 Turbo supports Filipino/ulaw_8000/WebSocket) could not be fetched.
- Cartesia's exact 44-language list (whether Tagalog is included) not confirmed.
- Resemble AI, Fish Audio hosted API pricing, Orpheus/VibeVoice/Dia/Higgs Audio specifics not researched (call budget).
- Google Chirp 3 HD 2026 status not found in search; based on prior knowledge.

## 3. Best for Mandarin, Japanese, Spanish and Tagalog

### Takeaway
On AA's Sep 2026 multilingual arenas, **Cartesia Sonic 3.6 leads 7 of 9 languages including Japanese**, while **Inworld Realtime TTS-2 leads Mandarin** (Sonic 3.6 #2, StepFun StepAudio 2.5 #3). Chinese providers (Alibaba Qwen/Fun/CosyVoice, MiniMax, StepFun, ByteDance Doubao) are competitive for Mandarin. **No blind-test data exists for Tagalog**; ElevenLabs (Flash v2.5/v3/v4), Azure (DragonHD fil-PH preview + neural) and Google list Filipino.

### Cited Findings
- AA multilingual arenas (22 Sep 2026): 9 languages (Japanese, Mandarin, Hindi, Spanish, German, French, Portuguese, Vietnamese, Arabic); standardized cloned voices, native-language prompts, votes from first-language speakers, >100k votes, 15–24 models per language. Sonic family leads 8 of 9 (Sonic 3.6 #1 in 7, Sonic 3.5 leads Portuguese) — [AA on X](https://x.com/ArtificialAnlys/status/2102490340678856997); [AlphaSignal](https://alphasignal.ai/news/cartesia-s-sonic-3-6-dominates-eight-of-nine-global-voice-ai-leaderboards)
- **Mandarin:** Inworld Realtime TTS-2 1,185 Elo; Sonic 3.6 1,146; StepFun StepAudio 2.5 TTS 1,130 — [AA on X](https://x.com/ArtificialAnlys/status/2102490340678856997)
- **Japanese:** Sonic 3.6 leads (exact Elo not retrieved) — [AlphaSignal](https://alphasignal.ai/news/cartesia-s-sonic-3-6-dominates-eight-of-nine-global-voice-ai-leaderboards). A different org's Voice Arena Japanese board has "Gemini 3.8 Flash TTS" on top (Elo 1209) — [Voice Arena](https://voicearena.com/tts-leaderboard/japanese) (name as reported; unverified)
- **Spanish:** Sonic 3.6 presumably among its 7 #1s, but no Spanish-specific figure retrieved — [AlphaSignal](https://alphasignal.ai/news/cartesia-s-sonic-3-6-dominates-eight-of-nine-global-voice-ai-leaderboards)
- Note: the Sep 2026 multilingual arenas predate Eleven v4 (28 Sep) and HeyGen Voice, so they may not reflect those models.
- Alibaba: Fun-Realtime-TTS ($27.59/1M chars) and Qwen-Audio-3.x-TTS rank near the top of AA overall; Alibaba Cloud Model Studio offers streaming Qwen TTS / CosyVoice — [AA article](https://artificialanalysis.ai/articles/fun-realtime-tts-new-text-to-speech-model-topping-artificial-analysis-leaderboard); [Alibaba Cloud docs](https://www.alibabacloud.com/help/en/model-studio/realtime-tts-user-guide); [Qwen-Audio-3.0-TTS paper](https://arxiv.org/pdf/2607.23938)
- ByteDance Doubao seed-tts-2.0: bidirectional streaming via Volcengine; unofficial client reports ~750 ms end-to-end for ~2 s of speech; no AA rating found — [doubao-speech GitHub](https://github.com/Hypnus-Yuan/doubao-speech)
- MiniMax: strong Chinese/Cantonese focus, ~40 languages — [invideo](https://invideo.io/blog/minimax-ai-voice-models/)
- **Tagalog:** ElevenLabs Flash v2.5 and v3 list Filipino (fil) — [Replicate](https://replicate.com/elevenlabs/flash-v2.5); [ElevenLabs models mirror](https://elevenlabs8.mintlify.app/models). Azure has fil-PH-Angelo / fil-PH-Blessica DragonHD (Preview) — [Azure HD voices](https://docs.azure.cn/en-us/ai-services/speech-service/high-definition-voices). Inworld TTS-2 may cover it as an "experimental" language (not confirmed) — [Replicate](https://replicate.com/inworld/realtime-tts-2). Only quality evaluation found for Filipino is an older academic MOS study of MaryTTS/Tacotron-2; vendor "indistinguishable from native" claims are unsubstantiated — [Studocu PUP study](https://www.studocu.com/ph/document/polytechnic-university-of-the-philippines/bachelor-of-science-in-electrical-engineering/text-to-speech-systems-for-filipino-using-unit-selection-and-deep-learning/49810530); [Fliki](https://fliki.ai/voices/filipino)
- Hume Octave 2 lacks Mandarin and Tagalog; Rime Coda and Deepgram Aura-2 lack Mandarin and Tagalog — [aiwiki](https://aiwiki.ai/wiki/hume_octave_2); [rywalker Rime](https://rywalker.com/research/rime); [rywalker Deepgram](https://rywalker.com/research/deepgram-aura)

### Inferences
- A single-vendor cascade covering all CallBridge languages is most plausible with ElevenLabs (v4 Turbo/Flash v2.5) or Cartesia Sonic 3.6 (if Tagalog is in its 44) or Inworld TTS-2; a per-language router (e.g. Inworld or Alibaba/MiniMax for Mandarin, Sonic for Japanese/Spanish, ElevenLabs or Azure for Tagalog) is feasible since all stream text-in/audio-out.
- Tagalog quality must be validated by native-speaker listening tests on 8 kHz μ-law audio; no public benchmark exists. Taglish code-switching (common in real Filipino calls) should be part of the test.

### Gaps
- Exact Japanese and Spanish Elo values; whether Eleven v4 Turbo was later added to the multilingual arenas.
- No Tagalog leaderboard anywhere; Cartesia/Inworld Tagalog support unconfirmed.

## 4. Native μ-law 8 kHz output and Twilio usage

### Takeaway
Cartesia (`pcm_mulaw`), ElevenLabs (`ulaw_8000`), Deepgram Aura-2 (`mulaw`), Rime (mulaw 8 kHz) and likely Inworld (MULAW, partially confirmed) can emit Twilio-ready 8 kHz μ-law directly, avoiding resampling/transcoding latency. Azure standard neural supports a μ-law format but HD voices may not; Google Cloud TTS supports MULAW [prior knowledge]. Twilio's managed ConversationRelay bundles only ElevenLabs (default), Google and Amazon Polly; a Media Streams cascade (Pipecat/LiveKit-style) can use any of them.

### Cited Findings
- Comparison tables list native μ-law 8 kHz for Cartesia (pcm_mulaw), Rime, Deepgram Aura-2 (mulaw/alaw default 8000 Hz) and Inworld (MULAW/ALAW, one source; another says only "via WebSocket chunks") — [Telnyx](https://telnyx.com/resources/best-voice-apis-tts); [Inworld phone-agent ranking](https://inworld.ai/resources/best-voice-ai-for-ai-phone-agents); [Softcery](https://softcery.com/lab/how-to-choose-stt-tts-for-ai-voice-agents-in-2025-a-comprehensive-guide)
- ElevenLabs `ulaw_8000` is the telephony format for Twilio-style systems — [ElevenLabs blog](https://elevenlabs.io/blog/text-to-speech-api-integration)
- Azure HD voices officially list opus/mp3/pcm/truesilk only — [Azure HD voices](https://docs.azure.cn/en-us/ai-services/speech-service/high-definition-voices); `Raw8Khz8BitMonoMULaw` exists in Azure format lists — [aspeak](https://github.com/everythingsuckz/aspeak)
- Twilio ConversationRelay supports Google, Amazon Polly and ElevenLabs; ElevenLabs is default; generative voices are higher fidelity but add latency — [Twilio voice configuration](https://www.twilio.com/docs/voice/conversationrelay/voice-configuration); [Twilio TwiML ConversationRelay](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)

### Inferences
- With CallBridge's existing Twilio Media Streams setup, the cascade can stream μ-law bytes from Cartesia/ElevenLabs/Deepgram/Rime straight into the `media` messages with no conversion. For providers without μ-law (Gemini TTS, Azure HD, MiniMax possibly), request 8 kHz/16 kHz PCM and transcode with a G.711 encoder (cheap, adds <1 ms per chunk), so μ-law support is a convenience, not a hard requirement.
- Because μ-law/8 kHz strips high frequencies, subtle differences between top-tier models shrink on the phone; prosody, pacing, disfluencies and turn-taking latency matter more for "sounds human" than raw fidelity.

### Gaps
- MiniMax, Inworld and Google 2026 μ-law support not confirmed from primary docs (egress blocked).
- No 2026 practitioner reports found comparing perceived naturalness specifically over 8 kHz phone audio.
