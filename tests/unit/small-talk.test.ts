import { describe, expect, it } from "vitest";
import { createSmallTalkAnswer } from "@/lib/chat/small-talk";

describe("small-talk responses", () => {
  it("answers English greetings locally", () => {
    expect(createSmallTalkAnswer("Hello!", "en")).toBe("Hello! How can I help you today?");
  });

  it("answers Arabic greetings locally", () => {
    expect(createSmallTalkAnswer("السلام عليكم", "ar")).toBe("مرحباً! كيف يمكنني مساعدتك اليوم؟");
    expect(createSmallTalkAnswer("شخبارك؟", "ar")).toContain("أنا بخير");
  });

  it("does not intercept factual questions", () => {
    expect(createSmallTalkAnswer("What is your phone number?", "en")).toBeNull();
  });

  it("answers identity questions without using knowledge retrieval", () => {
    expect(createSmallTalkAnswer("What is your name?", "en", "K-Bot")).toBe("I'm K-Bot, your virtual assistant.");
    expect(createSmallTalkAnswer("شسمك؟", "ar", "K-Bot")).toContain("K-Bot");
    expect(createSmallTalkAnswer("شنسمك", "ar", "K-Bot")).toContain("K-Bot");
  });

  it("handles ordinary conversation without using knowledge retrieval", () => {
    const wellbeing = createSmallTalkAnswer("How are you?", "en", "Victorious Bot");
    expect(wellbeing).toContain("doing well");
    expect(wellbeing).not.toContain("K-Labs");
    expect(createSmallTalkAnswer("What are you doing today?", "en")).toContain("ready to help");
    expect(createSmallTalkAnswer("hoq are you", "en")).toContain("doing well");
    expect(createSmallTalkAnswer("ok", "en")).toContain("Got it");
    expect(createSmallTalkAnswer("thank you", "en")).toContain("welcome");
    expect(createSmallTalkAnswer("do you love me?", "en")).toContain("hearing from you");
    expect(createSmallTalkAnswer("do you prefer Iran or Bahrain?", "en")).toContain("this organization");
    expect(createSmallTalkAnswer("شنو تفضل البحرين أو إيران؟", "ar")).toContain("هذه الجهة");
  });
});
