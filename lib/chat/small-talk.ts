function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 2;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + Number(left[row - 1] !== right[column - 1]),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function matchesShortPhraseWithTypos(value: string, phrase: string) {
  const words = value.split(/\s+/u);
  const expected = phrase.split(/\s+/u);
  return words.length === expected.length
    && words.every((word, index) => word.length >= 3 && editDistance(word, expected[index]) <= 1);
}

export function createSmallTalkAnswer(message: string, language: string, botName = "Website Assistant"): string | null {
  const normalized = message.trim().toLocaleLowerCase().replace(/[!?.،؟]+$/u, "").trim();
  const arabicGreeting = /^(مرحبا|مرحباً|اهلا|أهلا|أهلاً|السلام عليكم)$/u.test(normalized);
  const englishGreeting = /^(hi|hello|hey|howdy|good morning|good afternoon|good evening)$/u.test(normalized);
  const identityQuestion = /^(what(?:'s| is) your name|who are you|what are you called)$/u.test(normalized);
  const arabicIdentityQuestion = /^(ما اسمك|من انت|من أنت|اسمك|شسمك|شنسمك|شنو اسمك|وش اسمك|ايش اسمك|إيش اسمك)$/u.test(normalized);
  const wellbeingQuestion = /^(how are you|how are you doing|how is it going|how's it going)$/u.test(normalized)
    || matchesShortPhraseWithTypos(normalized, "how are you");
  const availabilityQuestion = /^(?:what(?: are|'re) you doing(?: today)?|what are you up to)$/u.test(normalized);
  const arabicWellbeingQuestion = /^(كيف حالك|شلونك|شخبارك|وش اخبارك|وش أخبارك|شنو اخبارك|شنو أخبارك|اخبارك|أخبارك|كيفك)$/u.test(normalized);
  const acknowledgement = /^(ok|okay|alright|got it|understood|sure|cool|great|nice)$/u.test(normalized);
  const thanks = /^(thanks|thank you|thank you very much|thx)$/u.test(normalized);
  const goodbye = /^(bye|goodbye|see you|see you later)$/u.test(normalized);
  const arabicAcknowledgement = /^(حسنا|حسناً|تمام|شكرا|شكراً|مع السلامة)$/u.test(normalized);
  const affectionQuestion = /^(do you (?:love|like) me|are you my friend)$/u.test(normalized);
  const preferenceQuestion = /^(?:which|what) do you prefer\b|^do you prefer\b/u.test(normalized);
  const arabicAffectionQuestion = /^(هل تحبني|تحبني|تحبني؟|انت صديقي|أنت صديقي)$/u.test(normalized);
  const arabicPreferenceQuestion = /^(شنو تفضل|وش تفضل|ماذا تفضل|هل تفضل)/u.test(normalized);

  if (identityQuestion || arabicIdentityQuestion) {
    return language === "ar" || arabicIdentityQuestion
      ? `أنا ${botName}، مساعدك الافتراضي.`
      : `I'm ${botName}, your virtual assistant.`;
  }
  if (arabicWellbeingQuestion) return "أنا بخير، شكراً لسؤالك! كيف يمكنني مساعدتك اليوم؟";
  if (wellbeingQuestion) return "I'm doing well, thank you! How can I help you today?";
  if (availabilityQuestion) return "I'm here and ready to help. What would you like to know?";
  if (acknowledgement) return "Got it! Let me know if you need anything else.";
  if (thanks) return "You're welcome! Let me know if there’s anything else I can help with.";
  if (goodbye) return "Goodbye! Feel free to come back whenever you need help.";
  if (affectionQuestion) return "I'm here to help, and I always enjoy hearing from you!";
  if (preferenceQuestion) return "I don't have personal preferences. I can help with questions about this organization.";
  if (arabicAffectionQuestion) return "أنا هنا لمساعدتك، ويسعدني دائماً التحدث معك!";
  if (arabicPreferenceQuestion) return "ليس لدي تفضيلات شخصية. يمكنني مساعدتك فقط في الأسئلة المتعلقة بهذه الجهة.";
  if (arabicAcknowledgement) {
    if (/مع السلامة/u.test(normalized)) return "مع السلامة! أنا هنا متى احتجت إلى المساعدة.";
    if (/شكرا|شكراً/u.test(normalized)) return "على الرحب والسعة! هل يمكنني مساعدتك في شيء آخر؟";
    return "تمام! أخبرني إذا احتجت إلى أي معلومات أخرى.";
  }
  if (!arabicGreeting && !englishGreeting) return null;
  return language === "ar" || arabicGreeting
    ? "مرحباً! كيف يمكنني مساعدتك اليوم؟"
    : "Hello! How can I help you today?";
}
