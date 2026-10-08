import * as Haptics from 'expo-haptics';

/**
 * The app's haptic vocabulary, so the same moment always feels the same. iOS turns these off
 * by itself when the user disables System Haptics. Every call is fire-and-forget.
 */
const run = (p: Promise<void>) => void p.catch(() => {});

export const haptic = {
  /** Any ordinary button. */
  tap: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Buttons that start or end something real: Call now, End call, Approve. */
  commit: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Choosing among options: chips, segmented controls, toggles, menu items. */
  select: () => run(Haptics.selectionAsync()),
  /** The talk button goes down: the mic is live. */
  talkDown: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** The talk button comes up: what was said is sent. */
  talkUp: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  /** The edge swipe crossed the point where letting go opens the menu. */
  edgeReady: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** Someone is on hold for the user: needs attention now. */
  attention: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** The call connected. */
  connected: () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A good result (booked, delivered, answered, added to calendar). */
  success: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** It didn't work (no answer, refused, an error). */
  failure: () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
