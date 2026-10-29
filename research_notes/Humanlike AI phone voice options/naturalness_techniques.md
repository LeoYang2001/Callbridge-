# What makes AI voice agents sound human on phone calls: factors, target numbers, engineering techniques (as of Oct 2026)

Research method note: direct page fetches were blocked in this environment (developers.openai.com, livekit.com, hamming.ai, learn.chatgpt.com, elevenlabs.io all refused by the egress proxy), so most findings below come from search-result snippets of the named pages. Wherever a number comes from a vendor blog or an unvetted secondary source, that is flagged. Nothing found specifically on "gpt-realtime-2.1"; the findings cover gpt-realtime (Aug 2025) and gpt-realtime-2 (May 7, 2026).

## 1. Latency: what humans expect, what top agents hit, where the time goes in a Twilio Media Streams bridge

### Takeaway
Humans take turns with gaps of about 200 ms, and listeners start reading a gap as "trouble" (reluctance, disagreement, confusion) as it grows toward about 700 ms or more. Production voice agents usually land around 800 ms to 2 s. About 800 ms voice-to-voice is the commonly cited practical ceiling, and the biggest controllable piece is endpointing (VAD silence / turn detection), not model inference.

### Cited Findings
- Stivers et al. (2009, PNAS), 10 languages: every language avoids overlap and minimizes silence between turns. Average gaps vary by language only within a band of roughly ±250 ms around the cross-language mean, and the same factors explain response speed in every language — [emcawiki abstract](https://emcawiki.net/Stivers-etal2009); [MPI record](https://forms.mpi.nl/node/50939)
- The "~200 ms" modal turn transition is a figure from later reviews that cite Stivers et al. 2009, Heldner & Edlund 2010 and Levinson & Torreira 2015. It is not stated in the 2009 abstract itself — [Magyari, predictions in conversation (review)](https://uis.brage.unit.no/uis-xmlui/bitstream/handle/11250/3136187/magyari_predictions_in_conversation_AMMf45188.pdf?sequence=2); [languagehat summary](https://languagehat.com/the-universal-gap/)
- Roberts, Francis & Morgan (2006, Speech Communication 48:1079–1093) used simulated phone calls between friends. As the silence after a request or assessment grew (0 → 600 → 1200 ms), listeners perceived steadily less willingness to comply and weaker agreement — [emcawiki Roberts2006](https://emcawiki.net/Roberts2006)
- Kendrick & Torreira (2015) found that only at transitions of ≥700 ms do dispreferred responses (refusals, disagreements) clearly outnumber preferred ones. Long gaps therefore carry the conversational meaning of "something is wrong" — [PMC article](https://pmc.ncbi.nlm.nih.gov/articles/PMC4689543); [MPI](https://forms.mpi.nl/node/50430)
- A secondary source claims Roberts & Francis found no significant difference between 200–700 ms and a significant drop between 700 and 800 ms. This does not match the 2006 paper's design and is unverified — [koji.so](https://www.koji.so/docs/dispreferred-responses-interview-timing)
- Vendor framing: an 800 ms "rule" for natural conversation, with a budget covering endpointing, STT, LLM, tools, TTS and network jitter — [Twig](https://www.twig.so/blog/voice-ai-agents-latency-budget-800ms). Hamming says modern agents typically land at 800 ms–2 s end to end — [Hamming glossary](https://hamming.ai/glossary/latency)
- A caller who hears no reply within about a second reads the silence as confusion or disconnection — [Lorikeet CX](https://www.lorikeetcx.ai/articles/voice-ai-sub-second-latency-guide)
- Endpointing is the largest controllable contributor to the turn gap and can add about 500 ms before the model sees anything — [Softcery latency budget](https://www.softcery.com/lab/voice-agent-latency-budget-microphone-to-speaker) (vendor)
- Twilio's "Guide to Core Latency in AI Voice Agents (Cascaded Edition)" (Nov 2025) breaks down core latency per component and gives milestone targets. The exact numbers could not be retrieved — [Twilio blog](https://www.twilio.com/en-us/blog/developers/best-practices/guide-core-latency-ai-voice-agents)
- Example component budget (vendor, their own platform): STT ~150 ms + LLM ~200 ms + TTS ~75 ms + telephony transport <300 ms gives a sub-700 ms average — [Exotel](https://exotel.com/blog/achieve-low-latency-voice-ai-exotel/)
- Jitter buffers add roughly 40–100 ms of deliberate delay. Coval's advice is to deploy AI infrastructure in the same cloud region as Twilio's media servers — [Coval](https://www.coval.dev/blog/voice-ai-latency)
- Telnyx (a competitor, so commercially biased) reports a ~950 ms average for Twilio's voice channel — [Telnyx](https://telnyx.com/resources/voice-ai-agents-compared-latency)
- Twilio Media Streams can use in-region media engines in Ireland (IE1) and Australia (AU1) "to keep latency down for AI bot use cases". This requires the account and number to be homed in that region (changelog Apr 23, 2024) — [Twilio changelog](https://twilio.com/en-us/changelog/media-streams-available-in-ie1-and-au1)
- Twilio Video docs: us1 is US East (Virginia). Latency and jitter grow with the distance between parties — [Twilio docs](https://www.twilio.com/docs/video/tutorials/video-regions-and-global-low-latency)
- Twilio expects μ-law in 160-byte (20 ms) frames. Streamed model audio has to be re-sliced into those frames or playback glitches — [Towards AI write-up](https://pub.towardsai.net/i-built-a-voice-agent-on-openais-realtime-api-2da0977d4c51)
- Turning on Realtime API near-field noise_reduction together with semantic_vad/transcription was reported to make latency creep up over long sessions. Removing noise reduction fixed it for that user — [OpenAI community](https://community.openai.com/t/realtime-api-with-noise-reduction-has-sudden-increase-of-latency/1256390)
- Some carriers stream silence and others stream only speech, which changed Realtime API behavior with Twilio — [OpenAI community](https://community.openai.com/t/openai-realtime-api-full-audio-including-silence-vs-partial-audio-twilio-integration/1098589)
- A personal write-up claims a Twilio + OpenAI Realtime pipeline at ~250 ms, with no methodology given (anecdotal) — [DEV](https://dev.to/umair24171/how-i-slashed-ai-agent-phone-calls-twilio-latency-to-250ms-16af)

### Inferences
- Target for CallBridge: p50 under 800 ms and p95 under ~1.2 s, measured from the end of the callee's speech (as seen in Twilio inbound audio) to the first outbound AI audio frame sent to Twilio. Add the PSTN leg (~100–300 ms) for the callee's actual experience. Above ~700 ms, silence starts to mean "reluctance or trouble", so the AI sounds hesitant even when its content is fine.
- The custom server-side "speech gate" with `create_response=false` is effectively a second endpointer stacked on semantic_vad. Its wait time adds directly to the gap. Instrument it separately: (a) semantic_vad speech_stopped → gate decision, (b) gate → response.create, (c) response.create → first audio delta, (d) first delta → first 20 ms frame to Twilio.
- Co-locate the Node bridge with the Twilio media region (us1 Virginia for US numbers, or IE1/AU1 if numbers are homed there) and with the OpenAI endpoint. Every relay hop adds round-trip time twice per turn (audio in, audio out).
- Do not buffer whole model audio deltas before sending. Forward 20 ms frames as soon as they are available.

### Gaps
- Twilio's own milestone latency targets (the article text could not be fetched).
- No measured us1-vs-ie1 comparison for Media Streams to OpenAI Realtime, and no official OpenAI guidance on regional endpoints.
- No independent benchmark of gpt-realtime-2/2.1 time-to-first-audio over PSTN.

## 2. Turn-taking and endpointing: semantic turn detection, interruptions, false barge-ins, full duplex

### Takeaway
Silence-threshold VAD alone forces a choice between cutting people off and responding slowly. Semantic or acoustic end-of-turn models cut false cutoffs significantly at the same latency budget. Barge-in should be decided by what was said (a backchannel like "uh-huh" or "mm" should not stop the AI), and the classifier should cancel speech rather than gate the response.

### Cited Findings
- LiveKit EOT benchmark (vendor-run): false cutoff rate at a 300 ms latency budget is 9.9% for LiveKit Turn Detector v1, 12.9% for Deepgram Flux, 27.7% for ultraVAD and 35.2% for Smart Turn v3.2. At 600 ms it is 4.5% for LiveKit v1, 5.5% for Soniox and 9.9% for Flux — [LiveKit blog](https://livekit.com/blog/solving-end-of-turn-detection); [EOT leaderboard](https://livekit.com/benchmarks/eot-bench); [GitHub eot-bench](https://github.com/livekit/eot-bench)
- Deepgram Flux does end-of-turn detection inside the STT and claims higher precision, recall and F1 than dedicated EOT models while listening to only one side. Commonly cited at ~260 ms p50 EOT latency — [Deepgram](https://deepgram.com/learn/fluxing-conversational-state-and-speech-to-text); [Evalgent](https://www.evalgent.com/blog/deepgram-flux-vs-nova-3)
- Pipecat's default stop strategy is Smart Turn v3 (local ONNX, 23 languages). LiveKit's multilingual turn detector covers 14 languages — [Evalgent Pipecat vs LiveKit](https://www.evalgent.com/blog/pipecat-vs-livekit)
- A third-party model card (author's own claim) reports Smart Turn v3 cutting off 45.3% of turns in its Pipecat test, against 13.3% for their voxturn model — [HF voxturn](https://huggingface.co/AustinXiao/voxturn)
- OpenAI semantic_vad takes `eagerness` = low | medium | high | auto — [OpenAI VAD docs](https://developers.openai.com/api/docs/guides/realtime-vad). One builder found low too laggy, high too jumpy, and only medium workable on phone calls — [Towards AI](https://pub.towardsai.net/i-built-a-voice-agent-on-openais-realtime-api-2da0977d4c51). A Twilio example moved from auto to medium and cut mean turn detection from ~1.26 s to ~1.10 s with no extra mid-sentence splits — [inworld-api-examples PR #112](https://github.com/inworld-ai/inworld-api-examples/pull/112)
- A numeric eagerness value broke tool use; a string value fixed it — [OpenAI community](https://community.openai.com/t/using-server-vad-breaks-tool-use-in-realtime-api/1362139)
- AssemblyAI guidance on backchannels: while the agent is speaking, suppress barge-in when the utterance is very short or made only of known filler or backchannel words, and pass anything with non-filler content. SpeechStarted should go through the same turn-level check so a backchannel can't trigger barge-in before the transcript is seen — [AssemblyAI Voice Agent API docs](https://assemblyai.com/docs/voice-agents/voice-agent-api/turn-detection-and-interruptions); [Universal-3.5 Pro streaming](https://www.assemblyai.com/docs/voice-agents/universal-3-5-pro-streaming-api)
- LiveKit "adaptive interruption handling" analyzes streaming audio during overlapping speech to classify whether it is a true interruption — [LiveKit docs](https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling.md)
- Twilio ConversationRelay exposes `interruptSensitivity`, `ignoreBackchannel`, `eotThreshold` and `interruptible`, and treats barge-in, backchannels and speech-like background noise as three separate problems — [Twilio blog](https://www.twilio.com/en-us/blog/insights/ai-voice-agent-interruption-handling)
- Architecture: a classifier placed in front of the response adds its latency to every turn. Used instead as a cancellation signal (speak optimistically, cancel if it was a real interruption, or keep talking if it was a backchannel), it costs nothing — [Quiq](https://quiq.com/blog/why-the-interruption-problem-is-architecture/)
- Hamming recommends classifying each overlap as true correction, backchannel, accidental noise, DTMF, silence timeout or safety escalation, and logging the decision for audit — [Hamming runbook](https://hamming.ai/blog/voice-agent-interruption-handling-runbook)
- Retell: interruption sensitivity 0–1 (0 = cannot be interrupted); "responsiveness" 0–1; dynamic response wait, where slower speakers get more patient timing and faster speakers quicker replies — [Retell API](https://docs.retellai.com/api-references/update-agent); [Retell flow settings](https://docs.retellai.com/build/conversation-flow/global-setting); [Retell background noise](https://docs.retellai.com/build/handle-background-noise)
- Retell forum: with backchannels ("mhm") or noise treated as interruptions, interrupt transitions fire constantly. Interruption settings also behave differently on real calls than in the dashboard test, so test on real PSTN calls — [Retell community](https://community.retellai.com/t/interruption-sensitivity-doesnt-work/358)
- Full duplex: Moshi listens and speaks at once (80 ms chunks both ways) and can emit "mhm" without giving up its turn. Sesame CSM is expressive but not full-duplex (secondary tutorial, unvetted) — [traeai tutorial](https://learn.traeai.com/t/ai-engineering/phases/06-speech-and-audio/15-streaming-speech-to-speech-moshi-hibiki)

### Inferences
- For CallBridge's speech gate: when the callee talks over the AI, do not clear Twilio audio on raw VAD `speech_started`. Wait about 250–400 ms or for the first transcript tokens, then classify:
  - A backchannel in the target language should not interrupt. Keep per-language lists, e.g. EN "uh-huh/mm/yeah/right/okay", ZH "嗯/对/好/是", JA "はい/ええ/うん/そうですね", ES "ajá/sí/claro/vale", TL "oo/opo/sige".
  - Anything else should `clear` + `conversation.item.truncate`.
  - Note that Japanese aizuchi are very frequent, so a naive gate will interrupt constantly on JA calls (an inference; not directly sourced).
- Respond optimistically and cancel, rather than gating the start of the response on extra silence. That is how semantic EOT gets its latency back.
- Consider adding an external EOT model alongside semantic_vad (Smart Turn v3 runs locally, 23 languages including Mandarin, Japanese and Spanish; LiveKit multilingual covers 14). Check Tagalog coverage, which was not confirmed.
- Use eagerness "medium" as the phone baseline and tune per language/locale.

### Gaps
- No independent (non-vendor) benchmark of EOT models on 8 kHz telephony audio in Mandarin, Japanese or Tagalog.
- No published false-barge-in rates for OpenAI semantic_vad.
- Whether gpt-realtime-2.x has a native backchannel or ignore-backchannel option was not found.

## 3. Backchannels, fillers, disfluencies, preambles, prosody, speaking rate, and conversational register

### Takeaway
Agents that sound human (a) emit short spoken acknowledgments or preambles ("let me check that") within a beat instead of going silent during tool calls or reasoning, (b) keep turns to 1–3 spoken sentences in a phone register with no lists or markdown, (c) vary their phrasing, and (d) show small natural imperfections (breaths, hesitations, self-corrections). gpt-realtime-2 has native preambles, and pacing is controlled through prompt instructions, not the speed parameter.

### Cited Findings
- gpt-realtime-2 (launched May 7, 2026) added preambles: short in-character spoken acknowledgments before the substantive answer while the model is still reasoning or calling tools (e.g. "one moment, checking your calendar"). It also narrates parallel tool calls, recovers from failures audibly instead of going silent, offers reasoning effort minimal/low(default)/medium/high/xhigh, and has a 128K context window (up from 32K) — [TheNextWeb](https://thenextweb.com/news/openai-gpt-realtime-2-voice-models); [Agora](https://prod.agora.io/en/blog/gpt-realtime-2-is-here-and-preambles-change-how-voice-agents-feel); [DataCamp](https://www.datacamp.com/blog/gpt-realtime-2); [dsebastien](https://www.dsebastien.net/2026-05-07-gpt-realtime-2-openais-voice-model-gets-gpt-5-class-reasoning/)
- Higher reasoning effort adds latency, and the headline benchmarks were run at xhigh — [DataCamp](https://www.datacamp.com/blog/gpt-realtime-2); [DEV critique](https://dev.to/dishant0406/the-hype-around-gpt-realtime-2-and-what-actually-landed-nag)
- Companion models released the same day: gpt-realtime-translate (70+ input languages) and gpt-realtime-whisper (streaming STT) — [TheNextWeb](https://thenextweb.com/news/openai-gpt-realtime-2-voice-models)
- OpenAI's GPT-Realtime-2 prompting guide covers tuning reasoning effort, preambles, tool behavior, unclear audio, capturing exact entities, and keeping state in long sessions — [OpenAI Devs on X](https://x.com/OpenAIDevs/status/2052530378184032560); [Using realtime models](https://developers.openai.com/api/docs/guides/realtime-models-prompting?realtime-model=gpt-realtime-2)
- Preambles are short spoken updates such as "I'll check that order now", not hidden chain of thought. The guide says to define when they appear, how short they are, and when to skip them — [OpenAI voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting)
- Pacing: the playback speed parameter does not change speaking style. Use a "Pacing" prompt section, e.g. respond fast without sounding rushed — [OpenAI Realtime Prompting Guide cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide)
- Variety: the model follows sample phrases closely and may overuse them, which sounds robotic or repetitive. Add a repetition/variety rule (e.g. "Do not repeat the same sentence twice") — [cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide); [eWeek summary](https://www.eweek.com/news/openai-realtime-prompting-tips/)
- Unclear audio: give an explicit rule to ask for clarification with a short phrase ("Sorry, could you repeat that clearly?") and not to reuse the same clarification twice. Changing "inaudible" to "unintelligible" in the prompt noticeably improved handling of noisy input — [cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide); [OpenAI 7 tips PDF](https://cdn.openai.com/API/docs/realtime-prompting-guide.pdf)
- Language: pin the output language if you see unwanted switching — [cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide)
- Prompt style: short bullets over paragraphs. Small wording changes noticeably change behavior. Start minimal and add rules only for failing behaviors — [OpenAI voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting)
- ElevenLabs agent prompting guide (phone-support example): describe the environment ("assisting customers via phone"), keep replies to ~2–3 sentences unless troubleshooting needs more, and use brief affirmations like "Let me check that" — [ElevenLabs prompting guide](https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide)
- Spell out phone numbers, dates and times in speakable form ("one two three, four five six…") — [third-party ElevenLabs guide](https://promptomania.com/models/elevenlabs/elevenlabs-voice) (unofficial)
- Retell has a native backchannel feature (boolean), with backchannel frequency 0–1 (default 0.8). Backchannels show up more during longer user utterances — [Retell API](https://docs.retellai.com/api-references/update-agent). A third-party blog suggests frequency ~0.6 and interruption sensitivity ~0.85 (unverified) — [futureagi](https://futureagi.com/blog/how-to-optimize-retell-latency-2026/)
- Sesame's widely praised "voice presence" demo deliberately included breaths, chuckles, hesitations and self-corrections, and testers formed attachments to its personas. The "crossing the uncanny valley" framing is press opinion — [ISPR / ZDNET quote, Mar 2025](https://ispr.info/2025/03/04/masa-presence-sesame-ai-chatbot-is-crossing-the-uncanny-valley-of-conversational-voice/); [getcoai](https://getcoai.com/news/sesames-ai-voice-presence-creates-emotional-bonds-with-human-like-imperfections)

### Inferences
- The biggest "robotic" tell besides latency is a chatbot register: long, complete, polite paragraphs, enumerations, recapping the question, and identical confirmations every turn. The prompt should say explicitly:
  - This is a live phone call; reply in 1–2 short sentences, or a single clause where that's enough.
  - Never use lists, headings or markdown; read numbers the way a person says them aloud.
  - Use contractions and natural acknowledgments ("got it", "okay, so…"), and vary them.
  - Allow an occasional light filler ("um", "let me see") only before lookups, never in every turn.
  - Pin the output language per call (the callee's language), and switch only if the callee clearly switches.
- With `create_response=false` plus a speech gate, the gate controls when preambles can play. If the gate waits for full certainty before `response.create`, preambles can't mask the delay. Allowing a minimal-reasoning preamble response early (or a pre-recorded or cached 300–600 ms acknowledgment in the callee's language) during known-slow operations (tools, relaying to the user) will cut perceived latency.
- CallBridge relays between a non-native-speaker user and a callee, so "please hold, let me check with my client" moments are inherent. A natural hold phrase in the callee's language and register (e.g. Japanese keigo "少々お待ちください") is the human-sounding way to fill that gap.
- Make AI backchannels sparing during long callee turns (Retell's feature implies the market expects them). In a speech-to-speech setup this is hard to do without full duplex; a pre-rendered soft "mm-hm" injected during long callee monologues is a possible approach (inference, untested).

### Gaps
- No controlled study found on whether inserted "um"/"uh" fillers raise perceived human-likeness on phone calls specifically, versus hurting clarity.
- No official guidance on per-language speaking rates (words or syllables per second) for voice agents.
- The exact wording of OpenAI's gpt-realtime-2 preamble prompt template could not be retrieved (page blocked).

## 4. Telephony audio: 8 kHz μ-law, resampling, loudness, comfort noise / ambience and its ethics

### Takeaway
The PSTN is narrowband (~300–3400 Hz; ~200–3200 Hz nominal), so any wideband voice is cut down to G.711. Quality depends on doing that conversion once, with a proper anti-aliasing low-pass filter, or on having the model output `g711_ulaw` directly. Platforms offer office or call-center ambience presets, but vendors openly describe them as a way to reduce suspicion that the caller is talking to an AI. That conflicts with disclosure norms.

### Cited Findings
- Telephony expects 8 kHz μ-law or A-law. Generating that format directly avoids a lossy conversion step; anything higher is thrown away by downsampling — [Gradium telephony recipe](https://docs.gradium.ai/guides/recipes/telephony-audio.md); [Soniox TTS formats](https://soniox.com/wiki/tts-audio-formats)
- Common pipeline: 24 kHz PCM TTS → resample → μ-law 8 kHz for Twilio — [edesy voice-agent docs](https://edesy.in/docs/voice-agent/pipeline/audio-processing)
- TTS providers offer native `ulaw_8000` output for telephony — [KugelAudio formats](https://docs.kugelaudio.com/api-reference/tts/audio-formats)
- μ-law companding background: G.711 has historically been used for land-line switching — [CCRMA Stanford](https://ccrma.stanford.edu/~jos/examples/Mu_Law_Coding.html)
- Retell's speech settings support background sound presets (office, call center); one vendor guide suggests ~30% volume — [growwstacks](https://growwstacks.com/blog/make-voice-agent-sound-human-retell-ai-settings); [Retell settings help](https://help.chat-dash.com/articles/9635771-voice-settings-retell)
- Vapi has a "Background Sound" setting (office type) that users have found switched on unexpectedly; it can be turned off via the API — [Vapi support](https://support.vapi.ai/t/27563301/background-office-sounds)
- Dasha BlackBox documents ambient noise for agents posing as human customer-service reps and says it reduces suspicion of talking to an AI — [Dasha docs](https://blackbox.dasha.ai/docs/advanced-features/ambient-noise.md)
- ElevenLabs voice-design docs warn that descriptors like "phone", "reverb", "echo" or "tape" degrade output, so don't build a "phone-sounding" voice; let the line do that — [ElevenLabs Voice Design](https://elevenlabs.io/docs/eleven-creative/voices/voice-design)

### Inferences
- With OpenAI Realtime, set `output_audio_format`/`input_audio_format` to `g711_ulaw` (or the equivalent in the newer session schema) so there is no resampling on the Node bridge at all. If you resample from 24 kHz PCM, use a polyphase or windowed-sinc low-pass filter (cutoff ≈3.4–3.6 kHz) before decimating by 3, never naive sample-dropping, which aliases sibilants into a "robotic/metallic" sound.
- Avoid double transcoding (μ-law → PCM → μ-law) and clipping. Normalize model output to roughly -16 to -20 dBFS peaks-safe before μ-law to avoid hard clipping or overly quiet audio (a general audio-engineering inference; no voice-agent-specific source found).
- Silence between AI turns: injecting low-level comfort noise in place of digital-zero silence avoids the "line went dead" effect (inference; the G.711 comfort-noise practice was not sourced here).
- Ethics for CallBridge: the product acts openly on behalf of a user. Office ambience whose purpose is to make callees believe a human is calling is deception, and it conflicts with AI-disclosure rules in several jurisdictions (e.g. the US FCC's 2024 ruling that AI-generated voices in robocalls fall under TCPA, and California's bot-disclosure law). Those rules were not re-verified in this research and need a legal check. The recommended approach is to aim for naturalness (timing, register, prosody) while disclosing honestly, e.g. "Hi, I'm an AI assistant calling on behalf of …".

### Gaps
- No measured A/B study found comparing native g711_ulaw output vs. 24 kHz → 8 kHz resampled output from gpt-realtime over PSTN.
- No source found on loudness targets specific to Twilio outbound.
- No official Twilio/OpenAI guidance on ambience ethics. The regulatory specifics above come from background knowledge and need verification.

## 5. Voice choice and consistency

### Takeaway
Little rigorous public evidence was found. Practitioner guidance is to pick voices that keep their character in the 300–3400 Hz band and to keep one voice per call or persona. Test by ear on real PSTN calls, not on the web playground.

### Cited Findings
- Inworld publishes a 2026 ranking of TTS APIs for telephony phone agents (content not retrieved; vendor ranking) — [Inworld](https://inworld.ai/resources/best-voice-ai-for-ai-phone-agents)
- Don't describe a voice with telephony or effect terms ("phone", "tape") when designing it — [ElevenLabs Voice Design](https://elevenlabs.io/docs/eleven-creative/voices/voice-design)
- The Realtime model follows sample phrases closely, which keeps it on-brand but risks repetition. Set the persona/tone in a dedicated "Personality & Tone" section — [OpenAI cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide)

### Inferences
- Over narrowband, voices whose identity sits in low-mid formants with moderate brightness and expressive (not flat) prosody usually survive better. Breathy or very bright voices lose their character above 3.4 kHz. This is general audio reasoning and needs listening tests on actual Twilio calls per language.
- In OpenAI Realtime the voice cannot be changed after the first audio in a session. Pick it per target language and locale (some voices sound more native in some languages) and keep it fixed for the call.

### Gaps
- No independent study found on which OpenAI Realtime voices (e.g. marin, cedar) sound most natural over G.711 per language.
- No data found on Mandarin, Japanese or Tagalog native-speaker naturalness ratings for gpt-realtime voices.

## 6. Concrete builder tips and an impact-ranked list for CallBridge

### Takeaway
Across OpenAI, Retell, ElevenLabs, LiveKit, AssemblyAI and Twilio material, the same levers recur: latency/endpointing, semantic interruption handling (ignoring backchannels), short varied spoken-register replies, preambles or fillers during waits, and clean audio. Each is configurable in CallBridge's existing stack.

### Cited Findings
- OpenAI: pacing via prompt; variety/repetition rules; unclear-audio rules; language pinning; short bullet-style prompts; iterate minimally — [cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide); [voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting)
- OpenAI gpt-realtime-2: preambles, audible tool narration and recovery, reasoning-effort dial (default low) — [Agora](https://prod.agora.io/en/blog/gpt-realtime-2-is-here-and-preambles-change-how-voice-agents-feel); [DataCamp](https://www.datacamp.com/blog/gpt-realtime-2)
- Retell: backchannel on/frequency, interruption sensitivity, responsiveness, dynamic wait time adapted to speaker pace, ambient sound — [Retell API](https://docs.retellai.com/api-references/update-agent); [Retell flow settings](https://docs.retellai.com/build/conversation-flow/global-setting)
- ElevenLabs: phone environment in the prompt, 2–3 sentence replies, "Let me check that" affirmations — [ElevenLabs prompting guide](https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide)
- AssemblyAI/LiveKit/Twilio: semantic barge-in gating, ignore backchannels, end-of-turn thresholds — [AssemblyAI](https://assemblyai.com/docs/voice-agents/voice-agent-api/turn-detection-and-interruptions); [LiveKit](https://docs.livekit.io/agents/logic/turns/adaptive-interruption-handling.md); [Twilio](https://www.twilio.com/en-us/blog/insights/ai-voice-agent-interruption-handling)
- Measure p95, not averages, and separate out jitter — [Coval](https://www.coval.dev/blog/voice-ai-latency)

### Inferences
Impact-ranked list for CallBridge (synthesis; the ranking is judgment, not measured):

1. **Turn gap / latency (highest).** Target p50 <800 ms and p95 <1.2 s voice-to-voice at the bridge. Shorten the speech gate's added wait, set semantic_vad eagerness to medium, co-locate with the Twilio media region, stream 20 ms frames immediately, and avoid noise_reduction-induced drift. Gaps of 700 ms or more read as reluctance or trouble (Kendrick & Torreira; Roberts et al.).
2. **No false cutoffs and no false barge-ins.** Ignore backchannels using per-language lists plus a minimum duration or word count. Cancel optimistically rather than gating. Log every overlap decision. Japanese aizuchi and Mandarin 嗯 are high-frequency risks.
3. **Phone register in the prompt.** Use 1–2 sentence turns, no lists or markdown, contractions, a variety rule, spoken numbers, a language pin per call, and short clarification phrases that are never repeated.
4. **Fill the waits.** Use gpt-realtime-2 preambles or brief acknowledgments in the callee's language before tool calls or while waiting for the user. Never leave more than ~1 s of dead air without a hold phrase.
5. **Audio path hygiene.** Use native g711_ulaw I/O (no resampling), or a proper low-pass resampler. Do no double transcoding, normalize levels without clipping, and use clean truncation on barge-in (`conversation.item.truncate` at the actual played-out position, tracked from Twilio `mark` events).
6. **Prosody and pacing.** Use a pacing instruction that is a bit brisker than chatbot default, with a warm, matter-of-fact tone; allow light hesitations before lookups.
7. **Voice choice.** Pick per language, test over real PSTN, and keep it fixed per call.
8. **Ambience (lowest; ethically fraught).** Background office noise is a vendor-supported "trust" trick explicitly meant to hide AI-ness. For a product that represents a user, honest disclosure plus natural timing is the better route.

### Gaps
- Sierra, Decagon and Bland-specific naturalness guidance was not retrieved within the search budget.
- No Hacker News or Reddit practitioner threads were captured.
- Nothing specific to "gpt-realtime-2.1" was found. Whether 2.1 changes VAD, preamble or voice options is unknown.
