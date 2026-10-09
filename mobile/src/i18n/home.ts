import { languageCode } from '@shared/languages';

/**
 * Home speaks the user's language (the greeting, the question, the suggestions), like the
 * assistant does; the rest of the UI chrome stays English for v1. Languages without an entry
 * fall back to English.
 */

interface HomeText {
  morning: string;
  afternoon: string;
  evening: string;
  /** Joins the greeting and the name: "下午好，伟" / "Good afternoon, Wei". */
  withName: (greeting: string, name: string) => string;
  title: string;
  call: (name: string) => string;
  nearestPharmacy: string;
  nearestRestaurant: string;
}

const en: HomeText = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  withName: (g, n) => `${g}, ${n}`,
  title: 'Who should I call?',
  call: (n) => `Call ${n}`,
  nearestPharmacy: 'The nearest pharmacy',
  nearestRestaurant: 'A restaurant nearby',
};

const TEXT: Record<string, HomeText> = {
  en,
  zh: { morning: '早上好', afternoon: '下午好', evening: '晚上好', withName: (g, n) => `${g}，${n}`, title: '想打给谁？', call: (n) => `打给 ${n}`, nearestPharmacy: '最近的药店', nearestRestaurant: '附近的餐厅' },
  yue: { morning: '早晨', afternoon: '午安', evening: '晚安', withName: (g, n) => `${g}，${n}`, title: '想打俾邊個？', call: (n) => `打俾 ${n}`, nearestPharmacy: '最近嘅藥房', nearestRestaurant: '附近嘅餐廳' },
  es: { morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches', withName: (g, n) => `${g}, ${n}`, title: '¿A quién llamo?', call: (n) => `Llamar a ${n}`, nearestPharmacy: 'La farmacia más cercana', nearestRestaurant: 'Un restaurante cerca' },
  vi: { morning: 'Chào buổi sáng', afternoon: 'Chào buổi chiều', evening: 'Chào buổi tối', withName: (g, n) => `${g}, ${n}`, title: 'Bạn muốn gọi cho ai?', call: (n) => `Gọi ${n}`, nearestPharmacy: 'Nhà thuốc gần nhất', nearestRestaurant: 'Nhà hàng gần đây' },
  ko: { morning: '좋은 아침이에요', afternoon: '안녕하세요', evening: '좋은 저녁이에요', withName: (g, n) => `${n}님, ${g}`, title: '누구에게 전화할까요?', call: (n) => `${n}에게 전화`, nearestPharmacy: '가장 가까운 약국', nearestRestaurant: '근처 식당' },
  tl: { morning: 'Magandang umaga', afternoon: 'Magandang hapon', evening: 'Magandang gabi', withName: (g, n) => `${g}, ${n}`, title: 'Sino ang tatawagan ko?', call: (n) => `Tawagan si ${n}`, nearestPharmacy: 'Pinakamalapit na botika', nearestRestaurant: 'Kainan sa malapit' },
  ja: { morning: 'おはようございます', afternoon: 'こんにちは', evening: 'こんばんは', withName: (g, n) => `${n}さん、${g}`, title: '誰に電話しますか？', call: (n) => `${n}に電話`, nearestPharmacy: '一番近い薬局', nearestRestaurant: '近くのレストラン' },
  fr: { morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir', withName: (g, n) => `${g}, ${n}`, title: 'Qui dois-je appeler ?', call: (n) => `Appeler ${n}`, nearestPharmacy: 'La pharmacie la plus proche', nearestRestaurant: 'Un restaurant à côté' },
  pt: { morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite', withName: (g, n) => `${g}, ${n}`, title: 'Para quem devo ligar?', call: (n) => `Ligar para ${n}`, nearestPharmacy: 'A farmácia mais próxima', nearestRestaurant: 'Um restaurante perto' },
  de: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend', withName: (g, n) => `${g}, ${n}`, title: 'Wen soll ich anrufen?', call: (n) => `${n} anrufen`, nearestPharmacy: 'Die nächste Apotheke', nearestRestaurant: 'Ein Restaurant in der Nähe' },
  it: { morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera', withName: (g, n) => `${g}, ${n}`, title: 'Chi devo chiamare?', call: (n) => `Chiama ${n}`, nearestPharmacy: 'La farmacia più vicina', nearestRestaurant: 'Un ristorante vicino' },
  ru: { morning: 'Доброе утро', afternoon: 'Добрый день', evening: 'Добрый вечер', withName: (g, n) => `${g}, ${n}`, title: 'Кому позвонить?', call: (n) => `Позвонить: ${n}`, nearestPharmacy: 'Ближайшая аптека', nearestRestaurant: 'Ресторан рядом' },
  uk: { morning: 'Доброго ранку', afternoon: 'Добрий день', evening: 'Добрий вечір', withName: (g, n) => `${g}, ${n}`, title: 'Кому зателефонувати?', call: (n) => `Зателефонувати: ${n}`, nearestPharmacy: 'Найближча аптека', nearestRestaurant: 'Ресторан поруч' },
  ar: { morning: 'صباح الخير', afternoon: 'مساء الخير', evening: 'مساء الخير', withName: (g, n) => `${g}، ${n}`, title: 'بمن أتصل؟', call: (n) => `اتصل بـ ${n}`, nearestPharmacy: 'أقرب صيدلية', nearestRestaurant: 'مطعم قريب' },
  hi: { morning: 'सुप्रभात', afternoon: 'नमस्ते', evening: 'शुभ संध्या', withName: (g, n) => `${g}, ${n}`, title: 'किसे फ़ोन करूँ?', call: (n) => `${n} को फ़ोन करें`, nearestPharmacy: 'सबसे पास की फ़ार्मेसी', nearestRestaurant: 'पास का रेस्टोरेंट' },
};

export function homeText(language: string): HomeText {
  if (/cantonese/i.test(language)) return TEXT.yue!;
  return TEXT[languageCode(language) ?? 'en'] ?? en;
}

export function greetingFor(t: HomeText, name: string, hour = new Date().getHours()): string {
  const g = hour < 12 ? t.morning : hour < 18 ? t.afternoon : t.evening;
  return name ? t.withName(g, name) : g;
}
