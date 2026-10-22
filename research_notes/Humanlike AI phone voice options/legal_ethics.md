# Legal and Ethical Constraints on AI-Voiced Outbound Calls (US, as of October 2026)

> Scope: CallBridge places one-off calls that the user starts, on the user's behalf (bookings, questions, messages to friends). It does no telemarketing. The AI says it is an AI at the start of each call, and policy forbids it from claiming to be human. The question is whether the voice can sound much more human, or be a clone of the user's own voice.
>
> **This is not legal advice.**
>
> **Method caveat:** WebFetch and curl could not reach primary sources in this environment. Every attempt to fetch fcc.gov, govinfo.gov, ecfr.gov, leginfo.legislature.ca.gov, law.cornell.edu, law-firm sites and elevenlabs.io failed with DNS or proxy 403 errors. The findings below therefore rest on search-engine summaries of the pages linked. Primary-source links are given where search surfaced them. Many secondary sources are vendor compliance blogs; they are flagged as such and are less reliable. Before relying on any specific wording, check it against the primary text.

## 1. FCC Feb 2024 Declaratory Ruling, TCPA consent and identification rules, and later FCC rulemaking

### Takeaway
**Enacted (binding FCC interpretation since Feb 8, 2024):** AI-generated voices, including cloned voices, are "artificial" voices under the TCPA. Calls placed with them therefore carry the TCPA's artificial/prerecorded-voice rules:
- prior express consent for calls to cell phones and (with exemptions) residential lines;
- caller identification at the start of the message;
- opt-out mechanisms for telemarketing.

**Proposed only:** The FCC's 2024 AI-call NPRM (FCC 24-84) would define "AI-generated call" and require AI disclosure at consent and at the start of each call. It is still proposed as of Oct 2026 and has no final rule. Since McLaughlin v. McKesson (June 2025), federal district courts are not bound by FCC interpretations such as the 2024 ruling.

For CallBridge the biggest open TCPA question is calls to individuals' **cell phones** (e.g., "relay a message to a friend"). Those need the called party's prior express consent unless an exception applies, even for one non-marketing call.

