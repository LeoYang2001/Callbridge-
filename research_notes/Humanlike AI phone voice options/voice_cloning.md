# Voice cloning for real-time conversational phone agents (self-clone, cross-lingual), as of Oct 2026

Research method note: Web search worked, but direct fetches of almost every primary domain failed with DNS errors (developers.openai.com, docs.cloud.google.com, learn.microsoft.com, elevenlabs.io, marktechpost.com, thenewstack.io). Most findings below therefore rest on search-result summaries of primary pages plus secondary and vendor blogs. Items marked **[unverified]** could not be checked against a primary page. Vendor latency and quality numbers are vendor-stated unless noted.

## 1. Which providers offer instant and professional cloning usable in low-latency streaming?

### Takeaway
Almost every major real-time TTS vendor now offers self-serve instant cloning from about 3 to 30 seconds of audio: ElevenLabs IVC, Cartesia, Inworld, MiniMax, Fish Audio, Hume Octave, Google Chirp 3 Instant Custom Voice, plus open-source Chatterbox. Professional (fine-tuned) cloning is mainly offered by ElevenLabs PVC and Cartesia Pro. OpenAI recorded custom voices and Azure Personal Voice are still gated, sales-led or limited-access offerings. For an app serving consumers, the realistic self-serve candidates are ElevenLabs, Cartesia, Inworld, Fish, MiniMax, Hume and Google.

### Cited Findings

