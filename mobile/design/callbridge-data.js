(function () {
  const CONTACTS = [
    { id: 'sd', name: 'Smile Dental', ini: 'SD', rel: 'dentist', num: '(901) 555-0142', lang: 'English', calls: 4, last: '已预约：10月8日周四 下午2:00', bg: '#e1f5e8', fg: '#137a3a', addr: '1830 Poplar Ave, Memphis', learned: [{ zh: '就诊时需出示保险卡', en: 'Asks for the insurance card at check-in' }, { zh: '前台 Maria 一般上午接电话', en: 'Maria at the front desk usually answers mornings' }] },
    { id: 'm', name: 'Maria', ini: 'M', rel: 'girlfriend', num: '747-283-6440', lang: 'Mandarin', calls: 12, last: '已转达：今晚会晚到一小时', bg: '#ffe3ef', fg: '#b0306a', addr: '—', learned: [{ zh: '更喜欢之后再发条短信确认', en: 'Prefers a text afterwards too' }] },
    { id: 'ts', name: 'Tabito Sato', ini: 'TS', rel: 'friend', num: '(901) 555-2290', lang: 'Japanese', calls: 3, last: '已转达：今晚的读经去不了', bg: '#fff3d1', fg: '#855600', addr: '—', learned: [] },
    { id: 'lc', name: 'Lola Cruz', ini: 'LC', rel: 'tita', num: '+63 917 555 0148', lang: 'Tagalog', calls: 2, last: '已转达：生日快乐，周日视频', bg: '#eee9fc', fg: '#5b3cc4', addr: 'Quezon City', learned: [] },
    { id: 'ms', name: 'Maria Santos', ini: 'MS', rel: 'landlord', num: '(901) 555-1187', lang: 'English', calls: 1, last: '水管维修：周三上午来', bg: '#e1f5e8', fg: '#137a3a', addr: '2240 Central Ave', learned: [{ zh: '只在工作日回电话', en: 'Only returns calls on weekdays' }] },
    { id: 'mom', name: 'Mom', ini: '妈', rel: 'mom', num: '(901) 555-0066', lang: 'Mandarin', calls: 0, last: '', bg: '#e6edfd', fg: '#2557e8', addr: '—', learned: [] },
  ];
  const IMPORTS = [
    { id: 'kt', name: 'Kenji Tanaka', ini: 'KT', rel: 'friend', num: '(901) 555-3301', lang: 'Japanese', calls: 0, last: '', bg: '#fff3d1', fg: '#855600', addr: '—', learned: [] },
    { id: 'ar', name: 'Ate Rosa', ini: 'AR', rel: 'cousin', num: '+63 917 555 0172', lang: 'Tagalog', calls: 0, last: '', bg: '#eee9fc', fg: '#5b3cc4', addr: '—', learned: [] },
  ];
  const PLACES = [
    { id: 'la', name: 'La Esquina Taqueria', dist: '0.4 mi', open: 'Open now', rating: '4.6 ★ (812)', num: '(901) 555-0187', lang: 'Spanish', note: '离您最近，网上写营业到 22:00', unverified: false },
    { id: 'sol', name: 'Taquería El Sol', dist: '1.1 mi', open: 'Open now', rating: '4.4 ★ (230)', num: '(901) 555-0123', lang: 'Spanish', note: '', unverified: true },
    { id: 'oax', name: 'Casa Oaxaca', dist: '1.8 mi', open: 'Closes 9 pm', rating: '4.7 ★', num: '(901) 555-0311', lang: 'English', note: '在您的电话簿里', unverified: false },
  ];
  const LZ = { English: '英语', Mandarin: '中文', Japanese: '日语', Tagalog: '他加禄语', Spanish: '西班牙语' };
  const OB = ['lang', 'name', 'voice', 'uses'];
  const OBQ = {
    lang: { en: "Hi! I'm your call assistant. First, what language do you speak day to day?", chips: { en: ['中文 Mandarin', 'Español', 'English'] } },
    name: { en: "Hi! I'm your call assistant. What should I call you?", zh: '您好！我是您的通话助手。怎么称呼您？', es: '¡Hola! Soy tu asistente de llamadas. ¿Cómo te llamo?', chips: { en: ['Wei', 'Wei Li'], zh: ['李伟', 'Wei'], es: ['Wei', 'Wei Li'] } },
    voice: { en: 'Which voice should I use on calls?', zh: '打电话时，我用哪个声音？', es: '¿Qué voz uso en las llamadas?', chips: { en: ['Marin', 'Cedar'], zh: ['Marin', 'Cedar'], es: ['Marin', 'Cedar'] } },
    uses: { en: 'What will you mostly use CallBridge for? I can call to book, ask questions, or pass on a message.', zh: '您主要用 CallBridge 做什么？我可以替您打电话预约、问问题、转达消息。', es: '¿Para qué usarás más CallBridge? Puedo llamar para reservar, preguntar o dejar un mensaje.', chips: { en: ['Daily errands', 'Work & business', 'Family & friends', 'Something else'], zh: ['日常事务', '工作生意', '家人朋友', '其他'], es: ['Trámites diarios', 'Trabajo y negocios', 'Familia y amigos', 'Otra cosa'] } },
    done: { en: 'All set, Wei. Tell me who to call, anytime.', zh: '好了，伟。想打给谁，随时告诉我。', es: 'Listo, Wei. Dime a quién llamar cuando quieras.' },
  };
  function obQ(i, lang) {
    const q = OBQ[OB[i] || 'done'], L = q[lang] ? lang : 'en';
    return { zh: q[L], en: L === 'en' ? '' : q.en, chips: q.chips ? (q.chips[L] || q.chips.en) : [] };
  }
  const TAGS = { Booked: ['#e1f5e8', '#137a3a'], 'No answer': ['#eef0f3', '#69707d'], Delivered: ['#e6edfd', '#2557e8'], 'Not booked': ['#fdeceb', '#b42318'], Answered: ['#e6edfd', '#2557e8'], Updated: ['#e1f5e8', '#137a3a'] };
  const CALLS = [
    { id: 'c1', who: 'La Esquina Taqueria', time: '9:15', zh: '没人接听', tag: 'No answer' },
    { id: 'c2', who: 'Maria', time: 'Mon', zh: '已转达：今晚会晚到一小时', tag: 'Delivered' },
    { id: 'c3', who: 'Dr. Kim Family Clinic', time: 'Sun', zh: '未预约：他们只有下午 3 点', tag: 'Not booked' },
    { id: 'c4', who: 'Tabito Sato', time: 'Sun', zh: '已转达：今晚的读经去不了', tag: 'Delivered' },
  ];
  const RAIL = [
    { label: 'Get started', items: [['signin', 'Sign in'], ['onboard', 'Profile interview']] },
    { label: 'Make a call', items: [['home', 'Home'], ['listen', 'Listening'], ['speak', 'Assistant asks'], ['research', 'Looking it up'], ['review', 'Review & confirm'], ['ring', 'Ringing'], ['live', 'Live call'], ['hold', 'Hold question'], ['msg', 'Message assistant'], ['lock', 'Lock screen']] },
    { label: 'After the call', items: [['booked', 'Result: booked'], ['fail', 'Result: no answer'], ['talk', 'Talk it over']] },
    { label: 'Library', items: [['calls', 'Call history'], ['book', 'Phone book'], ['contact', 'Contact'], ['import', 'Import contacts']] },
    { label: 'You', items: [['me', 'Profile & settings'], ['notif', 'Notifications']] },
  ];
  const CAP = {
    signin: 'Sign in. No glow yet: nothing is happening.',
    onboard: 'Profile interview. Language is a plain picker, no voice and no glow. After that the assistant speaks in your language (English underneath); hold to answer.',
    home: 'Home. Dim, idle aura and the mic is off. Hold the button to talk; the aura wakes only while you hold.',
    listen: 'Push-to-talk. The aura breathes only while the button is held; release sends.',
    speak: 'Assistant asks. A fast aura while it speaks, then it goes quiet and waits for you to hold and answer (or tap a chip).',
    research: 'Looking it up. A still violet edge that gently breathes while it searches; idle aura once results land.',
    review: 'Review & confirm. The aura narrows into a still blue hairline: the line is ready.',
    ring: 'Ringing. The green hairline pulses with each ring.',
    live: 'Live call. A steady green hairline.',
    hold: 'Hold question. The violet edge is the countdown.',
    msg: 'Message the assistant. Green line stays on; a blue aura rises from the composer.',
    lock: 'Lock screen. The glow moves onto the Live Activity card.',
    booked: 'Result. A slow green aura.',
    fail: 'Result: no answer. A still amber hairline.',
    talk: 'Talk it over. Same push-to-talk: the aura lights while you hold or while it replies.',
    calls: 'Call history.', book: 'Phone book.', contact: 'Contact.', import: 'Import contacts.', me: 'Profile & settings.', notif: 'Notifications.',
  };

  function info(s) {
    const f = s.flow, c = s.ctx || {};
    if (f === 'dentist' || f === 'followup') return {
      who: 'Smile Dental', num: '(901) 555-0142', lang: 'English',
      listen: { zh: '打给我的牙医，下周约个洗牙，最好下午', en: 'Call my dentist, book a cleaning next week — afternoon if possible' },
      speak: [
        { zh: '好的，Smile Dental。您以前在那里看过牙吗？', en: 'Got it, Smile Dental. Have you been there before?', chips: ['是，老患者', '第一次去'], done: 3, need: '是否老患者？' },
        { zh: '超出洗牙的费用，要先问您吗？', en: 'Should I check with you before agreeing to any extra charges?', chips: ['先问我', '$50 以内可以'], done: 4, need: '额外费用？' },
      ],
      goalZh: f === 'followup' ? s.fu.zh : '预约洗牙 · 下周下午', goalEn: f === 'followup' ? s.fu.en : 'Book a cleaning, next week, afternoon',
      charges: f === 'followup' ? s.fu.charges : (c.charges || 'Ask me first'),
    };
    if (f === 'food') {
      const p = s.place || PLACES[0];
      return { who: p.name, num: p.num, lang: p.lang, listen: { zh: '最近的墨西哥餐厅今晚几点关门？', en: 'When does the nearest Mexican restaurant close tonight?' },
        speak: [{ zh: `要我打给 ${p.name}，问问今晚几点关门吗？`, en: `Want me to call ${p.name} and ask when they close tonight?`, chips: ['好，打吧', '换一家'], done: 4, need: '确认' }],
        goalZh: '问今晚几点关门', goalEn: 'Ask what time they close tonight', charges: 'None' };
    }
    const k = c.contact || CONTACTS[1];
    return { who: k.name, num: k.num, lang: k.lang, listen: { zh: `告诉${k.name}我今晚会晚到一小时`, en: `Tell ${k.name} I'll be about an hour late tonight` },
      speak: [{ zh: `我用${LZ[k.lang] || k.lang}跟${k.name}说。要请对方回复吗？`, en: `I'll tell ${k.name} in ${k.lang}. Should I ask for a reply?`, chips: ['只转达', '请对方回复'], done: 4, need: '要回复吗？' }],
      goalZh: '转达：今晚会晚到一小时', goalEn: 'Pass on: about an hour late tonight', charges: 'None' };
  }

  function lines(s) {
    const f = s.flow, c = s.ctx || {};
    if (f === 'dentist') return [
      { who: 'them', zh: '您好，Smile Dental，我是 Maria。', en: 'Thank you for calling Smile Dental, this is Maria.' },
      { who: 'ai', zh: '您好 Maria，我是李伟的 AI 语言助手，想替他预约洗牙。', en: "Hi Maria, I'm Wei Li's AI language assistant, calling to book a cleaning." },
      { who: 'them', zh: '好的。下周四下午 2 点可以吗？', en: 'Sure. Does next Thursday at 2 pm work?' },
      { who: 'ai', zh: '可以，周四下午 2 点很好。', en: 'Yes, Thursday at 2 works well.' },
      { who: 'them', zh: '另外要不要加做全套 X 光？额外 $80。', en: "Would he also like a full set of X-rays? That's $80 extra." },
      s.mode === 'loop' ? { who: 'ai', zh: '请稍等，我问一下他。', en: 'One moment, let me check with him.', hold: true }
        : { who: 'ai', zh: '这个李伟会稍后跟进，今天只洗牙。', en: 'Wei will follow up on that. Just the cleaning today.' },
      { who: 'them', zh: '好的，已经帮您登记了。请带上保险卡。', en: "Great, you're all set. Please bring your insurance card." },
      { who: 'ai', zh: '谢谢您，再见！', en: 'Thank you, goodbye!' },
    ];
    if (f === 'followup') return [
      { who: 'them', zh: 'Smile Dental，您好。', en: 'Smile Dental, how can I help?' },
      { who: 'ai', zh: `我是李伟的 AI 助手，关于周四的预约：${s.fu.zh}。`, en: `I'm Wei Li's AI assistant, about Thursday's appointment: ${s.fu.en}.` },
      { who: 'them', zh: '没问题，已经更新了。', en: "No problem, that's updated." },
      { who: 'ai', zh: '谢谢，再见！', en: 'Thanks, goodbye!' },
    ];
    if (f === 'food') {
      const p = s.place || PLACES[1], es = p.lang === 'Spanish';
      return [
        { who: 'them', zh: `${p.name}，您好。`, en: es ? `${p.name}, ¿en qué le puedo ayudar?` : `${p.name}, how can I help you?` },
        { who: 'ai', zh: '您好，我是替客人打电话的 AI 助手。请问今晚几点关门？', en: es ? 'Hola, soy un asistente de IA llamando por un cliente. ¿A qué hora cierran hoy?' : "Hi, I'm an AI assistant calling for a customer. What time do you close tonight?" },
        { who: 'them', zh: '今晚营业到 10 点。', en: es ? 'Hoy cerramos a las diez.' : "We're open until 10 tonight." },
        { who: 'ai', zh: '好的，谢谢！', en: es ? '¡Perfecto, gracias!' : 'Great, thank you!' },
      ];
    }
    const k = c.contact || CONTACTS[1];
    return [
      { who: 'them', zh: '喂？', en: 'Hello?' },
      { who: 'ai', zh: `您好 ${k.name}，我是李伟的 AI 助手。他让我告诉您，他今晚会晚到一小时。`, en: `Hi ${k.name}, this is an AI assistant calling for Wei. He wanted you to know he'll be about an hour late tonight.` },
      { who: 'them', zh: '好的，谢谢告诉我！', en: 'Okay, thanks for letting me know!' },
      ...(c.reply ? [{ who: 'ai', zh: '您有什么要我转告他的吗？', en: 'Anything you want me to pass back to him?' }, { who: 'them', zh: '告诉他路上小心。', en: 'Tell him to drive safe.' }] : []),
      { who: 'ai', zh: '好的，再见！', en: 'Will do, bye!' },
    ];
  }

  const HOLD_ANS = {
    approve: { who: 'ai', zh: '他同意加做 X 光。', en: "He'd like the X-rays too." },
    decline: { who: 'ai', zh: '这次只洗牙就好，谢谢。', en: 'Just the cleaning this time, thanks.' },
    reply: { who: 'ai', zh: '他说下次再考虑 X 光。', en: "He'll think about the X-rays for next time." },
    timeout: { who: 'ai', zh: '他暂时联系不上，X 光他稍后跟进。', en: "I can't reach him right now; he'll follow up about the X-rays." },
  };

  function mm(x) { return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; }

  function buildResult(s, fail) {
    const inf = info(s);
    const base = { who: inf.who, dur: mm(s.callSec || 0), tx: s.tx || [], flow: s.flow, ctx: s.ctx, place: s.place, goalZh: inf.goalZh, goalEn: inf.goalEn, isFood: s.flow === 'food' };
    if (fail) return { ...base, kind: 'fail', dur: '0:48', label: 'NO ANSWER', labelColor: '#855600', title: '没人接听', titleEn: 'Rang 6 times, no voicemail. Their listing says they open at 11.', bullets: [{ zh: '响了 6 声，没有语音信箱', en: 'Rang 6 times, no voicemail', c: '#d48a00' }], tag: 'No answer', hzh: '没人接听' };
    if (s.flow === 'dentist') {
      const x = s.holdAns === 'approve', held = s.holdAns === 'timeout' || s.mode === 'handoff';
      return { ...base, kind: 'booked', xray: x, label: 'BOOKED', labelColor: '#137a3a', title: '周四 下午 2:00', titleEn: 'Thursday, October 8 · 2:00 pm · Cleaning',
        bullets: [{ zh: '带上保险卡', en: 'Bring your insurance card', c: '#1a9e4b' },
          x ? { zh: '加做 X 光（$80）', en: 'X-rays added ($80)', c: '#1a9e4b' } : { zh: held ? 'X 光（$80）没答应，等您决定' : 'X 光（$80）这次不做', en: held ? 'X-rays ($80) held for your decision' : 'Skipped the X-rays ($80)', c: '#5b3cc4' }],
        primary: 'Add to calendar', tag: 'Booked', hzh: '已预约：周四 下午 2:00 洗牙' };
    }
    if (s.flow === 'followup') return { ...base, kind: 'booked', xray: /X/.test(s.fu.zh), label: 'UPDATED', labelColor: '#137a3a', title: '已更新预约', titleEn: s.fu.en, bullets: [{ zh: s.fu.zh, en: s.fu.en, c: '#1a9e4b' }], primary: 'Add to calendar', tag: 'Updated', hzh: '已更新：' + s.fu.zh };
    if (s.flow === 'food') return { ...base, kind: 'info', label: 'ANSWERED', labelColor: '#2557e8', title: '今晚营业到 10 点', titleEn: `${inf.who} is open until 10 pm tonight.`, bullets: [{ zh: '电话里确认过，不是网上信息', en: 'Confirmed on the phone, not from a listing', c: '#1a9e4b' }], primary: 'Get directions', tag: 'Answered', hzh: '营业到晚上 10 点' };
    const r = (s.ctx || {}).reply;
    return { ...base, kind: 'delivered', label: 'DELIVERED', labelColor: '#2557e8', title: '已转达', titleEn: `${inf.who} knows you'll be about an hour late.`,
      bullets: [r ? { zh: '对方说：路上小心', en: 'They said: drive safe', c: '#1a9e4b' } : { zh: '对方说：好的，谢谢告诉我', en: 'They said: thanks for letting me know', c: '#1a9e4b' }], primary: 'Done', tag: 'Delivered', hzh: '已转达：今晚会晚到一小时' };
  }

  function historyResult(it) {
    const [bg, fg] = TAGS[it.tag] || TAGS.Delivered, parts = it.zh.split('：');
    const fail = it.tag === 'No answer' || it.tag === 'Not booked';
    return { kind: fail ? 'fail' : 'delivered', who: it.who, dur: '1:12', label: it.tag.toUpperCase(), labelColor: fg, title: parts[0], titleEn: '', bullets: parts[1] ? [{ zh: parts[1], en: '', c: fg }] : [], tx: [], flow: 'msg', ctx: {}, goalZh: parts[1] || it.zh, goalEn: '', isFood: it.who.includes('Esquina'), primary: 'Done' };
  }

  function talkSetup(r) {
    if (r.flow === 'dentist') return {
      msgs: [{ ai: true, zh: '挺顺利的：周四下午 2 点洗牙约好了。' + (r.xray ? '也加做了 X 光（$80）。' : '诊所提出加做 $80 的 X 光，这次没做。'), en: 'It went well: cleaning booked Thursday at 2.' + (r.xray ? ' X-rays added ($80).' : ' They offered $80 X-rays; we skipped them for now.') }],
      chips: r.xray ? ['需要带什么吗？', '可以改到周五吗？'] : ['需要带什么吗？', '打回去，X 光也做吧'],
    };
    return { msgs: [{ ai: true, zh: `${r.title}。${r.bullets[0] ? r.bullets[0].zh + '。' : ''}`, en: r.titleEn || '' }], chips: ['他们具体怎么说的？', '再打一次'] };
  }

  function talkReply(chip, r) {
    if (chip === '需要带什么吗？') return { zh: '前台说就诊时带上保险卡就行。', en: 'The front desk said to bring your insurance card.' };
    if (chip === '打回去，X 光也做吧') return { zh: '好的。我准备了一通后续电话，只问 X 光这件事。', en: "Okay. I've set up a follow-up call about just the X-rays.", fu: { zh: '同意加做 X 光（$80）', en: 'Add the X-rays ($80)', charges: 'Up to $80' } };
    if (chip === '可以改到周五吗？') return { zh: '可以，我准备了一通后续电话，只改时间。', en: "Sure, I've set up a follow-up call that only changes the time.", fu: { zh: '改到周五下午', en: 'Move it to Friday afternoon', charges: 'None' } };
    if (chip === '他们具体怎么说的？') {
      const t = (r.tx || []).filter(l => l.who === 'them').pop();
      return t ? { zh: `他们说：“${t.zh}”`, en: `They said: “${t.en}”` } : { zh: '这通电话没有留下逐字记录。', en: "There's no transcript for this call." };
    }
    return { zh: '好的，我准备了同样的电话。', en: "Okay, I've set up the same call again.", fu: { zh: r.goalZh, en: r.goalEn, charges: 'None', same: true } };
  }

  window.CB = { CONTACTS, IMPORTS, PLACES, LZ, OB, obQ, TAGS, CALLS, RAIL, CAP, HOLD_ANS, info, lines, buildResult, historyResult, talkSetup, talkReply, mm };
})();