### Cited Findings
**The February 2024 Declaratory Ruling (FCC 24-17)**
- The FCC adopted a Declaratory Ruling on Feb 8, 2024. It holds that AI-generated voices fall within "artificial" under the TCPA, and this covers "voice cloning and other similar technologies that emulate real or artificially created human voices." — [FCC news release](https://www.fcc.gov/document/fcc-makes-ai-generated-voices-robocalls-illegal); [Wilson Sonsini](https://www.wsgr.com/en/insights/fcc-rules-ai-generated-voices-are-artificial-under-the-tcpa.html); [McDermott](https://www.mcdermottlaw.com/insights/fcc-requires-consent-for-ai-generated-cloned-voice-calls/)
- The ruling says its scope covers "current AI technologies that resemble human voices." It applies to any AI technology that initiates an outbound call to consumers using an artificial or prerecorded voice. It is consistent with the FCC's earlier Soundboard Ruling that the TCPA applies to any call initiated with an artificial or prerecorded voice message. — [Locke Lord/Troutman alert](https://www.troutman.com/newsandevents/publications/2024/02/ai-generated-phone-calls-under-tcpa); [Locke Lord](https://lockelord.com/newsandevents/publications/2024/02/ai-generated-phone-calls-under-tcpa)
- The ruling clarified existing rules rather than creating new ones (Cooley: it was "clarifying" and "confirming"). Wiley stresses that such calls are "now clearly regulated – but it is not 'illegal' per se." — [Cooley](https://www.cooley.com/news/insight/2024/2024-02-15-fcc-ai-generated-robocalls-illegal-under-the-tcpa); [Wiley](https://www.wiley.law/alert-FCC-Extends-Regulatory-Reach-Over-AI-Announces-TCPA-Restrictions-Cover-AI-Generated-Voices-in-Outbound-Calls); [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2024/02/fcc-declares-authority-and-intent-to-regulate-ai-generated-calls-under-the-tcpa)

**Consent and identification**
- **Consent:** AI-voice calls need prior express consent from the called party, unless the call is for an emergency purpose or falls under an exemption. Prior express consent covers non-telemarketing calls to wireless numbers using an artificial or prerecorded voice. Telemarketing to wireless numbers needs prior express *written* consent. — [Locke Lord](https://lockelord.com/newsandevents/publications/2024/02/ai-generated-phone-calls-under-tcpa); [Steptoe](https://www.steptoe.com/en/news-publications/steptechtoe-blog/fcc-bans-robocalls-using-ai-generated-voices.html)
- **Identification and opt-out:** Artificial or prerecorded voice messages must identify and disclose the entity initiating the call (47 CFR 64.1200(b)). Advertising and telemarketing calls must also offer an opt-out. — [Steptoe](https://www.steptoe.com/en/news-publications/steptechtoe-blog/fcc-bans-robocalls-using-ai-generated-voices.html); [Twilio blog on the ruling](https://www.twilio.com/en-us/blog/fcc-ruling-ai-generated-voices-robocalls) (Twilio: customers "must obtain prior express consent of the called party to initiate such calls and strictly adhere to TCPA regulations, including providing caller identification and disclosing the responsible entity.")

**The 2024 NPRM (FCC 24-84, CG Docket 23-362) — PROPOSED, not enacted**
- The NPRM was released Aug 7, 2024 and published in the Federal Register on Sept 10, 2024. Comments were due Oct 10, 2024 and reply comments Oct 25, 2024. — [Federal Register / govinfo](https://www.govinfo.gov/content/pkg/FR-2024-09-10/html/2024-19028.htm); [Wiley comment-deadline alert](https://www.wiley.law/alert-FCC-Sets-October-Comment-Deadlines-on-NPRM-for-AI-Generated-Calls-and-Texts); [FCC 24-84 PDF](https://docs.fcc.gov/public/attachments/FCC-24-84A1.pdf)
- **Proposed definition:** "AI-generated call" would cover outbound calls that use machine learning or LLMs to produce voice or text content. Technologies that answer *inbound* calls (e.g., virtual customer-service agents) would be exempt. — [NatLawReview](https://natlawreview.com/article/fcc-proposes-first-their-kind-tcpa-rules-ai-generated-robocalls-and-robotexts); [Wiley](https://wiley.law/alert-FCC-Proposes-New-Rules-for-AI-Generated-Calls-and-Texts)
- **Proposed disclosure:** Callers would have to disclose AI use both when obtaining consent and at the start of each call. The FCC also asked whether a special tone or badge should accompany the disclosure. — [Zian AI summary (vendor)](https://www.zian.ai/fcc-nprm-24-84-ai-call-disclosure-rules/); [Legal500](https://www.legal500.com/intelligence/united-states/media-telecoms-it-entertainment/hello-this-is-ai-calling-fcc-proposes-new-rules-for-ai-robocalls); [Womble Bond Dickinson](https://www.womblebonddickinson.com/us/insights/tcpa-defense-force/102ndk0/fcc-proposes-ai-generated-robocall-and-robotext-rules)
- **Commenter response:** Most commenters argued a new definition is unnecessary because AI voices are already "artificial" under the TCPA, and that it could create confusion and litigation. — [Mondaq "what is an AI generated call"](https://webiis08.mondaq.com/unitedstates/advertising-marketing-branding/1611108/what-is-an-ai-generated-call)

**Status of the NPRM in 2026**
- No final rule has been adopted as of Sept/Oct 2026. One vendor source says the Fall 2025 Unified Agenda lists the item under "Long-Term Actions" with "Next Action Undetermined." — [econsent.org, Oct 2026 (vendor/secondary)](https://econsent.org/posts/ai-voice-agents-tcpa-rules-october-2026/); [CallSphere (vendor)](https://callsphere.ai/blog/vw2d-fcc-ai-call-disclosure-rules-2026); [Retell AI (vendor)](https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound)
- Vendor sources characterize current FCC leadership (Chairman Carr) as deregulatory, which could delay or end the rulemaking. This is a characterization, not an FCC action. — [Retell AI (vendor)](https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound)
- A separate FCC Further Notice (FCC 26-27, April 30, 2026) asks about AI and automated technologies used by originating providers. It is a different proceeding from the AI-disclosure NPRM. — [FCC 26-27 PDF](https://docs.fcc.gov/public/attachments/FCC-26-27A1.pdf) (snippet only; not fetched)
- The FCC's one-to-one consent rule was vacated by the Eleventh Circuit in January 2025 and never took effect. That rule concerns lead-generation telemarketing, which is not relevant to CallBridge. — [JustCall summary (vendor)](https://justcall.io/blog/ai-voice-agent-disclosure-laws.html)

**McLaughlin Chiropractic v. McKesson (June 20, 2025, 6-3)**
- The Supreme Court held that district courts in TCPA enforcement proceedings are not bound by FCC statutory interpretations. Courts may give FCC views "appropriate respect." Commentators expect long-settled FCC readings to be reopened. — [Cooley](https://www.cooley.com/news/insight/2025/2025-07-01-mclaughlin-chiropractic-us-supreme-court-invites-new-era-of-tcpa-jurisprudence); [Reed Smith](https://www.reedsmith.com/our-insights/blogs/viewpoints/102kq4q/supreme-court-gives-courts-wide-latitude-to-disregard-fcc-guidance-on-the-telepho/); [Husch Blackwell](https://www.huschblackwell.com/newsandinsights/supreme-court-clarifies-district-courts-independence-from-fccs-tcpa-interpretations); [WLF](https://www.wlf.org/2025/11/17/publishing/after-mclaughlin-v-mckesson-a-seismic-shift-in-tcpa-litigation-and-jurisprudence/)

### Inferences
- **The disclosure rule is proposed, not law.** There is no enacted federal rule requiring an "I am an AI" disclosure. CallBridge's existing up-front AI disclosure goes beyond current federal law and matches the proposed FCC rule. The binding federal requirement is the 64.1200(b) identification of the *entity* responsible for the call at the start. That entity may be CallBridge and/or the user; who counts as the "initiator" on a platform is unsettled. A call opening such as "Hi, this is an AI assistant from CallBridge calling on behalf of [user name]" plausibly satisfies both. A callback number is advisable, since 64.1200(b)(2) requires a telephone number for artificial/prerecorded messages; the exact text was not verified here.
- **Calls to businesses.** Under the TCPA statute (47 U.S.C. 227(b)(1)(B)), the artificial-voice consent rule for landlines applies to *residential* lines. Most business landlines are therefore likely outside the consent requirement. A dentist's or restaurant's mobile number would not be.
  - This comes from background knowledge of the statute; the text was not retrieved in this session.
  - Calls to businesses are non-telemarketing and user-initiated, so opt-out mechanics (which apply to advertising/telemarketing) likely do not apply.
- **Calls to individuals' cell phones.** The TCPA's cell-phone prohibition applies to "any call" using an artificial voice without prior express consent, with no non-commercial exemption. That makes "relay a message to a friend" the highest-risk use case.
  - Practical mitigations include having the user confirm the friend expects or has agreed to such calls.
  - Another is offering a "user's own live voice + AI translation" mode instead of an AI voice.
  - A third is texting first or obtaining consent. Note that a TCPA-style consent text would itself be a regulated text.
- **Statutory damages exposure.** Exposure is per call (TCPA statutory damages are $500 per violation, trebled for willful violations — from background knowledge of 47 U.S.C. 227(b)(3); not retrieved here). Low call volume per user limits but does not remove class-action risk if the practice is systematic.
- **Effect of McLaughlin.** A court could, in principle, revisit whether a live, interactive LLM voice is an "artificial voice." Given the clear statutory text and the FCC's position, betting on that is unwise.

### Gaps
- Primary text of FCC 24-17 and FCC 24-84 could not be fetched. Not confirmed: exact 64.1200(b) wording, and whether the NPRM proposed an exemption for people with speech/hearing disabilities using AI voices to place calls. From memory, it did propose protecting such assistive uses for non-telemarketing calls. That would be an analogous but not identical case to CallBridge's non-native-speaker use; verify against the [FCC 24-84 PDF](https://docs.fcc.gov/public/attachments/FCC-24-84A1.pdf).
- No source found on who is the "maker/initiator" of the call when an app places calls at a user's direction. Under FCC precedent on calling apps, the user may be the initiator if the user decides whom and when to call. This would govern whether CallBridge or the user bears TCPA liability; legal review is needed.
- No source found on whether a business publishing its phone number amounts to "prior express consent" to artificial-voice calls.
- No primary FCC confirmation of the NPRM's 2026 status; the vendor claims about the Unified Agenda listing are unverified.

## 2. State laws: AI-voice disclosure, bot disclosure, recording/wiretap consent, voice-likeness

### Takeaway
No enacted state law found requires a separate "synthetic voice" disclosure on top of a clear up-front "I'm an AI" statement for a live, interactive, non-marketing call.

**State AI and bot disclosure laws**
- **California AB 2905** (effective Jan 1, 2025) requires an "artificial voice" disclosure. It applies to *automatic dialing-announcing devices playing prerecorded messages* (Pub. Util. Code §2874), so it reaches live conversational agents only at the edges.
- **Utah** (amended 2025) requires disclosure of generative AI when a consumer clearly asks, and proactive disclosure in regulated occupations.
- **Maine** (2025) reportedly requires notice where a consumer could be misled into thinking they are dealing with a human.
- **California SB 1001** targets bots in online communications, not voice calls.

**Recording and transcription consent**
- All-party-consent wiretap laws are a live risk for any AI that listens to or transcribes calls, especially California CIPA after *Ambriz v. Google* (2025). This risk exists whatever voice is used.

**Voice-likeness laws**
- Laws such as Tennessee's ELVIS Act and Illinois' digital-replica amendments protect a person's voice against *unauthorized* use. They do not bar a person from authorizing a clone of their own voice.

### Cited Findings
**California AB 2905 (enacted; effective Jan 1, 2025)**
- AB 2905 amended Pub. Util. Code §2874. When an automatic dialing-announcing device is used, an unrecorded natural voice must first state the nature of the call and the business details and ask whether the person consents to hear the recording. It must also say if the message uses an "artificial voice," defined as one generated or significantly altered by AI. — [Delatorre Review](https://www.thedelatorrereview.com/californias-ai-voice-disclosure-rule-when-robocalls-must-tell-you-the-voice-is-artificial/); [EM3 Law](https://blog.em3law.com/2024/10/30/ai-generated-robocalls/); [Aira (vendor)](https://www.getaira.io/resources/california-ai-voice-disclosure)
- **Scope:** A more careful analysis says AB 2905 "does not require every AI voice used in every telephone call to identify itself." A live conversational agent that never plays a prerecorded message "sits at the edge of the text rather than inside it." Vendor blogs that read it as covering all AI calls are overstated. — [Delatorre Review](https://www.thedelatorrereview.com/californias-ai-voice-disclosure-rule-when-robocalls-must-tell-you-the-voice-is-artificial/)
- **Penalty:** The $500 per-violation figure (civil action under §2876) appears in secondary sources but was not confirmed against statute text. — [Delatorre Review](https://www.thedelatorrereview.com/californias-ai-voice-disclosure-rule-when-robocalls-must-tell-you-the-voice-is-artificial/)

**Other California laws**
- California SB 1001 (2019 bot disclosure law) bars using a bot to mislead people about its artificial identity in commercial transactions or to influence a vote. Secondary sources say it applies to online communications, not telephone voice. — [BiglySales (vendor)](https://biglysales.com/ai-disclosure-laws-phone-calls/); [TopCalls (vendor)](https://www.topcalls.ai/blog/ai-disclosure-laws)
- California AB 3030 (health care) requires AI-generated clinical messages to carry a disclaimer, spoken at the start and end of audio interactions. It applies to health care providers, not to a patient's own agent calling a dentist. — [Plura (vendor)](https://www.plura.ai/articles/ai-voice-agent-disclosure-requirements)
- I found no 2025–2026 California statute expanding AI voice-call disclosure beyond AB 2905. Searches for SB 243 and AB 1018 returned nothing confirming applicability to calls. — (no source; see Gaps)

**Other states' AI disclosure laws**
- **Utah** (Artificial Intelligence Policy Act, amended 2025 by SB 226 and SB 332): businesses using generative AI with consumers must disclose it when the consumer clearly asks. Proactive disclosure is required in high-risk interactions for state-licensed occupations. The sunset is extended to July 1, 2027. — [AI Laws by State (secondary)](https://www.ailawsbystate.com/disclosure-guide); [StackCyber](https://stackcyber.com/posts/ai-state-laws)
- **Maine** LD 1727 (Public Law 2025, ch. 294), reported effective Sept 2025: consumers must be notified they are not dealing with a human where a reasonable consumer could be misled. Enforcement is under the Maine Unfair Trade Practices Act. This is a single vendor source and unverified. — [Conferbot (vendor)](https://www.conferbot.com/blog/ai-chatbot-disclosure-laws-compliance-guide)
- **Colorado:** SB 24-205 (the Colorado AI Act) was repealed before taking effect and replaced by SB 26-189, signed May 14, 2026. The new law is an automated-decision-making law effective Jan 1, 2027 and is focused on consequential decisions, not calls. — [Superintelligence Compliance (secondary)](https://superintelligencecompliance.ai/guides/us-state-ai-laws); [VerifyWise (secondary)](https://verifywise.ai/blog/state-of-ai-governance-regulations-united-states-2026). Sources conflict on the original law's dates.
- **Texas:** TRAIGA (HB 149) took effect Jan 1, 2026. Its disclosure duties fall mainly on government agencies and health care providers. Claims of a Texas "30-second AI disclosure window" in some compliance content are reportedly not in the enrolled text of Texas SB 140. — [Superintelligence Compliance](https://superintelligencecompliance.ai/guides/us-state-ai-laws); [JustCall (vendor)](https://justcall.io/blog/ai-voice-agent-disclosure-laws.html)

**Recording, transcription and wiretap consent**
- *Ambriz v. Google* (N.D. Cal., Feb 2025) denied dismissal of CIPA claims against Google's Contact Center AI for transcribing calls. The court held that a vendor's *capability* to use call data for its own purposes (e.g., model training) can make it a third-party eavesdropper. — [ZwillGen](https://www.zwillgen.com/privacy/federal-judge-allows-google-customer-service-ai-class-action-to-proceed/); [Pearl Cohen](https://www.pearlcohen.com/google-may-be-unlawfully-eavesdropping-with-ai-according-to-federal-court/)
- A Maine Law journal piece (Dec 2025) argues the "capability" theory is weakening after the Ninth Circuit's *Popa v. Microsoft* (Aug 2025, standing). The Popa holding could not be confirmed from a primary source. — [Maine Law SJIPL](https://sjipl.mainelaw.maine.edu/2025/12/18/the-collapse-of-capability-theory-ambriz-popa-and-the-future-of-article-iii-standing-in-ai-privacy-cases/)
- *Brewer v. Otter.ai* (CIPA §§631/632, AI vendor as a distinct third party) is pending. — [Captain Compliance](https://captaincompliance.com/education/old-wiretapping-laws-new-ai-tools-what-brewer-v-otter-ai-and-ambriz-v-google-mean-for-ai-transcription-services/)
- CIPA often requires consent of all parties to record or eavesdrop. — [pii.ai](https://www.pii.ai/blog/cipa-632-7-mobile-sms-phone); [Hostie state-by-state (vendor)](https://hostie.ai/resources/state-by-state-call-recording-compliance-ai-virtual-hosts-2025)

**Voice-likeness laws**
- **Tennessee ELVIS Act** (in force July 1, 2024): protects an individual's voice, defined to include actual and simulated sounds identifying a person, against unauthorized commercial use. It offers injunctions, damages and fees, and liability extends to those who make available tools whose primary purpose is producing unauthorized voice replicas. — [Davis Wright Tremaine](https://www.dwt.com/blogs/artificial-intelligence-law-advisor/2024/04/tennessee-elvis-act-ai-voice-replica); [Resemble AI](https://www.resemble.ai/laws-and-regulations/tennessee-elvis-act)
- **Illinois** amended its Right of Publicity Act (HB 4762, 2024) to cover digital replicas of voice and likeness. Illinois BIPA also covers voiceprints as biometric identifiers. — [Promise Legal](https://blog.promise.legal/ai-voice-cloning-musician-rights/); [Vermont Law Review](https://lawreview.vermontlaw.edu/striking-the-right-balance-state-digital-replica-laws-first-amendment-rights-and-the-path-toward-federal-regulation/)
- **New York's** digital replica law focuses on contracts authorizing digital replicas of performers. — [Vermont Law Review](https://lawreview.vermontlaw.edu/striking-the-right-balance-state-digital-replica-laws-first-amendment-rights-and-the-path-toward-federal-regulation/)
- **Federal NO FAKES Act:** advanced in committee but not enacted. — [Spirelight (secondary)](https://www.spirelight.ai/guides/voice-cloning-laws)

### Inferences
- **No double disclosure required.** No enacted state law found requires disclosing that the *voice itself* is synthetic when the AI has already clearly said "I'm an AI." A clear, early statement such as "I'm an AI assistant" logically also discloses that the voice is AI.
  - To be safe under AB 2905-style wording, the opening can say "automated AI voice." Example: "Hi, I'm an AI assistant with an automated voice, calling for [name] through CallBridge."
- **Utah and Maine.** Utah's "disclose when asked" and Maine's "where a reasonable consumer could be misled" rules make *truthful answers to "are you a robot?"* and avoiding human-mimicking design legally relevant. A more human voice raises the "could be misled" risk, which CallBridge's up-front disclosure mitigates.
- **Recording and transcription.** For any call the AI transcribes (necessary for it to work) or records, CallBridge's exposure under all-party-consent states (e.g., California) is greater if it or its vendors can use call audio or transcripts for training.
  - Mitigation: add recording/transcription notice to the opening line (e.g., "this call is transcribed").
  - Contractually bar STT/TTS vendors from training on call data.
  - Minimize retention.
- **Cloning the user's own voice.** ELVIS/Illinois-style laws protect against *unauthorized* use of a person's voice. If the user is cloning their own voice with documented consent, these laws are not an obstacle. Illinois BIPA could apply to creating and storing a voiceprint/voice model of an Illinois resident; that needs informed written consent, a retention policy and a destruction schedule. Whether a TTS voice clone is a "voiceprint" under BIPA is unsettled.

### Gaps
- Statutory text of Cal. Pub. Util. Code §2874/§2876 could not be fetched, nor the definition of "automatic dialing-announcing device" (§2871) as applied to interactive AI agents.
- No reliable list of current all-party-consent states retrieved. From background, commonly cited ones include CA, FL, IL, MD, MA, MT, NH, PA, WA, plus others with nuances; verify.
- 2025–2026 bills in other states (e.g., NY, NJ, IL) specifically on AI voice calls could not be verified. Vendor blogs claim "at least five states" have AI phone/chatbot disclosure requirements without reliable enumeration.
- Maine LD 1727 and Utah SB 226/SB 332 were not read in primary text.

## 3. Cloning the user's own voice: legality, impersonation, fraud and bank voice authentication

### Takeaway
Cloning one's own voice with documented consent is generally lawful. Using it in calls is still an "artificial voice" under the TCPA, so it does not escape the rules in section 1. The real risks are:
- (a) the clone is used to deceive recipients into thinking the user is speaking live, which conflicts with CallBridge's disclosure policy and could support state deception/UDAP claims;
- (b) account takeover — someone other than the user creates or uses the clone;
- (c) defeating voice-biometric authentication at banks and similar institutions.

FTC regulation of *individual* impersonation remains proposed.

### Cited Findings
- **Consent:** Cloning a voice with the speaker's documented, specific consent is lawful almost everywhere. Risk comes from deceptive or unauthorized uses. — [Spirelight (secondary)](https://www.spirelight.ai/guides/voice-cloning-laws); [fiund state map](https://fiund.com/resources/the-us-state-voice-and-likeness-law-map)
- **TCPA:** The FCC's 2024 ruling expressly covers voice cloning as "artificial" voice. — [McDermott](https://www.mcdermottlaw.com/insights/fcc-requires-consent-for-ai-generated-cloned-voice-calls/)
- **FTC impersonation rule:** The Government and Business Impersonation Rule is in effect (2024). In Feb 2024 the FTC proposed extending it to impersonation of *individuals* and to providers of tools (including AI) that know or have reason to know they are used for impersonation. As of the latest information found, the individual-impersonation extension has not been finalized. — [FTC press release, Feb 2024](https://www.ftc.gov/news-events/news/press-releases/2024/02/ftc-proposes-new-protections-combat-ai-impersonation-individuals); [Allure Security](https://alluresecurity.com/blog/ftc-impersonation-rule-enforcement-brand-protection/); [FedLaws](https://fedlaws.org/ftc-impersonation-rule-penalties-refunds-and-ai-deepfakes/)
- **FTC position:** There is "no AI exemption from the laws on the books." — [FTC consumer alert, Apr 2024](https://consumer.ftc.gov/consumer-alerts/2024/04/fighting-back-against-harmful-voice-cloning)
- **FTC Voice Cloning Challenge:** announced Nov 16, 2023; submissions Jan 2–12, 2024; winners announced Apr 8, 2024. Winning approaches covered prevention/authentication (e.g., watermarking), real-time detection (Pindrop received a recognition award) and evaluation of existing content. — [FTC challenge announcement](https://www.ftc.gov/news-events/news/press-releases/2023/11/ftc-announces-exploratory-challenge-prevent-harms-ai-enabled-voice-cloning); [FTC winners](https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-announces-winners-voice-cloning-challenge); [FTC "Approaches to Address AI-enabled Voice Cloning"](https://www.ftc.gov/policy/advocacy-research/tech-at-ftc/2024/04/approaches-address-ai-enabled-voice-cloning)
- **Banks and voice authentication:**
  - A Wall Street Journal reporter cloned her own voice and got past her bank's voice security. — [BankInfoSecurity](https://www.bankinfosecurity.com/ai-deepfakes-push-banks-beyond-voice-authentication-a-32388)
  - The ABA's Paul Benda recommends layered authentication using IP and device signals. — [BankInfoSecurity](https://www.bankinfosecurity.com/ai-deepfakes-push-banks-beyond-voice-authentication-a-32388)
  - A vendor survey claims 91% of US banks are rethinking voice biometrics (unverified vendor stat). — [Reality Defender (vendor)](https://www.realitydefender.com/insights/deepfakes-in-banking-a-growing-threat-to-financial-security)
- **Consumer Reports (Mar 2025):** in a study of voice-cloning services, some (including ElevenLabs) required only a self-attestation checkbox for consent. — [The Register](https://www.theregister.com/2025/03/10/ai_voice_cloning_safeguards/)
- **Human detection:** Humans cannot reliably detect speech deepfakes (academic study). — [arXiv 2301.07829](https://arxiv.org/pdf/2301.07829)

### Inferences
- **Disclosure for a cloned voice.** A clone of the user's voice is the case where recipients are most likely to be misled. Friends and family may believe they are hearing the user live, and the disclosure may be missed or forgotten. Disclosure should be explicit and voice-specific, e.g., "This is an AI assistant using a synthetic copy of [Name]'s voice, calling on their behalf."
- **Restrict institutional calls.** Block or warn against cloned-voice calls to banks, brokerages, telecom carriers, government agencies and other places that use voice authentication. Otherwise CallBridge could be seen as facilitating authentication bypass or impersonation, which raises the provider-liability theory in the FTC's proposed extension.
- **Clone-creation safeguards:**
  - Live liveness/consent capture: the user reads a randomized consent script in-app, so pre-recorded clips of another person cannot be uploaded.
  - Tie the clone to the verified account holder.
  - No export of the voice model.
  - Watermarked output where the provider supports it.
  - Easy deletion.

### Gaps
- No primary source confirms the FTC's current (2026) status for the individual-impersonation rule; it was not finalized as of the sources found.
- No case law found on someone using a clone of their *own* voice for non-fraudulent calls to third parties.
- No source found on whether any bank's terms of service prohibit customers from calling with synthetic copies of their own voice. This is likely covered by general "you may not circumvent security" clauses.

## 4. Provider terms (OpenAI, ElevenLabs, Cartesia, Twilio)

### Takeaway
All four providers permit AI voice agents but require honesty about AI and consent for cloning.
- **OpenAI:** requires clear disclosure that speech is AI-generated and that users are interacting with AI. It bars reproducing a person's voice without express consent.
- **ElevenLabs:** bars cloning or impersonating any living person without explicit, informed consent. It also bars stripping watermarks or provenance to disguise AI content.
- **Cartesia:** requires verified speaker consent for clones.
- **Twilio:** bars using its AI features to mislead anyone that output was solely human-generated. Its voice policy requires callee consent where law requires it and accurate caller ID.

A "make it sound human, possibly as the user" design is allowed only with disclosure intact and consent captured from the person whose voice is cloned.

### Cited Findings
- **OpenAI, service terms:** "You may not use Prompt-to-Voice to reproduce any person's voice without express consent and all necessary rights. Customer must clearly disclose that generated speech is AI-generated." — [OpenAI Service Terms](https://openai.com/policies/service-terms/); see also [OpenAI Custom voices guide](https://developers.openai.com/api/docs/guides/custom-voices)
- **OpenAI, Realtime API:** "Developers must also make it clear to end users when they're interacting with AI, unless it's already obvious from the context. The Realtime API uses preset voices to help prevent malicious actors from impersonating others." OpenAI documents SIP telephony for the Realtime API. — [OpenAI Realtime/gpt-realtime announcement](https://openai.com/index/introducing-gpt-realtime/); [OpenAI Telephony and SIP docs](https://developers.openai.com/api/docs/guides/voice-sip?voice-api=realtime)
- **OpenAI, scam research:** UIUC researchers showed the Realtime API could be used to automate phone scams. — [The Register, Oct 2024](https://www.theregister.com/security/2024/10/24/openais-voice-api-can-build-ai-agents-for-phone-scams/1474330)
- **ElevenLabs, Prohibited Use Policy:**
  - Prohibits "cloning, synthesizing, or impersonating the voice, identity, or likeness of any living individual without their explicit and informed consent or other valid authorization."
  - Prohibits removing, altering or concealing "ElevenLabs watermarks, metadata or other provenance signals for the purpose of disguising AI-generated content or evading detection."
  - Lists Telecommunications among ElevenAgents products covered.
  - Secondary summaries add bans on unauthorized robocalling and on attempts to evade voice verification; these are unverified against primary text.
  - — [ElevenLabs Prohibited Use Policy](https://elevenlabs.io/use-policy); [margabagus summary (secondary)](https://margabagus.com/elevenlabs-voice-consent-policy/)
- **Cartesia:**
  - "All voice clones require verified consent from the speaker" and "Only clone your own voice or a voice you have explicit permission to clone and use."
  - Its AUP prohibits impersonating another person.
  - — [Cartesia Voice Cloning page](https://www.cartesia.ai/product/voice-cloning); [Cartesia Acceptable Use Policy](https://cartesia.ai/legal/acceptable-use.html)
- **Twilio:**
  - The AI/ML features addendum: customer may not use the AI/ML Feature "to mislead anyone that an Output was solely human generated." — [Twilio Predictive and Generative AI/ML Features Addendum](https://www.twilio.com/en-us/legal/ai-terms/predictive-generative-ai-features)
  - The Voice Services Policy requires customers to "Obtain a callee's prior consent, as required by applicable laws… or telecommunications providers' requirements," and prohibits misleading caller ID. — [Twilio Voice Services Policy](https://www.twilio.com/en-us/legal/service-country-specific-terms/voice-sip)
  - Twilio's post on the FCC ruling says customers "must obtain prior express consent of the called party… providing caller identification and disclosing the responsible entity." — [Twilio blog](https://www.twilio.com/en-us/blog/fcc-ruling-ai-generated-voices-robocalls)

### Inferences
- **Disclosure is required by contract.** CallBridge's up-front AI disclosure is contractually required by OpenAI's TTS terms and is the safe reading of Twilio's "solely human generated" clause. Dropping or burying it to make calls "sound human" would likely breach provider terms, quite apart from legal risk.
- **Clone consent.** Clones of the user's voice need provider-grade consent capture. Self-attestation checkboxes have been criticized (Consumer Reports), so stronger in-app verification is advisable. OpenAI's Realtime API intentionally uses preset voices; custom/cloned voices depend on specific products and terms.
- **Watermarks.** CallBridge must not strip watermarks or provenance markers (ElevenLabs).

### Gaps
- Full primary text of each policy was not fetched, because WebFetch was blocked; quotes come from search excerpts. In particular, the following were not confirmed:
  - ElevenLabs' exact clauses on agents/telephony and robocalling;
  - Twilio's main Acceptable Use Policy provisions on AI voices;
  - Cartesia's Terms of Use text.
- No information found on Telnyx, Vonage or Plivo AI voice policies; these were not researched.

## 5. Ethics: deceptive human-likeness and how to be natural yet honest

### Takeaway
The 2018 Google Duplex backlash set the industry norm. A human-sounding voice is acceptable only with disclosure "built in" up front. Human-mimicking cues — disfluencies such as "um" and "mm-hmm", fake background noise, fake typing — were criticized specifically as tools of deception.

Best practice for CallBridge:
- disclose in the first sentence;
- never deny being an AI;
- answer "are you a robot?" truthfully and immediately;
- avoid fabricated human cues while keeping natural prosody, turn-taking and politeness.

### Cited Findings
- **The backlash:** At Google I/O in May 2018, Duplex called a salon and restaurant using human-like disfluencies ("hmm," "uh") without disclosing it was a bot. Zeynep Tufekci criticized it as "Google Assistant making calls pretending to be human not only without disclosing that it's a bot." — [Fortune](https://fortune.com/2018/05/11/google-duplex-virtual-assistant-ethical-issues-ai-machine-learning); [MobileSyrup](https://mobilesyrup.com/2018/05/11/googles-human-ai-phone-call-duplex-tell-you-robot/)
- **Google's response:** "designing this feature with disclosure built-in, and we'll make sure the system is appropriately identified." — [Loop Insight](https://loopinsight.com/2018/05/11/google-now-says-controversial-ai-voice-calling-system-will-identify-itself-to-humans); [Onmanorama](https://onmanorama.com/business/gadgets/2018/05/12/google-ai-will-identify-itself-to-humans.html)
- **Critics:** Fortune commentary argued that "human ethics—not just human simulation—need to be baked into these systems from the start, not as a reactive afterthought." — [Fortune](https://fortune.com/2018/05/11/google-duplex-virtual-assistant-ethical-issues-ai-machine-learning)
- **Research perspective:** A Boston Globe op-ed by researchers asked whether companies should "deceive us into thinking bots are human if this makes us happier customers," noting that transparency "may sometimes come at a cost" in cooperation. — [Boston Globe, Jan 2020](https://www.bostonglobe.com/2020/01/30/opinion/ethics-efficiency-artificial-intelligence)
- **Industry and provider norms:**
  - OpenAI requires that end users be told when they are interacting with AI. — [OpenAI](https://openai.com/index/introducing-gpt-realtime/)
  - Twilio forbids misleading anyone that output was solely human-generated. — [Twilio](https://www.twilio.com/en-us/legal/ai-terms/predictive-generative-ai-features)
- **Detection limits:** People cannot reliably detect synthetic speech, so a highly human voice without disclosure would effectively deceive. — [arXiv 2301.07829](https://arxiv.org/pdf/2301.07829)

### Inferences
These are design recommendations derived from the findings above, not from a specific guidance document.

**Disclosure wording**
- **First sentence:** "Hi, this is an AI assistant calling on behalf of [First Last] through CallBridge. [Name] doesn't speak English fluently, so I'm helping. This call is transcribed. Is now a good time?"
  - Mentioning the purpose (a language-assistance agent) tends to make recipients more patient.
  - It also blunts the "robocall" perception.
- **Re-disclose** after a hold, a transfer to a new person, or whenever the recipient seems confused.
  - Example: "Just to be clear, I'm an AI assistant, not [Name] — and I'm calling for them."
- **With a cloned voice**, disclose that the voice is a synthetic copy of the user's voice.

**Truthfulness**
- Always answer "Are you a robot/real person?" with "Yes, I'm an AI" — never evade or deny.
- Never claim human experiences, such as "I'm at my desk" or "let me grab a pen".
- Do not impersonate the user in the first person ("this is [Name]"). Speak about the user in the third person.

**Avoid fabricated human cues**
- No fake typing or keyboard sounds.
- No synthetic office or café background noise.
- No scripted "um/uh" disfluencies whose purpose is to seem human.
- No fake breathing or coughing.

**Acceptable naturalness**
- Natural prosody, warm tone, and backchannels used for turn-taking ("okay", "got it").
- Low latency and barge-in handling.
- Short "one moment while I check with [Name]" fillers that are *true*, for example when relaying a question to the user.

**Recipient choice and user control**
- Offer the recipient an exit: "If you'd prefer, [Name] can call you back or text instead."
- Respect requests not to be called by AI again; keep a per-number do-not-call-by-AI list.
- Let the user review the transcript; never fabricate commitments on the user's behalf beyond the task scope.

### Gaps
- No peer-reviewed study was retrieved on how AI disclosure affects call completion and success rates for service calls. The searches returned news and opinion only.
- No formal standard found (e.g., IEEE, Partnership on AI, NIST) with specific wording for voice-agent disclosure; this was not searched in depth.
- Google Duplex's current disclosure wording (e.g., "I'm Google's automated booking service…") was not confirmed from a source in this session.

## 6. STIR/SHAKEN and carrier labelling ("Spam Likely")

### Takeaway
STIR/SHAKEN attestation applies to calls whether or not they use AI. Carriers and analytics engines don't label calls "AI"; they label based on attestation, number reputation, calling patterns and complaints.

A-level attestation, registered and branded numbers, and low per-number volume improve answer rates. Calls from fresh or shared pooled numbers, or patterns resembling robocalling (many short calls), risk "Spam Likely" labels. Labeling is not standardized across carriers.

### Cited Findings
- **Attestation levels:** A-level attestation means the provider knows the customer and has verified their right to use the calling number. Calls that pass verification are less likely to be labeled "Spam Likely"/"Scam Likely." — [Telnyx guide on STIR/SHAKEN for AI agents (vendor)](https://telnyx.com/resources/stir-shaken-ai-agents); [Twilio SHAKEN/STIR blog](https://twilio.com/blog/shaken-stir-sign-twilio-calls)
- **Twilio's guidance:** register the business identity and numbers through Trust Hub to get A attestation, and follow its other anti-mislabeling steps. — [Twilio](https://twilio.com/blog/shaken-stir-sign-twilio-calls)
- **New signing rule:** As of Sept 2025, providers with a STIR/SHAKEN obligation must sign calls with their own SPC token/certificate even when using third-party authentication services. This is a vendor statement; the FCC Eighth Report and Order was not verified from the primary source. — [Telnyx (vendor)](https://telnyx.com/resources/stir-shaken-ai-agents); [Kixie (vendor)](https://www.kixie.com/sales-blog/what-salesforce-users-need-to-know-about-stir-shaken-compliance/)
- **No agreed display standard:** what the recipient sees "may be determined by an analytics engine using the STIR/SHAKEN certificate as but one input." — [COMsolve brief to Canadian House of Commons committee](https://www.ourcommons.ca/Content/Committee/431/INDU/Brief/BR10728620/br-external/COMsolveInc-e.pdf)
- **Context figures (vendor-cited):** 52.5 billion robocalls in 2025; Hiya's 2026 report says 86% of unknown calls go unanswered. — [Telnyx](https://telnyx.com/resources/stir-shaken-ai-agents); [Thoughtly (vendor)](https://thoughtly.com/blog/branded-calling-spam-label-prevention-ai-voice-agents)
- **Discounted claim:** Kixie's thresholds (e.g., >50 calls/hour or calls under 30 seconds trigger blocking) are unsourced marketing claims.

### Inferences
- **Caller ID choice.** Recipients are likelier to answer if the call shows CallBridge's registered, branded number (CNAM/branded calling) with A attestation. Showing the user's own number would require verifying the user's right to use it; spoofing it without verification would violate Twilio policy and Truth in Caller ID rules.
- **Pacing.** CallBridge's low-volume, one-off pattern is favorable. Many users' calls funneling through a small pool of numbers may still look like high-volume robocalling. Spread calls across numbers, monitor reputation (e.g., via the Free Caller Registry or analytics vendors), and keep calls from being very short or abandoned.
- **Disclosure effect.** An immediate AI disclosure may lead some recipients to hang up or report the call. Clear purpose framing ("on behalf of [Name], a patient/customer") likely reduces complaint-driven labeling. This is an inference; no data was found.

### Gaps
- No independent data found on how often AI-agent calls are labeled spam compared with human calls.
- Not verified from a primary source: the FCC's 2025 STIR/SHAKEN third-party authentication order (Eighth Report and Order) and its effective dates.
- No carrier documentation (AT&T, Verizon, T-Mobile) on AI-specific call-labeling criteria was found.