**ElevenLabs**
- IVC is available from the Starter plan ($6/mo). PVC needs Creator ($22/mo) or higher. Credits: Starter 30k, Creator 121k, Pro 600k, Scale 1.8M, Business 6M. Scale and Business allow 3 and 10 PVC clones respectively — [Magichour](https://magichour.ai/blog/elevenlabs-pricing); [Gradually.ai](https://www.gradually.ai/en/elevenlabs-pricing/); [Flexprice](https://flexprice.io/blog/elevenlabs-pricing-breakdown). Dupple lists different prices ($5 Starter, $330 Scale), probably older or annual pricing — [Dupple](https://dupple.com/pricing/elevenlabs).
- IVC uses a sub-minute sample, and about 1 minute gives a strong clone. PVC uses roughly 3–6 hours of audio according to one review, which I could not confirm against ElevenLabs docs — [Coval review](https://www.coval.ai/blog/elevenlabs-review-2026-voice-cloning-and-synthesis-capabilities-explained/). ElevenLabs' PVC guide gives the training model as `eleven_multilingual_v2` — [ElevenLabs PVC quickstart](https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning).
- One comparison says ElevenLabs asks for about 30 s of audio and Cartesia about 3 s — [apiscout](https://apiscout.dev/guides/elevenlabs-vs-cartesia-voice-ai-api-2026).

**Cartesia (Sonic / Sonic 3)**
- Cartesia claims an instant clone from a 3-second clip. Its Sonic page says 10 seconds. It says the clone "keeps your unique accent" and can be localized into 44 languages — [Cartesia voice cloning](https://cartesia.ai/product/voice-cloning); [Cartesia Sonic](https://www.cartesia.ai/sonic). A third party says Sonic-3 supports 42 languages — [VIPS overview](https://learn.engineering.vips.edu/ai-models/cartesia-sonic).
- Pro Voice Cloning is offered on the Startup plan and up, billed at a higher credit rate. Source is third-party — [vantaige](https://vantaige.io/ai-tool/cartesia-ai).
- Cartesia can stream `pcm_mulaw` at 8 kHz directly to Twilio — [apiscout](https://apiscout.dev/guides/elevenlabs-vs-cartesia-voice-ai-api-2026).

**Inworld TTS**
- Instant clones work from 3 s of audio, and samples up to 30 s improve similarity. Cloning is free. Realtime TTS-2 lists at $25/1M chars, and the Flash tier at $15, falling to $7 with volume. Inworld self-reports sub-250 ms (TTS 1.5 Max) and sub-130 ms (Mini) latency. It claims 15 languages in its top quality tier and 200+ languages and locales overall — [Inworld best voice cloning API](https://inworld.ai/resources/best-voice-cloning-api); [Inworld 2026 TTS benchmarks](https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks). These are vendor pages.

**MiniMax (Speech / Turbo)**
- Cloning needs about 10 s of audio. Unused cloned voices are deleted after 7 days. Turbo runs under 250 ms and supports 40+ languages. MiniMax is known for strong Chinese — [Bitdoze Fish vs MiniMax](https://www.bitdoze.com/fish-audio-vs-minimax/); [IqraAI TTS providers](https://mintlify.com/abdofallah/IqraAI/integrations/tts-providers).

**Fish Audio (S2 / S2.1 Pro)**
- Clones from about 10 s of audio. Latency is cited at roughly 100–200 ms. S2.1 Pro covers 83 languages. Billing is per byte, so CJK text costs about 3x more per character. The open weights are free for research only, and commercial use needs a paid license — [Bitdoze](https://www.bitdoze.com/fish-audio-vs-minimax/); [Inworld vs Fish](https://inworld.ai/vs/fish-audio-vs-inworld). This is a vendor-adjacent source.

**Rime**
- Sources conflict on whether Rime offers cloning at all. I found no reliable latency or language figures — [versusref Rime alternatives](https://www.versusref.com/tts/alternatives/rime/).

**Hume Octave 2**
- Octave 2 covers 11 languages: Arabic, English, French, German, Hindi, Italian, Japanese, Korean, Portuguese, Russian and Spanish. That list has no Mandarin and no Tagalog. Hume claims generation in under 200 ms, and it is labelled a preview — [Hume Octave 2 launch](https://hume.ai/blog/octave-2-launch); [aiwiki](https://www.aiwiki.ai/wiki/hume_octave_2).
- Cloning reportedly works from about 15 s of audio and is available on all plans including free, "as long as consent is given". These sources are secondary and low authority — [ToolQuestor](https://toolquestor.com/tool/hume-ai).

**Google Chirp 3: Instant Custom Voice**
- Takes up to 10 s of reference audio with no background noise, plus a separate consent recording of up to 10 s, made in the same environment. A project can create up to 10 voice-cloning keys per minute — [Google Cloud docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice).
- The New Stack reports that Google made Gemini TTS voice replication self-serve, unlike OpenAI's sales-gated custom voices. I could not fetch the article for details — [The New Stack](https://thenewstack.io/gemini-tts-voice-replication-api/).

**OpenAI**
- Recorded custom voices are "limited to eligible customers" and require contacting sales. They need a fixed-script consent recording ("I am the owner of this voice and I consent to OpenAI using this voice to create…"). The sample can be at most 30 s, and secondary sources give a cap of 20 custom voices per org. The resulting voice ID works across the speech endpoint, Realtime API and Chat Completions — [OpenAI custom voices guide](https://developers.openai.com/api/docs/guides/custom-voices) (via search snippet); [OpenAI dev community](https://community.openai.com/t/custom-voices-in-the-api-not-available/1377611); [openaifm.org](https://www.openaifm.org/openai-tts-custom-voice).
- On Oct 16, 2026, OpenAI opened prompt-designed voices (made from a text description, not cloned) to all API customers. These run only in GPT-Live and need no consent recording. Each org can keep 100 — [Digital Applied](https://www.digitalapplied.com/blog/openai-prompt-to-voice-custom-gpt-live-voices); [Rime on GPT-Live](https://www.rime.ai/resources/openai-gpt-live-api-capabilities-limits-and-alternatives).
- OpenAI's usage rules for custom voices: no impersonation, no children's voices, and listeners must be told the speech is AI-generated — [OpenAI custom voices guide](https://developers.openai.com/api/docs/guides/custom-voices) (via search snippet).

**Azure Personal Voice**
- Personal Voice is limited access, "restricted to eligible customers and approved use cases". Microsoft's examples include voice assistants, game characters, and film/TV/video dubbing, and the output must not be publishable or shareable from the application. The speaker must record a verbal consent statement that names the resource owner. Templates for each locale are in Microsoft's `verbal-statement-all-locales.txt` on GitHub — [Microsoft Learn: Personal voice overview](https://learn.microsoft.com/azure/ai-services/speech-service/personal-voice-overview); [Microsoft Learn: create consent](https://learn.microsoft.com/el-gr/azure/ai-services/speech-service/personal-voice-create-consent).
- Microsoft says a personal voice can speak 91 languages across 100+ locales, with sentence-level language detection — [Microsoft Learn](https://learn.microsoft.com/en-my/Azure/ai-services/speech-service/personal-voice-overview).

**PlayHT**
- PlayHT was one of the four services Consumer Reports rated as having weak, checkbox-only safeguards in March 2025 — [Consumer Reports](https://innovation.consumerreports.org/new-report-do-these-6-ai-voice-cloning-companies-do-enough-to-prevent-misuse/). I found no 2026 information on PlayHT.

**Open source**
- Chatterbox Multilingual (Resemble AI) is MIT-licensed and does zero-shot cloning from about 5–10 s of audio. It supports 23 languages, or 25 (21 languages plus 4 dialects) in the June 2026 v3 release. It has emotion/exaggeration control and adds the PerTh watermark by default — [MarkTechPost 2025](https://www.marktechpost.com/2025/09/05/meet-chatterbox-multilingual-an-open-source-zero-shot-text-to-speech-tts-multilingual-model-with-emotion-control-and-watermarking/); [LocalAIMaster](https://localaimaster.com/blog/chatterbox-multilingual-v3).
- Qwen3-TTS (Jan 2026) evaluates zh→en and en→zh cross-lingual cloning and reports reduced accent drift — [Qwen3-TTS Technical Report](https://arxiv.org/pdf/2601.15621). Cross-Lingual F5-TTS 2 (Sept 2026) — [arXiv](https://arxiv.org/pdf/2609.15184). X-Voice (30 languages, zero-shot cross-lingual) — [arXiv](https://arxiv.org/html/2605.05611).
- A roundup of open models is at [ocdevel](https://ocdevel.com/blog/20250720-tts) and [LocalAIMaster local voice clone test](https://localaimaster.com/blog/local-ai-voice-clone).

### Inferences
- OpenAI recorded custom voices and Azure Personal Voice are effectively unavailable to an early-stage consumer app without an enterprise or approval relationship. Azure's "approved use cases" also don't obviously cover outbound phone calls to third parties.
- Instant cloning from about 10–30 s of clean audio is the practical default for onboarding. ElevenLabs PVC is the main path to "pro" quality. It takes more audio and a verification step, but it is still self-serve.

### Gaps
- Rime's cloning offering, Cartesia's official consent mechanism and ToS text, and Google's exact Chirp 3 language list could not be verified.
- No primary confirmation of Hume's consent mechanism, Google's allowlist status, or current pricing for Google, Hume, MiniMax and Cartesia cloning.
- From memory, not verified: Azure Personal Voice access was historically gated by a Limited Access application. Older open models such as XTTS-v2 (Coqui, non-commercial CPML license, company shut down) and CosyVoice 2/3 (Alibaba, strong zh/en/ja) exist. This round found no current sources on either.

## 2. Cross-lingual cloning: can a Mandarin speaker's clone speak natural English, Japanese, Tagalog or Spanish? Does it keep the accent? How does it hold up at 8 kHz?

### Takeaway
Yes, technically. Most multilingual vendors (ElevenLabs, Cartesia, Azure, Google within limited locales, Fish, MiniMax) let one clone speak many languages. But "accent leakage", where the source language's phonetics carry into the target language, is the main documented failure mode. It is a direct trade-off: higher speaker similarity tends to mean more of the user's accent. Tagalog is the hardest of the target languages: only ElevenLabs clearly advertises Filipino. I found no published test of cloned voices after 8 kHz μ-law, so CallBridge must test this itself.

### Cited Findings
- Accent leakage is the main failure mode of cross-lingual voice cloning: "phonetic characteristics of the source language persist in the generated speech". The KIT IWSLT 2026 submission uses language-tag prompting to reduce it — [KIT IWSLT 2026, arXiv](https://arxiv.org/html/2606.07240v1).
- Speaker-similarity (SIM) scores can reward accent copying: "higher SIM can also reflect stronger source-accent copying" — [Region-Aware Masking for Accent-Robust Cross-Lingual TTS, arXiv 2610.07524](https://arxiv.org/html/2610.07524). Related work on trading similarity against accent: [Accent Analogy Guidance](https://huggingface.co/papers/2609.29123); [CrossAccent-TTS (accent-intensity control)](https://arxiv.org/pdf/2606.25403).
- A Google patent on multilingual voice cloning found that English-speaking raters judged "heavy accented" synthetic Mandarin as *more similar* to the target English speaker than fluent output. In other words, listeners perceive accent as part of identity — [USPTO patent 11580952](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11580952).
- Qwen3-TTS reports gains on zh→en with "reduced accent drift", but measures with WER/CER rather than a direct accent metric — [Qwen3-TTS report](https://arxiv.org/pdf/2601.15621).
- ElevenLabs says a PVC clone "can automatically speak all the languages" of its multilingual model (original launch post, older) — [ElevenLabs blog](https://elevenlabs.io/blog/create-a-perfect-digital-copy-of-your-voice-and-speak-the-languages-you-dont). It advertises Filipino TTS and cloning — [ElevenLabs Filipino](https://elevenlabs.io/languages/filipino).
- A third-party help article (DeepBrain, which uses ElevenLabs) says accent capture is imperfect for non-native English speakers, and that ElevenLabs accent data covers only US/UK/AU/CA English. It recommends PVC to preserve an accent — [DeepBrain help](https://help.deepbrain.io/en/articles/10348480-why-is-my-accent-not-being-captured-in-my-voice-clone).
- Cartesia markets cloning that "keeps your unique accent" and can be localized into 44 languages. Localize is a feature that re-voices a clone with a target-language accent — [Cartesia](https://cartesia.ai/product/voice-cloning); [Cartesia Sonic](https://www.cartesia.ai/sonic).
- Google Chirp 3 Instant Custom Voice: an en-US voice-cloning key can synthesize de-DE, es-US, es-ES, fr-CA, fr-FR and pt-BR. Cross-lingual output is limited to listed locale pairs, and I could not confirm whether zh-CN keys are supported — [Google docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice).
- Azure Personal Voice covers 91 languages / 100+ locales from one consented voice — [Microsoft Learn](https://learn.microsoft.com/en-my/Azure/ai-services/speech-service/personal-voice-overview).
- Hume Octave 2 does not list Mandarin or Tagalog among its 11 languages — [Hume](https://hume.ai/blog/octave-2-launch).
- PSTN audio is 8 kHz mono G.711 μ-law, and TTS "that sounds great in a browser may sound robotic over a phone". Native 8 kHz μ-law output is preferred over resampling, which adds latency and quality loss — [Inworld: TTS for AI phone agents](https://inworld.ai/resources/best-voice-ai-for-ai-phone-agents). This is vendor-authored.
- No source found directly tests cloned-voice similarity after 8 kHz μ-law compression — (search result: [Cartesia vs ElevenLabs roundups](https://www.autointerviewai.com/blog/cartesia-vs-elevenlabs-tts-voice-agents-2026)).

### Inferences
- For CallBridge there is a product choice to make. Either keep the user's Mandarin-accented English, which sounds more like "them" but may hurt comprehension for the callee, or neutralize it with Cartesia Localize, accent-intensity controls, or language tags. A per-user "accent strength" setting may be worth exposing.
- Expect strong output in English, Spanish and Japanese from most top vendors. Tagalog support is thin: only ElevenLabs is confirmed, so CallBridge may need a stock Tagalog voice fallback.
- At 8 kHz, energy above 4 kHz is lost, and much of what makes a timbre distinctive (sibilance, breathiness) goes with it. The clone's "sounds like me" benefit is therefore likely reduced on the phone. This is inference, not measured.

### Gaps
- No independent, published Mandarin→English, Japanese or Tagalog listening test of commercial clones was found.
- No measured clone quality at 8 kHz μ-law.
- Tagalog support for Azure, Cartesia, MiniMax, Fish and Inworld could not be confirmed.

## 3. Consent, verification, prohibited uses, watermarking

### Takeaway
Consent gating ranges from a checkbox (ElevenLabs IVC and, historically, PlayHT, Speechify and Lovo) to spoken fixed-script consent (OpenAI, Google Chirp 3, Azure, Descript) to read-aloud captcha verification (ElevenLabs PVC). Self-cloning fits every provider's consent model. The main policy risks for CallBridge are (a) outbound-call and robocall rules (FCC/TCPA) and (b) disclosure duties, which CallBridge's opening AI disclosure already addresses.

### Cited Findings
- **Consumer Reports (Mar 2025):** of 6 services, 4 (ElevenLabs, Speechify, PlayHT, Lovo) required only a checkbox or self-attestation of rights. Descript was strongest: the user must record a specific consent statement. Resemble required real-time recording, but testers beat it by playing back audio. CR called for technical consent verification — [Consumer Reports](https://innovation.consumerreports.org/new-report-do-these-6-ai-voice-cloning-companies-do-enough-to-prevent-misuse/); [The Register](https://www.theregister.com/2025/03/10/ai_voice_cloning_safeguards/); [NBC News](https://www.nbcnews.com/tech/security/ai-voice-cloning-software-flimsy-guardrails-report-finds-rcna195131).
- **ElevenLabs PVC:** a verification step is required before training. The owner reads a captcha text aloud and submits the recording. Manual review exists only when that fails or is impossible (e.g. visual impairment) — [ElevenLabs PVC quickstart](https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning); the original launch said the text must be read within 10 s — [ElevenLabs blog (older)](https://elevenlabs.io/blog/create-a-perfect-digital-copy-of-your-voice-and-speak-the-languages-you-dont).
- **ElevenLabs IVC:** the user confirms rights and consent, a self-attestation — [Marga Bagus (secondary)](https://margabagus.com/elevenlabs-voice-consent-policy/).
- **ElevenLabs Prohibited Use Policy:** bans "cloning, synthesizing, or impersonating the voice, identity, or likeness of any living individual without their explicit and informed consent", content resembling real minors, impersonating candidates or officials (even with authorization, per secondary source), and evading voice-verification guardrails — [ElevenLabs Use Policy](https://elevenlabs.io/use-policy) (partially retrieved via search); [Marga Bagus](https://margabagus.com/elevenlabs-voice-cloning-consent/). A secondary guide lists "unauthorized robocalling" as prohibited. Not confirmed in the official text — [techjacksolutions](https://techjacksolutions.com/ai-tools/elevenlabs/elevenlabs-voice-cloning/).
- **OpenAI:** fixed-script consent recording, no impersonation, no children's voices, and the AI-generated speech must be disclosed — [OpenAI guide](https://developers.openai.com/api/docs/guides/custom-voices) (snippet).
- **Google Chirp 3:** fixed-script consent statement per language, recorded in that language. A custom script cannot replace it — [Google docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice).
- **Azure:** recorded verbal consent naming the resource owner, a limited-access approval, and the Code of Conduct — [Microsoft Learn](https://learn.microsoft.com/azure/ai-services/speech-service/personal-voice-overview); [Code of conduct](https://learn.microsoft.com/ko-kr/legal/cognitive-services/speech-service/text-to-speech/code-of-conduct).
- **Watermarking:** Resemble's PerTh watermark is on by default in Chatterbox. Resemble claims it survives MP3/Opus, telephony codecs, clipping and resampling, and an open-source detector is provided — [MarkTechPost](https://www.marktechpost.com/2025/09/05/meet-chatterbox-multilingual-an-open-source-zero-shot-text-to-speech-tts-multilingual-model-with-emotion-control-and-watermarking/); [Chatterbox guide](https://tech-now.io/en/blogs/chatterbox-multilingual-open-source-zero-shot-tts/).
- **US law, FCC Feb 8 2024 declaratory ruling:** AI-generated (including cloned) voices are "artificial" under the TCPA. Calls need prior express consent (written consent for telemarketing), absent an emergency purpose or exemption. Callers must identify the party responsible for the call — [FCC](https://www.fcc.gov/document/fcc-makes-ai-generated-voices-robocalls-illegal); [Wiley](https://wiley.law/alert-FCC-Extends-Regulatory-Reach-Over-AI-Announces-TCPA-Restrictions-Cover-AI-Generated-Voices-in-Outbound-Calls). A pending FCC proposal would require on-call AI disclosure, timing uncertain — [Retell TCPA playbook](https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound).
- **State laws:** Texas SB 140 reportedly requires AI-voice disclosure within the first 30 s of a call. Tennessee's ELVIS Act requires written consent to reproduce a real person's voice. Both are from secondary sources — [Retell](https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound); [discloseai](https://discloseai.net/use-cases/ai-voice-cloning-customer-calls).
- A blog reports a July 2026 CFA and UCLA Law complaint against Speechify over weak safeguards. Not independently verified — [futureagi](https://futureagi.com/blog/voice-cloning-safety-brand-voice-2026/).

### Inferences
- CallBridge's calls are user-initiated, one-to-one calls to businesses or individuals on the user's behalf, not mass robocalls. Whether TCPA "prior express consent" from the *callee* applies to such calls with an AI voice is a legal question for counsel. The FCC ruling covers "artificial voice" calls broadly.
- Best practice that also beats CR's critique: require an in-app spoken consent script recorded live (a randomized captcha-style phrase) and match its speaker embedding to the clone sample. Store the consent audio. Restrict clones to the account owner's own calls. Keep the opening AI disclosure, which should state that the voice is AI-generated, not just that an AI is calling.

### Gaps
- Cartesia, Inworld, MiniMax, Fish and Hume consent and ToS texts were not retrievable. I can't say whether any of them explicitly prohibits outbound calling with clones.
- Whether ElevenLabs, Cartesia or Google watermark streamed output (e.g. Google SynthID on Chirp 3) was not verified.

## 4. Practical recording requirements and costs

### Takeaway
Instant cloning needs 3–30 s of clean, single-speaker audio (10 s is common). Pro cloning needs from about 30 min up to several hours. Consent scripts are a separate ≤10–30 s recording. Cloning itself is often free or bundled; the cost is per-character TTS.

### Cited Findings
- Google: ≤10 s reference and ≤10 s consent, single channel, no background noise, same environment, recorded with a computer mic — [Google docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-instant-custom-voice).
- OpenAI: consent plus a sample of at most 30 s — [openaifm.org](https://www.openaifm.org/openai-tts-custom-voice).
- Inworld: 3 s minimum, up to 30 s improves results, cloning free, TTS $7–25/1M chars — [Inworld](https://inworld.ai/resources/best-voice-cloning-api).
- Cartesia: 3–10 s for instant cloning — [Cartesia](https://cartesia.ai/product/voice-cloning).
- MiniMax: about 10 s, and voices auto-delete after 7 days unused — [Bitdoze](https://www.bitdoze.com/fish-audio-vs-minimax/).
- Fish: about 10 s, per-byte billing that makes CJK about 3x the cost — [Bitdoze](https://www.bitdoze.com/fish-audio-vs-minimax/).
- ElevenLabs: IVC is sub-minute (1 min recommended), from $6/mo. PVC needs Creator at $22/mo, and one review gives 3–6 h of audio (unverified) — [Magichour](https://magichour.ai/blog/elevenlabs-pricing); [Coval](https://www.coval.ai/blog/elevenlabs-review-2026-voice-cloning-and-synthesis-capabilities-explained/).
- Hume: about 15 s — [ToolQuestor](https://toolquestor.com/tool/hume-ai).
- Chatterbox: 5–10 s, free and MIT, self-hosted GPU cost — [Kno2gether](https://guides.kno2gether.com/voice-clone-you-own/).

### Inferences
- An onboarding flow of about 60 s of read script plus a spoken consent line would satisfy most instant-clone APIs. Recording in Mandarin vs English matters. Recording an English sample, if the user can, likely gives better English output. Recording in Mandarin preserves identity but raises accent-leakage risk.

### Gaps
- ElevenLabs' official PVC minimum is not verified. From memory, docs have said a 30 min minimum with 1–3 h ideal; the 3–6 h figure is from one review.
- No current official pricing pages could be fetched.

## 5. Real-time latency with cloned vs stock voices

### Takeaway
Vendors quote the same model latency for cloned and stock voices on instant clones. Reported time-to-first-audio is about 40–90 ms (Cartesia Sonic), about 75 ms (ElevenLabs Flash), and about 100–250 ms (Inworld, MiniMax, Fish, Hume). No independent source measured a cloned-vs-stock latency penalty. Professional or fine-tuned clones may be limited to certain (slower) models.

### Cited Findings
- ElevenLabs Flash is about 75 ms TTFA. Larger models are 300 ms+. One benchmark measured 199 ms (ElevenLabs) vs 832 ms (Cartesia, self-serve tier; about 300 ms on enterprise). These numbers conflict across sources — [apiscout](https://apiscout.dev/guides/elevenlabs-vs-cartesia-voice-ai-api-2026); [autointerviewai](https://www.autointerviewai.com/blog/cartesia-vs-elevenlabs-tts-voice-agents-2026).
- Cartesia Sonic is about 40–90 ms, and Sonic 3 Turbo about 40 ms. These are vendor and secondary figures — [Cartesia vs pages](https://www.cartesia.ai/vs/elevenlabs-vs-resemble); [autointerviewai](https://www.autointerviewai.com/blog/cartesia-vs-elevenlabs-tts-voice-agents-2026).
- Coval warns that vendor TTS benchmarks are unreliable and recommends testing in your own pipeline — [Coval](https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/).
- ElevenLabs PVC trains against `eleven_multilingual_v2` — [ElevenLabs PVC quickstart](https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/professional-voice-cloning).

### Inferences
- If PVC voices are bound to Multilingual v2 rather than Flash, the "pro" clone may cost 200+ ms extra per turn versus an IVC on Flash. Verify before choosing PVC for live calls.

### Gaps
- No independent measurement of cloned vs stock latency was found. Whether ElevenLabs PVC voices run on Flash v2.5 or v3 conversational models was not confirmed.

## 6. How other products let users call in their own voice, and their safeguards

### Takeaway
I found no well-documented consumer product in this search that places outbound calls in the user's own cloned voice. The documented safeguards come from vendor policies and regulation rather than product write-ups.

### Cited Findings
- Search for "AI calls on your behalf in your own cloned voice" (Pine, Google Duplex, Delphi, ElevenLabs agents) surfaced only general compliance guidance, not product-specific safeguard documentation — [futureagi](https://futureagi.com/blog/voice-cloning-safety-brand-voice-2026/); [discloseai](https://discloseai.net/use-cases/ai-voice-cloning-customer-calls).
- The compliance guidance common across sources: get written consent scoped to the use, keep records, and disclose AI in calls, IVR and voice assistants — [magichour](https://magichour.ai/blog/ai-voice-cloning-laws-and-ethics); [anyvoice](https://anyvoice.io/blog/is-ai-voice-cloning-legal).
- Descript's spoken-consent approach is the benchmark Consumer Reports singled out — [Consumer Reports](https://innovation.consumerreports.org/new-report-do-these-6-ai-voice-cloning-companies-do-enough-to-prevent-misuse/).

### Inferences
- CallBridge would be relatively novel here. Combining an upfront AI disclosure, owner-only voice use, live spoken consent, and storing consent audio would put it at or above the safeguard level of the best providers.

### Gaps
- Delphi's voice cloning and consent flow, Google Duplex (which used stock voices and disclosure), Pine AI, and ElevenLabs Agents with cloned voices on Twilio were not documented in the results. These need a direct follow-up.
- From memory, not verified: Google Duplex introduced self-identification ("this is Google's automated booking service") after 2018 backlash and used stock voices.
