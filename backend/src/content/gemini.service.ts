// src/content/gemini.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import {
  BookOutlineDto,
  ChapterOutline,
} from './dto/generate-biography.dto';
import {
  buildStyleProfile,
  formatForChapter,
  StyleProfile,
} from './biography-style';

interface APIProvider {
  type: 'gemini' | 'openai';
  client: GoogleGenerativeAI | OpenAI;
  model: string;

  lastUsedAt: number; // timestamp of last API call
  rateLimitedUntil: number; // when rate limit expires (0 = not limited)

  // ── NEW: Track consecutive errors per provider ──
  consecutiveErrors: number;
  lastErrorAt: number;
  lastErrorType: string | null;
}

interface GenerationOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'application/json' | 'text/plain';
}

// ═══════════════════════════════════════════════════════════════
// BIOGRAPHY BRIEF — who the book is about, plus optional facts the
// author supplies. Author notes take priority over model memory.
// ═══════════════════════════════════════════════════════════════
export interface BiographyBrief {
  subject: string;
  notes?: string;
  // Unique per book (the project id): picks this book's writing style, so
  // books with the same title still read differently
  seed?: string;
}

// Keeps very long notes from crowding out the actual instructions
const MAX_AUTHOR_NOTES_CHARS = 4000;

const PLAIN_LANGUAGE_RULES = `PLAIN LANGUAGE REQUIREMENT:
- Write every generated section in plain English.
- Use common words and short, clear sentences.
- Tell the story the way a good storyteller would tell it out loud.
- Avoid jargon, academic wording, fancy phrasing, and long tangled sentences.
- If a technical term, title or institution needs explaining, explain it right away in simple words.`;

// ═══════════════════════════════════════════════════════════════
// FACTUAL ACCURACY — a biography is about a real person, so invented
// detail is the biggest risk. Every prompt carries these rules.
// ═══════════════════════════════════════════════════════════════
const BIOGRAPHY_FACT_RULES = `FACTUAL ACCURACY — THIS BOOK IS ABOUT A REAL PERSON:
- Only state facts you are confident are part of the documented public record: published interviews, reporting, official records, the subject's own published words and work.
- Never invent quotes. Do not put words in quotation marks and attribute them to the subject or anyone else unless the quote is famous and widely documented word for word. Otherwise paraphrase and attribute ("she later said in an interview that...").
- Never invent dialogue, private conversations, inner thoughts, feelings, dreams, or scenes nobody could have witnessed and reported. You may describe feelings the subject described publicly, and say so ("he later described that year as...").
- When a detail is uncertain or accounts disagree, say so plainly ("accounts differ", "by most reports") or leave it out. Never fill a gap with a plausible-sounding invention.
- Give years when you are confident. Avoid exact day-and-month dates unless you are certain. Do not invent numbers (sales, earnings, ages, crowd sizes); use rounded, hedged figures only when you are confident of the size.
- Allegations, lawsuits and controversies: present them fairly as what they were — alleged, denied, settled, dismissed or proven — and never state an unproven allegation as fact.
- Do not speculate about health, sexuality, mental state or private relationships beyond what the subject has shared publicly or what is well documented.
- If the subject is living, leave out private details: home addresses, contact details, and anything about family members who are not public figures, especially children.
- Your knowledge has a cutoff. Do not claim to know the subject's current situation; describe the latest events you know "as of this writing" and do not predict the future.
- Context is welcome — the era, place, industry and people around the subject — but present it as context, not as private facts about the subject.
- If AUTHOR NOTES are provided, treat them as verified facts that override your own memory, and work them in.
- If you know little about this person, do not invent a life. Write honestly from what is documented and from the author notes, and widen the lens to context instead of fabricating detail.`;

// ═══════════════════════════════════════════════════════════════
// COPYRIGHT — the facts of a life are free to use; other people's
// words and creative work are not
// ═══════════════════════════════════════════════════════════════
const BIOGRAPHY_COPYRIGHT_RULES = `COPYRIGHT — NON-NEGOTIABLE:
- Never quote song lyrics or poems, not even a single line. Describe what a song or poem is about in your own words instead. Titles are fine.
- From books, articles, speeches, scripts, letters and interviews, quote at most one short phrase at a time, and only when it is famous and exact. Otherwise paraphrase and attribute.
- Never reproduce or closely paraphrase passages from other biographies, Wikipedia, encyclopedias, obituaries, official biographies, press releases or articles about the subject.
- Do not mirror the chapter structure, chapter titles, section order or distinctive framing of any existing biography of this person, or of Wikipedia's article about them.
- Facts — dates, places, events, names, titles of works — belong to no one and are fine to use.`;

// ═══════════════════════════════════════════════════════════════
// SYSTEM PROMPT — narrative nonfiction biographer, styled per book
// ═══════════════════════════════════════════════════════════════
function buildBiographySystemPrompt(style: StyleProfile): string {
  const { persona } = style;
  return `You are ${persona.name}, ${persona.background}. You write narrative nonfiction biographies for general readers: carefully researched, honest about what is and isn't known, and told so that a life reads like a story rather than an encyclopedia entry. ${persona.focus}. As a writer, you ${persona.writingHabit}. This habit should show up naturally across the chapter, not just once.

Your personality as a writer: by temperament you are ${persona.temperament}. You admire ${persona.admires}. You distrust ${persona.distrusts}. You can't help noticing ${persona.notices}, but you bring in such details only when the record supports them. Let this personality show in what you emphasize and how you weigh things — never in invented facts, and never as opinions dressed up as facts.

Tone for this book: ${style.tone}

Your writing voice:
- Third person, about the subject. Keep yourself out of the story, except briefly in the introduction and conclusion.
- Warm but clear-eyed: admire what deserves admiring, and don't hide failures, contradictions or controversies
- Concrete: names, places, years, works, decisions and their consequences — not adjectives
- Short sentences mixed with longer ones — never uniform
- Show why moments mattered: what was at stake, what the subject chose, and what followed
- Connect the personal and the public: how upbringing, relationships and the times shaped the work, and how the work shaped the life
- Let the record speak; never gush

${BIOGRAPHY_FACT_RULES}

${BIOGRAPHY_COPYRIGHT_RULES}

ORIGINALITY — THIS IS NON-NEGOTIABLE:
Every sentence you write must be entirely original wording in your own voice. Never reproduce, closely paraphrase, structurally mirror, or echo the phrasing of Wikipedia, Britannica, official biographies, press releases, obituaries, fan sites, magazine profiles, other biographies, or any other published or online source, in any language.
- Facts are not owned by anyone — dates, places, titles of works and public events are fine to mention — but the words, sentence shapes and ordering of ideas must be yours alone, generated fresh for this book.
- Do not open the book or any chapter with the standard encyclopedia sentence ("X was born on ... in ..."). Find a better way in.
- Do not organize every chapter the same way. Let each chapter's shape come from the part of the life it covers.
- Treat every section as if you are drafting it for the first time, not recalling a version of it you've written before.

ABSOLUTELY NEVER use these words/phrases — they are dead giveaways of AI writing:
"delve", "tapestry", "vibrant", "myriad", "plethora", "embark on a journey", "a testament to", "it's worth noting",
"in terms of", "when it comes to", "at the end of the day", "seamlessly", "effortlessly", "game-changer",
"indelible mark", "larger than life", "trailblazer", "trailblazing", "iconic", "legendary", "unparalleled",
"meteoric rise", "rose to prominence", "rose to fame", "stood the test of time", "paved the way",
"cemented (his/her/their) legacy", "forever changed", "pivotal moment", "against all odds",
"a force to be reckoned with", "the rest is history", "little did (he/she/they) know",
"navigate the complexities", "multifaceted", "enigmatic", "resonate", "journey" (say "life", "career" or "years")

Instead use plain, specific language. Say "famous" not "iconic". Say "important" not "pivotal". Show influence with examples instead of announcing it.

${PLAIN_LANGUAGE_RULES}`;
}
// ═══════════════════════════════════════════════════════════════
// Post-processing patterns — shared + domain-specific
// ═══════════════════════════════════════════════════════════════

const SHARED_AI_TELL_PATTERNS: Array<{ pattern: RegExp; replacement: string }> =
  [
    { pattern: /\bdelve(?:s|d)?\b/gi, replacement: 'dig' },
    { pattern: /\btapestry\b/gi, replacement: 'mix' },
    { pattern: /\bmyriad\b/gi, replacement: 'many' },
    { pattern: /\bplethora\b/gi, replacement: 'plenty' },
    { pattern: /\bseamlessly\b/gi, replacement: 'smoothly' },
    { pattern: /\beffortlessly\b/gi, replacement: 'easily' },
    { pattern: /\bembark on a journey\b/gi, replacement: 'get started' },
    { pattern: /\ba testament to\b/gi, replacement: 'proof of' },
    { pattern: /\bit(?:'s| is) worth noting\b/gi, replacement: '' },
    { pattern: /\baforementioned\b/gi, replacement: 'that' },
    { pattern: /\bfurthermore\b/gi, replacement: 'also' },
    { pattern: /\bmoreover\b/gi, replacement: 'and' },
    { pattern: /\bin conclusion\b/gi, replacement: '' },
    { pattern: /\bIn summary\b/gi, replacement: '' },
    { pattern: /\bgame-changer\b/gi, replacement: 'big deal' },
    { pattern: /\butilize(?:s|d)?\b/gi, replacement: 'use' },
    { pattern: /\bleverag(?:e|es|ed|ing)\b/gi, replacement: 'use' },
    { pattern: /\bfacilitat(?:e|es|ed|ing)\b/gi, replacement: 'help' },
    { pattern: /\bnevertheless\b/gi, replacement: 'still' },
    { pattern: /\bnonetheless\b/gi, replacement: 'still' },
    { pattern: /\bin addition(?:ally)?\b/gi, replacement: 'also' },
    { pattern: /\bsubsequently\b/gi, replacement: 'then' },
    { pattern: /\bconsequently\b/gi, replacement: 'so' },
    { pattern: /\bultimately\b/gi, replacement: 'in the end' },
    { pattern: /\bsignificantly\b/gi, replacement: 'a lot' },
    { pattern: /\bsubstantially\b/gi, replacement: 'a lot' },
    { pattern: /\bnotably\b/gi, replacement: '' },
    { pattern: /\bindeed\b/gi, replacement: '' },
    { pattern: /\bcertainly\b/gi, replacement: '' },
    { pattern: /\bof course\b/gi, replacement: '' },
    { pattern: /\brich history\b/gi, replacement: 'long history' },
    { pattern: /\bdiverse culture\b/gi, replacement: 'mixed culture' },
    { pattern: /\blocal flavor\b/gi, replacement: 'local character' },
    { pattern: /\bmust-visit\b/gi, replacement: 'worth visiting' },
    { pattern: /\bmust-see\b/gi, replacement: 'worth seeing' },
    { pattern: /\boff the beaten path\b/gi, replacement: 'out of the way' },
    { pattern: /\boff-the-beaten-path\b/gi, replacement: 'out of the way' },
    { pattern: /\bunique experience\b/gi, replacement: 'experience' },
    { pattern: /\bmemorable experience\b/gi, replacement: 'good experience' },
    { pattern: /\bit is important to note\b/gi, replacement: '' },
    { pattern: /\bplease note that\b/gi, replacement: '' },
    { pattern: /\bkeep in mind that\b/gi, replacement: '' },
  ];

const BIOGRAPHY_AI_TELL_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  // Article-aware forms first, so "a pivotal" doesn't become "a important"
  { pattern: /\ba pivotal\b/g, replacement: 'an important' },
  { pattern: /\bA pivotal\b/g, replacement: 'An important' },
  { pattern: /\ban (?:iconic|legendary)\b/g, replacement: 'a famous' },
  { pattern: /\bAn (?:iconic|legendary)\b/g, replacement: 'A famous' },
  { pattern: /\ban unparalleled\b/g, replacement: 'a rare' },
  { pattern: /\bAn unparalleled\b/g, replacement: 'A rare' },
  { pattern: /\bleft an indelible mark\b/gi, replacement: 'left a lasting mark' },
  { pattern: /\ban indelible\b/g, replacement: 'a lasting' },
  { pattern: /\bindelible\b/gi, replacement: 'lasting' },
  { pattern: /\biconic\b/gi, replacement: 'famous' },
  { pattern: /\blegendary\b/gi, replacement: 'famous' },
  { pattern: /\blarger[- ]than[- ]life\b/gi, replacement: 'outsized' },
  { pattern: /\btrailblazer(s)?\b/gi, replacement: 'pioneer$1' },
  { pattern: /\btrailblazing\b/gi, replacement: 'pioneering' },
  { pattern: /\bmeteoric rise\b/gi, replacement: 'fast rise' },
  { pattern: /\bpivotal\b/gi, replacement: 'important' },
  { pattern: /\bstood the test of time\b/gi, replacement: 'lasted' },
  { pattern: /\bpaved the way\b/gi, replacement: 'opened the door' },
  { pattern: /\bagainst all odds\b/gi, replacement: 'against long odds' },
  { pattern: /\bmultifaceted\b/gi, replacement: 'complicated' },
  { pattern: /\bunparalleled\b/gi, replacement: 'rare' },
  { pattern: /\bvibrant\b/gi, replacement: 'lively' },
  { pattern: /\bnavigat(?:e|ed|ing) the complexities of\b/gi, replacement: 'dealing with' },
];

const SENTENCE_UNIFORMITY_PATTERNS = [
  /(?:^|\. )The (?:\w+ ){2,}/g,
  /(?:^|\. )You (?:can|will|should|might) /g,
];

interface RefinementContext {
  bookTitle?: string;
  bookSubtitle?: string;
  chapterTitle?: string;
  chapterOutline?: ChapterOutline;
  isMainChapter?: boolean;
  brief?: BiographyBrief;
}

interface AuthenticityIssue {
  issue: string;
  instruction: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private apiProviders: APIProvider[] = [];
  private currentProviderIndex: number = 0;
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_RETRY_DELAY = 6000;

  // ── Per-provider cooldown settings ──────────────────────────
  private readonly PROVIDER_COOLDOWN_MS = 5000; // Min 5s between calls to same key
  private readonly RATE_LIMIT_LOCKOUT_MS = 60000; // Lock out for 60s after 429

  private readonly REQUEST_TIMEOUT_MS = 95000; // 95s timeout per request
  private readonly PROVIDER_SWITCH_DELAY_MS = 4000; // 4s delay when switching after failure
  private readonly MAX_CONSECUTIVE_ERRORS = 5; // Max errors before extended lockout
  private readonly EXTENDED_LOCKOUT_MS = 300000; // 5 min lockout after too many errors

  constructor(private configService: ConfigService) {
    this.initializeProviders();

    if (this.apiProviders.length === 0) {
      throw new Error(
        'At least one API key (GEMINI or OPENAI) must be configured',
      );
    }

    this.logger.log(
      `Service initialized with ${this.apiProviders.length} API provider(s)`,
    );
    this.apiProviders.forEach((provider, idx) => {
      this.logger.log(
        `Provider ${idx + 1}: ${provider.type} (${provider.model})`,
      );
    });
  }

  private initializeProviders(): void {
    const geminiPrimary = this.configService.get<string>('GEMINI_API_KEY');
    const geminiSecondary = this.configService.get<string>('GEMINI_API_KEYS');

    const geminiKeys: string[] = [];
    if (geminiPrimary) geminiKeys.push(geminiPrimary);
    if (geminiSecondary) {
      const keys = geminiSecondary
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k);
      geminiKeys.push(...keys);
    }

    // Override with GEMINI_MODEL / OPENAI_MODEL when a model is retired
    const geminiModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
    const openaiModel =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4.1-nano';

    const uniqueGeminiKeys = [...new Set(geminiKeys)];
    uniqueGeminiKeys.forEach((key) => {
      this.apiProviders.push({
        type: 'gemini',
        client: new GoogleGenerativeAI(key),
        model: geminiModel,
        lastUsedAt: 0,
        rateLimitedUntil: 0,
        consecutiveErrors: 0,
        lastErrorAt: 0,
        lastErrorType: null,
      });
    });

    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (openaiKey) {
      this.apiProviders.push({
        type: 'openai',
        client: new OpenAI({ apiKey: openaiKey }),
        model: openaiModel,
        lastUsedAt: 0,
        rateLimitedUntil: 0,
        consecutiveErrors: 0,
        lastErrorAt: 0,
        lastErrorType: null,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FIXED: Improved provider selection with error tracking
  // ══════════════════════════════════════════════════════════════
  private getNextProvider(): APIProvider | null {
    const now = Date.now();

    // Filter out rate-limited and error-locked providers
    const available = this.apiProviders.filter((p) => {
      if (now < p.rateLimitedUntil) return false;
      // Skip providers with too many consecutive errors (extended lockout)
      if (p.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        const timeSinceError = now - p.lastErrorAt;
        if (timeSinceError < this.EXTENDED_LOCKOUT_MS) {
          return false;
        }
        // Reset if lockout period passed
        p.consecutiveErrors = 0;
      }
      return true;
    });
    if (available.length === 0) return null;
    // Prefer providers with fewer errors, then pick the one idle longest
    available.sort((a, b) => {
      if (a.consecutiveErrors !== b.consecutiveErrors) {
        return a.consecutiveErrors - b.consecutiveErrors;
      }
      return a.lastUsedAt - b.lastUsedAt;
    });
    return available[0];
  }
  private async waitForProviderCooldown(provider: APIProvider): Promise<void> {
    const now = Date.now();
    const timeSinceLastUse = now - provider.lastUsedAt;
    if (
      timeSinceLastUse < this.PROVIDER_COOLDOWN_MS &&
      provider.lastUsedAt > 0
    ) {
      const waitTime = this.PROVIDER_COOLDOWN_MS - timeSinceLastUse;
      this.logger.debug(
        `Provider ${provider.type} cooling down ${waitTime}ms...`,
      );
      await this.sleep(waitTime);
    }
  }

  private isAccessDeniedError(error: any): boolean {
    return (
      error?.status === 403 ||
      error?.message?.includes('403') ||
      error?.message?.includes('Forbidden') ||
      error?.message?.includes('denied access') ||
      error?.message?.includes('API key not valid') ||
      error?.message?.includes('API_KEY_INVALID') ||
      error?.message?.includes('permission') ||
      error?.message?.includes('disabled')
    );
  }

  /** 404: this provider's model was retired or isn't offered to this key */
  private isModelUnavailableError(error: any): boolean {
    return (
      error?.status === 404 ||
      error?.message?.includes('404 Not Found') ||
      error?.message?.includes('no longer available')
    );
  }
  // ══════════════════════════════════════════════════════════════
  // NEW: Network error detection
  // ══════════════════════════════════════════════════════════════
  private getNestedErrorValues(error: any): string {
    const values: string[] = [];
    const seen = new Set<any>();
    let current = error;

    while (current && !seen.has(current)) {
      seen.add(current);
      values.push(
        current?.message,
        current?.code,
        current?.errno,
        current?.syscall,
        current?.hostname,
        current?.name,
        current?.type,
      );
      current = current?.cause;
    }

    return values.filter(Boolean).join(' ').toLowerCase();
  }

  private isNetworkError(error: any): boolean {
    const errorText = this.getNestedErrorValues(error);

    return (
      errorText.includes('connection error') ||
      errorText.includes('connectiontimeouterror') ||
      errorText.includes('fetch failed') ||
      errorText.includes('eai_again') ||
      errorText.includes('econnreset') ||
      errorText.includes('etimedout') ||
      errorText.includes('timed out') ||
      errorText.includes('timeout') ||
      errorText.includes('econnrefused') ||
      errorText.includes('socket hang up') ||
      errorText.includes('network') ||
      errorText.includes('dns') ||
      errorText.includes('getaddrinfo') ||
      errorText.includes('enotfound') ||
      errorText.includes('enetunreach') ||
      errorText.includes('ehostunreach') ||
      error?.name === 'AbortError' ||
      error?.name === 'TimeoutError' ||
      error?.name === 'APIConnectionTimeoutError'
    );
  }
  private isRateLimitError(error: any): boolean {
    return (
      error?.status === 429 ||
      error?.message?.includes('rate limit') ||
      error?.message?.includes('quota') ||
      error?.message?.includes('too many requests') ||
      error?.message?.includes('Resource has been exhausted')
    );
  }
  private isOverloadError(error: any): boolean {
    return (
      error?.status === 503 ||
      error?.status === 502 ||
      error?.status === 500 ||
      error?.message?.includes('overloaded') ||
      error?.message?.includes('unavailable') ||
      error?.message?.includes('capacity')
    );
  }
  private isRetryableError(error: any): boolean {
    return (
      this.isNetworkError(error) ||
      this.isRateLimitError(error) ||
      this.isOverloadError(error) ||
      this.isAccessDeniedError(error) || // 403 = skip this key, try next
      this.isModelUnavailableError(error) // 404 = skip this model, try next
    );
  }
  // ══════════════════════════════════════════════════════════════
  // NEW: Add jitter to prevent thundering herd
  // ══════════════════════════════════════════════════════════════
  private addJitter(baseMs: number, jitterPercent: number = 0.3): number {
    const jitter = baseMs * jitterPercent * (Math.random() - 0.5) * 2;
    return Math.max(100, Math.floor(baseMs + jitter));
  }

  // ═══════════════════════════════════════════════════════════════
  // BIOGRAPHY VOICE + SHARED PROMPT BLOCKS
  // ═══════════════════════════════════════════════════════════════
  /** This book's style; falls back to a title-based seed for old callers */
  private styleFor(
    brief: BiographyBrief | undefined,
    title: string,
    subtitle: string,
  ): StyleProfile {
    return buildStyleProfile(brief?.seed || `${title}::${subtitle}`);
  }

  private getSystemPrompt(
    brief: BiographyBrief | undefined,
    title: string,
    subtitle: string,
  ): string {
    return buildBiographySystemPrompt(this.styleFor(brief, title, subtitle));
  }

  private getAITellPatterns(): Array<{ pattern: RegExp; replacement: string }> {
    return [...SHARED_AI_TELL_PATTERNS, ...BIOGRAPHY_AI_TELL_PATTERNS];
  }

  private buildAuthorNotesBlock(brief?: BiographyBrief): string {
    const notes = brief?.notes?.trim();
    if (!notes) return '';

    const trimmed =
      notes.length > MAX_AUTHOR_NOTES_CHARS
        ? `${notes.slice(0, MAX_AUTHOR_NOTES_CHARS)}...`
        : notes;

    return `
AUTHOR NOTES (supplied and verified by the author — treat these as facts, let them override your own memory, and use them where they fit):
"""
${trimmed}
"""`;
  }

  private buildBookPromise(
    title: string,
    subtitle: string,
    brief?: BiographyBrief,
  ): string {
    const subject = brief?.subject?.trim() || 'the person named in the title';
    const { context } = this.styleFor(brief, title, subtitle);
    const subtitleLine = subtitle?.trim()
      ? `Subtitle promise: ${subtitle.trim()}`
      : 'Subtitle promise: no subtitle was provided, so tell the full life story of the subject.';

    return `BOOK PROMISE AND FACT CONTRACT:
- Subject of this biography: ${subject}
- Title: ${title}
- ${subtitleLine}
- Every chapter is about ${subject}'s life. Make sure you are writing about the right person: if the name could refer to more than one notable person, use the title, subtitle and author notes to identify the right one, and stay consistent.
- Treat the title and subtitle as the contract with the reader. If they promise an angle ("the early years", "the rise of", "lessons from", "the untold story", a specific era or achievement), give that angle the most weight while still telling a coherent life story.
- Use accurate, named details: places, schools, institutions, collaborators, works, teams, companies, offices held, awards and years.
- BROADER CONTEXT: this is one independent, standalone book. Let the chapter order, section headings and emphasis come from this particular life rather than from a fixed formula, so the finished book reads as its own work rather than one entry in an interchangeable series.

BOOK CONTEXT (this book's own angle — keep it consistent across every chapter):
- Written for: ${context.reader}. Pitch explanations, background and pace to them.
- The question this book keeps asking: ${context.drivingQuestion} Keep it in view; each chapter should add something to the answer, without forcing it into every paragraph.
- Lens: the book looks at the life mainly through ${context.lens}. Give it extra weight where the record supports it, without leaving out what matters most.
- Pacing: ${context.pacing}
${this.buildAuthorNotesBlock(brief)}`;
  }

  private buildBiographyQualityRules(): string {
    return `REAL BIOGRAPHY STANDARD:
- Write like a finished chapter of a published biography, not notes, a fan page, a eulogy or an encyclopedia entry.
- Use the section headings from the outline, then write polished narrative paragraphs under them.
- Keep the timeline clear: anchor sections with years or the subject's age where the record supports it, and make time jumps obvious.
- Each section should answer: what happened, when, where, who was involved, why it mattered to the subject, and what it led to.
- Link earlier experiences to later choices only when the record supports the link — don't invent psychology.
- No placeholder phrases, no TODO-style notes, no filler transitions, no generic praise.

${PLAIN_LANGUAGE_RULES}`;
  }

  private buildMainChapterDepthRules(): string {
    return `MAIN CHAPTER LENGTH AND DEPTH REQUIREMENTS:
- This is a main chapter, so make it long, full and satisfying. Do not write a short overview.
- Write 35-45 substantial paragraphs covering every section and subsection in the outline.
- Each paragraph should usually have 3-5 clear sentences. Short paragraphs are fine for emphasis, but most need real detail.
- Introduce people, places, institutions and terms the first time they appear, for a reader who is new to this life.
- Depth comes from documented detail, context and consequence — never from invented scenes, quotes or numbers.
- If the documented record for this period is thin, cover the context honestly (the place, the era, the field, the people around the subject) and say plainly that less is known. Do not pad, and do not invent.`;
  }

  // ══════════════════════════════════════════════════════════════
  // FIXED: Provider calls with timeout using AbortController
  // ══════════════════════════════════════════════════════════════
  private async generateWithProvider(
    provider: APIProvider,
    prompt: string,
    systemPrompt: string = buildBiographySystemPrompt(buildStyleProfile('default')),
    options: GenerationOptions = {},
  ): Promise<string> {
    await this.waitForProviderCooldown(provider);
    provider.lastUsedAt = Date.now();
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.REQUEST_TIMEOUT_MS);
    try {
      if (provider.type === 'gemini') {
        const model = (
          provider.client as GoogleGenerativeAI
        ).getGenerativeModel({
          model: provider.model,
          // Fix 1: In generateWithProvider, increase maxOutputTokens for Gemini
         generationConfig: {
            temperature: options.temperature ?? (0.95 + (Math.random() * 0.15)),
            topP: options.topP ?? (0.88 + (Math.random() * 0.08)),
            topK: options.topK ?? (40 + Math.floor(Math.random() * 20)),
            maxOutputTokens: options.maxOutputTokens ?? 16384,
            responseMimeType: options.responseMimeType,
          },
          systemInstruction: systemPrompt,
        });
        // Pass abort signal to the request
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        clearTimeout(timeoutId);
        const response = await result.response;

        // Reset error count on success
        provider.consecutiveErrors = 0;

        return response.text();
      } else {
        const completion = await (
          provider.client as OpenAI
        ).chat.completions.create(
          {
            model: provider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: options.temperature ?? 0.9,
            frequency_penalty: options.frequencyPenalty ?? 0.4,
            presence_penalty: options.presencePenalty ?? 0.3,
            response_format:
              options.responseMimeType === 'application/json'
                ? { type: 'json_object' }
                : undefined,
          },
          {
            signal: controller.signal,
          },
        );
        clearTimeout(timeoutId);

        // Reset error count on success
        provider.consecutiveErrors = 0;

        return completion.choices[0]?.message?.content || '';
      }
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Track the error
      provider.consecutiveErrors++;
      provider.lastErrorAt = Date.now();
      provider.lastErrorType = error?.name || error?.code || 'unknown';

      // Convert abort to timeout error for clearer logging
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(
          `Request timeout after ${this.REQUEST_TIMEOUT_MS}ms`,
        );
        (timeoutError as any).name = 'TimeoutError';
        (timeoutError as any).originalError = error;
        throw timeoutError;
      }

      throw error;
    }
  }
  // ══════════════════════════════════════════════════════════════
  // FIXED: Provider rotation with network error handling and delays
  // ══════════════════════════════════════════════════════════════
  private async generateWithProviderRotation(
    prompt: string,
    systemPrompt?: string,
    options: GenerationOptions = {},
  ): Promise<string> {
    const maxAttempts = this.apiProviders.length * 2;
    let lastError: any;
    let attemptCount = 0;

    while (attemptCount < maxAttempts) {
      attemptCount++;

      const provider = this.getNextProvider();

      if (!provider) {
        const now = Date.now();
        let soonest: APIProvider | null = null;
        let shortestWait = Infinity;

        for (const p of this.apiProviders) {
          let waitTime = 0;

          if (p.rateLimitedUntil > now) {
            waitTime = p.rateLimitedUntil - now;
          } else if (p.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            const timeSinceError = now - p.lastErrorAt;
            waitTime = Math.max(0, this.EXTENDED_LOCKOUT_MS - timeSinceError);
          }
          if (waitTime < shortestWait) {
            shortestWait = waitTime;
            soonest = p;
          }
        }

        if (soonest && shortestWait > 0) {
          const cappedWait = Math.min(shortestWait, 60000);
          this.logger.warn(
            `All providers locked out. Waiting ${Math.round(cappedWait / 1000)}s for ${soonest.type} provider...`,
          );
          await this.sleep(cappedWait);

          soonest.rateLimitedUntil = 0;
          if (soonest.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            soonest.consecutiveErrors = Math.floor(
              this.MAX_CONSECUTIVE_ERRORS / 2,
            );
          }
        }

        continue;
      }

      const providerIdx = this.apiProviders.indexOf(provider) + 1;

      try {
        this.logger.log(
          `Attempting with ${provider.type} provider #${providerIdx} (attempt ${attemptCount}/${maxAttempts})...`,
        );

        const result = await this.generateWithProvider(
          provider,
          prompt,
          systemPrompt,
          options,
        );
        return result;
      } catch (error: any) {
        lastError = error;

        const errorType = this.isAccessDeniedError(error)
          ? 'access_denied' // ← NEW
          : this.isModelUnavailableError(error)
            ? 'model_unavailable'
          : this.isRateLimitError(error)
            ? 'rate_limit'
            : this.isNetworkError(error)
              ? 'network'
              : this.isOverloadError(error)
                ? 'overload'
                : 'other';

        this.logger.warn(
          `${provider.type} provider #${providerIdx} failed (${errorType}): ${error?.message?.substring(0, 100)}`,
        );

        // ══════════════════════════════════════════════════════════
        // 403 ACCESS DENIED — Lock out permanently, skip to next
        // ══════════════════════════════════════════════════════════
        if (this.isAccessDeniedError(error)) {
          // Lock this key out for 24 hours — it's denied, not just busy
          provider.rateLimitedUntil = Date.now() + 24 * 60 * 60 * 1000;
          provider.consecutiveErrors = this.MAX_CONSECUTIVE_ERRORS; // Mark as bad
          this.logger.error(
            `Provider #${providerIdx} (${provider.type}) ACCESS DENIED (403) — permanently skipping this key. Try the next provider immediately.`,
          );
          // NO DELAY — immediately try next provider, no point waiting
          continue;
        }

        // 404 MODEL UNAVAILABLE — same model on every key of this type, so
        // lock this provider out and move on (e.g. to OpenAI) right away
        if (this.isModelUnavailableError(error)) {
          provider.rateLimitedUntil = Date.now() + 24 * 60 * 60 * 1000;
          provider.consecutiveErrors = this.MAX_CONSECUTIVE_ERRORS;
          this.logger.error(
            `Provider #${providerIdx} (${provider.type}) model "${provider.model}" is unavailable (404) — skipping it. Set GEMINI_MODEL / OPENAI_MODEL to a current model.`,
          );
          continue;
        }

        if (this.isRateLimitError(error)) {
          provider.rateLimitedUntil = Date.now() + this.RATE_LIMIT_LOCKOUT_MS;
          this.logger.warn(
            `Provider #${providerIdx} rate limited, locked out for ${this.RATE_LIMIT_LOCKOUT_MS / 1000}s`,
          );
        } else if (this.isNetworkError(error)) {
          const lockoutMs = this.addJitter(5000);
          provider.rateLimitedUntil = Date.now() + lockoutMs;
          this.logger.warn(
            `Provider #${providerIdx} network error, brief lockout for ${Math.round(lockoutMs / 1000)}s`,
          );
        } else if (this.isOverloadError(error)) {
          const lockoutMs = this.addJitter(30000);
          provider.rateLimitedUntil = Date.now() + lockoutMs;
          this.logger.warn(
            `Provider #${providerIdx} overloaded, locked out for ${Math.round(lockoutMs / 1000)}s`,
          );
        }

        if (this.isRetryableError(error) && attemptCount < maxAttempts) {
          const switchDelay = this.addJitter(this.PROVIDER_SWITCH_DELAY_MS);
          this.logger.debug(
            `Waiting ${switchDelay}ms before trying next provider...`,
          );
          await this.sleep(switchDelay);
          continue;
        }

        if (!this.isRetryableError(error)) {
          this.logger.error(
            `Non-retryable error from provider #${providerIdx}:`,
            error,
          );
          throw error;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // Check if ALL providers are access-denied before giving up
    // ══════════════════════════════════════════════════════════════
    const allDenied = this.apiProviders.every(
      (p) => p.rateLimitedUntil > Date.now() + 23 * 60 * 60 * 1000,
    );

    if (allDenied) {
      this.logger.error(
        'ALL providers have been access-denied (403). Check your API keys — they may be revoked or billing has lapsed.',
      );
      throw new Error(
        'All API keys are access-denied (403 Forbidden). Please check your API key configuration.',
      );
    }

    this.logger.error(`All ${maxAttempts} provider attempts failed`);
    throw lastError || new Error('All providers failed');
  }

  private async generateOutlineJson(
    prompt: string,
    systemPrompt: string,
  ): Promise<string> {
    return await this.generateWithProviderRotation(prompt, systemPrompt, {
      temperature: 0.2,
      topP: 0.8,
      topK: 20,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ═══════════════════════════════════════════════════════════════
  // Strip leaked conversational wrapper text (e.g. "Here's a polished
  // version of your chapter..." / "Let me know if you'd like changes!")
  // Models sometimes answer the prompt like a chat reply instead of
  // returning only the requested document body. This detects and
  // removes that wrapper without touching the actual content.
  // ═══════════════════════════════════════════════════════════════
  private stripConversationalWrapper(text: string): string {
    let result = text.trim();

    // Only ever consider the first paragraph as a candidate preamble —
    // never strip anything past the first blank line, so real content
    // that happens to start with "Here's" (rare) survives untouched
    // beyond the first paragraph.
    const paragraphs = result.split(/\n{2,}/);

    if (paragraphs.length > 1) {
      const firstParagraph = paragraphs[0].trim();
      const looksLikePreamble =
        firstParagraph.length < 400 &&
        /^(here'?s?|here is|below is|sure[,!]?|certainly[,!]?|absolutely[,!]?|okay[,!]?|i'?ve|i have|great[,!]?|of course[,!]?|this is)\b/i.test(
          firstParagraph,
        ) &&
        /\b(polish|refine|revis|rewrit|version|draft|chapter|section|edit|updated|final|biography|book)\w*\b/i.test(
          firstParagraph,
        );

      if (looksLikePreamble) {
        result = paragraphs.slice(1).join('\n\n').trim();
      }
    }

    // Strip a leaked sign-off / trailing chat commentary, e.g.
    // "Let me know if you'd like any adjustments!" or
    // "I hope this helps with your book!"
    const lines = result.split('\n');
    while (lines.length > 1) {
      const lastLine = lines[lines.length - 1].trim();
      const looksLikeSignOff =
        lastLine.length > 0 &&
        lastLine.length < 300 &&
        /\b(let me know|i hope this helps|feel free to|happy to (?:adjust|revise|tweak)|want me to|would you like)\b/i.test(
          lastLine,
        );

      if (looksLikeSignOff) {
        lines.pop();
        while (lines.length && lines[lines.length - 1].trim() === '') {
          lines.pop();
        }
      } else {
        break;
      }
    }

    return lines.join('\n').trim();
  }

  // ═══════════════════════════════════════════════════════════════
  // Post-processing — strips AI-tell phrasing
  // ═══════════════════════════════════════════════════════════════
  private humanizeText(text: string): string {
    let result = this.stripConversationalWrapper(text);

    const patterns = this.getAITellPatterns();
    for (const { pattern, replacement } of patterns) {
      result = result.replace(pattern, replacement);
    }

    result = result.replace(/ {2,}/g, ' ');
    result = result.replace(/\n{3,}/g, '\n\n');

    for (const uniformPattern of SENTENCE_UNIFORMITY_PATTERNS) {
      const matches = result.match(uniformPattern);
      if (matches && matches.length > 3) {
        this.logger.warn(
          `Detected ${matches.length} repetitive sentence patterns: "${matches[0].substring(0, 40)}..."`,
        );
      }
    }

    return result.trim();
  }

  private countMatches(text: string, pattern: RegExp): number {
    return text.match(pattern)?.length || 0;
  }

  private getRepeatedParagraphStarts(text: string): string[] {
    const starts = text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim().match(/^["']?([A-Za-z]{3,})\b/)?.[1])
      .filter((word): word is string => Boolean(word))
      .map((word) => word.toLowerCase());

    const counts = new Map<string, number>();
    for (const start of starts) {
      counts.set(start, (counts.get(start) || 0) + 1);
    }

    return [...counts.entries()]
      .filter(([, count]) => count >= 4)
      .map(([word]) => word);
  }

  private getBiographyAuthenticityIssues(text: string): AuthenticityIssue[] {
    const issues: AuthenticityIssue[] = [];
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    const lower = text.toLowerCase();
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const headingCount = this.countMatches(text, /^[A-Z][^\n]{3,80}$/gm);
    const yearCount = this.countMatches(text, /\b(?:1[5-9]\d\d|20\d\d)s?\b/g);
    // Long quoted passages are the most common place for invented words
    const longQuoteCount = this.countMatches(text, /["“][^"”\n]{25,}["”]/g);
    const privateThoughtCount = this.countMatches(
      lower,
      /\b(?:he|she|they)\s+(?:thought|wondered|felt|knew|realized|realised|sensed|feared|hoped)\s+(?:to\s+(?:him|her|them)sel(?:f|ves)|that|deep down)\b|\b(?:couldn't help but|in (?:his|her|their) heart|deep down,? (?:he|she|they))\b/g,
    );
    const noteLikeCount = this.countMatches(
      text,
      /^\s*(?:[-*•]|\d+[.)]|#{1,6}\s)/gm,
    );
    const genericPhraseCount = this.countMatches(
      lower,
      /\b(left an indelible mark|larger than life|stood the test of time|paved the way|rose to fame|rose to prominence|meteoric rise|against all odds|true icon|force to be reckoned with|little did (?:he|she|they) know|the rest is history|in this chapter|this section|as mentioned earlier)\b/g,
    );
    const encyclopediaOpener =
      /^[^\n.]{0,80}\bwas born (?:on|in)\b/i.test(text.trim());
    const repeatedStarts = this.getRepeatedParagraphStarts(text);

    if (wordCount > 700 && headingCount < 2) {
      issues.push({
        issue: 'few section headings',
        instruction:
          'Add the section headings from the outline so the chapter feels edited and easy to follow.',
      });
    }

    if (paragraphs.length > 10 && yearCount < 4) {
      issues.push({
        issue: 'weak timeline anchors',
        instruction:
          'Anchor the narrative in time: add years or the subject\'s age wherever the record supports it, so readers always know when events happen. Do not invent dates — leave a year out if you are not confident of it.',
      });
    }

    if (longQuoteCount >= 4) {
      issues.push({
        issue: 'many direct quotations (fabrication risk)',
        instruction:
          'Keep only famous, widely documented quotes word for word. Turn every other quotation into attributed paraphrase ("she later said that...").',
      });
    }

    if (privateThoughtCount >= 3) {
      issues.push({
        issue: 'narrates private thoughts and feelings',
        instruction:
          'Remove inner thoughts and feelings nobody could have reported, or attribute them to the subject\'s own public account ("he later described feeling...").',
      });
    }

    if (noteLikeCount >= 5) {
      issues.push({
        issue: 'content looks like notes or an outline',
        instruction:
          'Convert note-like bullets and fragments into finished narrative prose, keeping only polished headings.',
      });
    }

    if (genericPhraseCount >= 3) {
      issues.push({
        issue: 'cliched biography phrasing',
        instruction:
          'Replace stock phrases and generic praise with specific evidence: a work, a decision, a result, a consequence.',
      });
    }

    if (encyclopediaOpener) {
      issues.push({
        issue: 'opens like an encyclopedia entry',
        instruction:
          'Open on a specific, documented moment or detail instead of a birth-date sentence.',
      });
    }

    if (repeatedStarts.length > 0) {
      issues.push({
        issue: `repeated paragraph starts: ${repeatedStarts.join(', ')}`,
        instruction:
          'Rewrite paragraph openings so the chapter sounds edited by a human, not generated from a template.',
      });
    }

    return issues;
  }

  private buildRefinementContextBlock(
    heading: string,
    refinementContext?: RefinementContext,
  ): string {
    if (!refinementContext?.bookTitle && !refinementContext?.bookSubtitle) {
      return '';
    }

    return `
${heading}
${refinementContext.bookTitle ? `Title: "${refinementContext.bookTitle}"` : ''}
${refinementContext.bookSubtitle ? `Subtitle: "${refinementContext.bookSubtitle}"` : ''}
${refinementContext.chapterTitle ? `Chapter: "${refinementContext.chapterTitle}"` : ''}
${refinementContext.chapterOutline ? `Chapter outline: ${JSON.stringify(refinementContext.chapterOutline, null, 2)}` : ''}

${this.buildBookPromise(refinementContext.bookTitle || '', refinementContext.bookSubtitle || '', refinementContext.brief)}
${this.buildBiographyQualityRules()}
`;
  }

  private getAuthenticityRewritePrompt(
    text: string,
    issues: AuthenticityIssue[],
    refinementContext?: RefinementContext,
  ): string {
    const issueList = issues
      .map(
        (issue, index) => `${index + 1}. ${issue.issue}: ${issue.instruction}`,
      )
      .join('\n');

    const mainChapterDepthInstruction = refinementContext?.isMainChapter
      ? `
MAIN CHAPTER DEPTH TO PRESERVE:
${this.buildMainChapterDepthRules()}
- Do not shorten the chapter during this final pass, except to remove invented or unsupported material.
`
      : '';

    return `You are doing the final editor pass on a biography chapter before publication.

The chapter still has these problems:
${issueList}

${this.buildRefinementContextBlock('BOOK CONTEXT:', refinementContext)}
${mainChapterDepthInstruction}

${BIOGRAPHY_FACT_RULES}

EDITORIAL REQUIREMENTS:
- Make it read like a chapter of a careful, published biography.
- Keep the documented facts already present, but remove filler, repetition, note-like fragments and anything that reads as invented.
- Do not add new facts in this pass unless you are confident they are part of the documented record.
- Use clear headings where helpful, but do not turn the chapter into bullet notes.
- Keep the final chapter in plain English: common words, clear sentences, no jargon, no fancy phrasing.
- Return only the finished chapter text.

CHAPTER TO FIX:
${text}`;
  }

  private async enforceBiographyAuthenticity(
    text: string,
    systemPrompt?: string,
    refinementContext?: RefinementContext,
  ): Promise<string> {
    const issues = this.getBiographyAuthenticityIssues(text);

    if (issues.length === 0) {
      return text;
    }

    this.logger.warn(
      `Biography authenticity audit found ${issues.length} issue(s): ${issues
        .map((issue) => issue.issue)
        .join('; ')}`,
    );

    const rewritePrompt = this.getAuthenticityRewritePrompt(
      text,
      issues,
      refinementContext,
    );
    const rewritten = await this.generateWithProviderRotation(
      rewritePrompt,
      systemPrompt,
    );

    return this.humanizeText(rewritten);
  }

  // ═══════════════════════════════════════════════════════════════
  // Multi-turn refinement — draft, fact/voice critique, audit
  // ═══════════════════════════════════════════════════════════════
  private async generateAndRefine(
    prompt: string,
    systemPrompt?: string,
    refinementContext?: RefinementContext,
  ): Promise<string> {
    const draft = await this.generateWithProviderRotation(prompt, systemPrompt);

    const refined = await this.generateWithProviderRotation(
      this.getBiographyRefinePrompt(draft, refinementContext),
      systemPrompt,
    );

    return await this.enforceBiographyAuthenticity(
      this.humanizeText(refined),
      systemPrompt,
      refinementContext,
    );
  }

  private getBiographyRefinePrompt(
    draft: string,
    refinementContext?: RefinementContext,
  ): string {
    const mainChapterDepthInstruction = refinementContext?.isMainChapter
      ? `
MAIN CHAPTER DEPTH TO PRESERVE:
${this.buildMainChapterDepthRules()}
- During this rewrite, do not shorten the chapter except to remove invented or unsupported material.
`
      : '';

    return `Here is a draft biography chapter you wrote. Rewrite it to fix these specific issues:

1. FACT CHECK FIRST: Remove or hedge any claim you are not confident is documented. Delete invented quotes, dialogue, inner thoughts and scenes nobody could have witnessed; turn uncertain quotes into attributed paraphrase. Where accounts differ, say so once, plainly.
2. ORIGINALITY AND COPYRIGHT: Rewrite any passage that reads like Wikipedia, an official biography, a press release, an obituary or a fan page. Every sentence must be original phrasing. Remove any song lyrics or lines of poetry entirely (describe them instead), and cut any other quotation longer than a short, famous phrase. Check that the headings and paragraph order don't follow a stock "Early Life / Career / Personal Life / Legacy" template — the structure should come from this life and this outline.
3. Replace generic praise ("a true icon", "left a lasting legacy", "inspired millions") with specific evidence: a work, a decision, a result, a reaction, a consequence.
4. Vary sentence length aggressively — mix short, plain sentences with longer narrative ones; no two consecutive sentences with the same rhythm.
5. Make sure no two consecutive paragraphs start with the same word or the same structure, and don't open paragraph after paragraph with the subject's name or "He"/"She".
6. Keep the timeline clear: years or ages where the record supports them, and explicit time jumps.
7. Be fair: where the record includes failures, criticism or controversy from this period, include it accurately rather than smoothing it over.
8. Preserve the subject, angle and promise from the title/subtitle — every paragraph should serve this life story.
9. Turn note-like passages into finished narrative prose with the section headings from the outline.
10. VOICE CHECK: It should read like a careful biographer telling a true story — not an encyclopedia, not a fan page, not a eulogy.

${this.buildRefinementContextBlock('BOOK CONTEXT TO PRESERVE:', refinementContext)}
${mainChapterDepthInstruction}

DRAFT TO REWRITE:
${draft}

Return ONLY the rewritten text. No commentary.`;
  }

  async generateText(
    prompt: string,
    {
      refine = false,
      systemPrompt,
      refinementContext,
    }: {
      refine?: boolean;
      systemPrompt?: string;
      refinementContext?: RefinementContext;
    } = {},
  ): Promise<string> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        this.logger.log(
          `Generating biography content (attempt ${attempt}/${this.MAX_RETRIES})...`,
        );

        let text: string;

        if (refine) {
          text = await this.generateAndRefine(
            prompt,
            systemPrompt,
            refinementContext,
          );
        } else {
          text = await this.generateWithProviderRotation(prompt, systemPrompt);
          text = this.humanizeText(text);
        }

        this.logger.log('Content generated successfully');
        return text;
      } catch (error: any) {
        lastError = error;
        const isTransientError =
          this.isNetworkError(error) ||
          this.isOverloadError(error) ||
          this.isRateLimitError(error);

        if (isTransientError) {
          if (attempt < this.MAX_RETRIES) {
            const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
            this.logger.warn(
              `All providers temporarily unavailable (attempt ${attempt}/${this.MAX_RETRIES}). Retrying in ${delay}ms...`,
            );
            await this.sleep(delay);
            continue;
          }
        }

        this.logger.error('Error generating content:', error);
        throw error;
      }
    }

    this.logger.error(`All ${this.MAX_RETRIES} retry attempts failed`);
    throw lastError;
  }

  // ═══════════════════════════════════════════════════════════════
  // BOOK OUTLINE — the arc of a life
  // ═══════════════════════════════════════════════════════════════
  async generateBookOutline(
    title: string,
    subtitle: string,
    numberOfChapters: number,
    brief: BiographyBrief,
  ): Promise<BookOutlineDto> {
    this.logger.log(
      `Generating biography outline for "${title}" (subject: ${brief.subject})`,
    );

    const outlineSystemPrompt =
      'You are a book editor specializing in narrative nonfiction biographies. Return only one valid JSON object. No markdown, no backticks, no comments, no ellipses, no placeholders, no explanation.';

    // Split large outlines into two halves to stay within token limits
    const useChunkedGeneration = numberOfChapters > 8;
    const MAX_OUTLINE_ATTEMPTS = 3;

    if (useChunkedGeneration) {
      return await this.generateBookOutlineChunked(
        title,
        subtitle,
        numberOfChapters,
        brief,
        outlineSystemPrompt,
      );
    }

    // ── Single-pass generation for ≤8 chapters ──────────────────
    const prompt = this.buildOutlinePrompt(
      title,
      subtitle,
      numberOfChapters,
      1,
      numberOfChapters,
      brief,
    );

    for (let attempt = 1; attempt <= MAX_OUTLINE_ATTEMPTS; attempt++) {
      this.logger.log(
        `Generating book outline (attempt ${attempt}/${MAX_OUTLINE_ATTEMPTS})...`,
      );

      const response = await this.generateOutlineJson(
        prompt,
        outlineSystemPrompt,
      );

      const outline = this.parseAndValidateOutline(
        response,
        numberOfChapters,
        attempt,
        MAX_OUTLINE_ATTEMPTS,
      );

      if (outline) {
        return { title, subtitle, author: '', chapters: outline.chapters };
      }

      if (attempt < MAX_OUTLINE_ATTEMPTS) {
        this.logger.warn(
          `Outline attempt ${attempt} failed. Retrying in 3s...`,
        );
        await this.sleep(3000);
      }
    }

    throw new Error(
      `Failed to generate a valid book outline after ${MAX_OUTLINE_ATTEMPTS} attempts`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // CHUNKED GENERATION — For books with >8 chapters
  // Splits into ranges, and recursively shrinks failed ranges.
  // Later ranges see the chapters already planned so the timeline
  // continues instead of restarting.
  // ═══════════════════════════════════════════════════════════════
  private async generateBookOutlineChunked(
    title: string,
    subtitle: string,
    numberOfChapters: number,
    brief: BiographyBrief,
    outlineSystemPrompt: string,
  ): Promise<BookOutlineDto> {
    const half = Math.ceil(numberOfChapters / 2);

    this.logger.log(
      `Outline too large (${numberOfChapters} chapters) — generating in two chunks: [1-${half}] and [${half + 1}-${numberOfChapters}]`,
    );

    const chunk1Chapters = await this.generateOutlineRange(
      title,
      subtitle,
      numberOfChapters,
      1,
      half,
      brief,
      outlineSystemPrompt,
      [],
    );

    const chunk2Chapters = await this.generateOutlineRange(
      title,
      subtitle,
      numberOfChapters,
      half + 1,
      numberOfChapters,
      brief,
      outlineSystemPrompt,
      chunk1Chapters,
    );

    // ── Merge chunks and fix chapter numbers ─────────────────────
    const allChapters: ChapterOutline[] = [
      ...chunk1Chapters,
      ...chunk2Chapters,
    ].map((chapter, idx) => ({
      ...chapter,
      chapterNumber: idx + 1,
    }));

    this.logger.log(
      `Outline chunks merged successfully: ${allChapters.length} chapters total`,
    );

    return { title, subtitle, author: '', chapters: allChapters };
  }

  private async generateOutlineRange(
    title: string,
    subtitle: string,
    totalChapters: number,
    fromChapter: number,
    toChapter: number,
    brief: BiographyBrief,
    outlineSystemPrompt: string,
    previousChapters: ChapterOutline[],
  ): Promise<ChapterOutline[]> {
    const chapterCount = toChapter - fromChapter + 1;
    const MAX_OUTLINE_ATTEMPTS = 3;
    const prompt = this.buildOutlinePrompt(
      title,
      subtitle,
      totalChapters,
      fromChapter,
      toChapter,
      brief,
      previousChapters,
    );

    for (let attempt = 1; attempt <= MAX_OUTLINE_ATTEMPTS; attempt++) {
      this.logger.log(
        `Generating outline chapters ${fromChapter}-${toChapter}, attempt ${attempt}/${MAX_OUTLINE_ATTEMPTS}...`,
      );

      const response = await this.generateOutlineJson(
        prompt,
        outlineSystemPrompt,
      );

      const parsed = this.parseAndValidateOutline(
        response,
        chapterCount,
        attempt,
        MAX_OUTLINE_ATTEMPTS,
      );

      if (parsed) {
        return parsed.chapters;
      }

      if (attempt < MAX_OUTLINE_ATTEMPTS) {
        await this.sleep(3000);
      }
    }

    if (chapterCount > 1) {
      const midpoint = Math.floor((fromChapter + toChapter) / 2);
      this.logger.warn(
        `Outline chapters ${fromChapter}-${toChapter} failed as one range; splitting into ${fromChapter}-${midpoint} and ${midpoint + 1}-${toChapter}`,
      );

      const first = await this.generateOutlineRange(
        title,
        subtitle,
        totalChapters,
        fromChapter,
        midpoint,
        brief,
        outlineSystemPrompt,
        previousChapters,
      );
      const second = await this.generateOutlineRange(
        title,
        subtitle,
        totalChapters,
        midpoint + 1,
        toChapter,
        brief,
        outlineSystemPrompt,
        [...previousChapters, ...first],
      );
      return [...first, ...second];
    }

    throw new Error(
      `Failed to generate outline chapter ${fromChapter} after all attempts`,
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // PROMPT BUILDER — Generates prompt for a specific chapter range
  // ═══════════════════════════════════════════════════════════════
  private buildOutlinePrompt(
    title: string,
    subtitle: string,
    totalChapters: number,
    fromChapter: number,
    toChapter: number,
    brief: BiographyBrief,
    previousChapters: ChapterOutline[] = [],
  ): string {
    const chapterCount = toChapter - fromChapter + 1;
    const isFirstChunk = fromChapter === 1;
    const isLastChunk = toChapter === totalChapters;
    const isFullOutline = isFirstChunk && isLastChunk;

    let chapterRules = '';

    if (isFullOutline) {
      chapterRules = `
3. Chapter 1: Introduction — who ${brief.subject} is and why this life is worth reading about, built around one defining, documented moment
4. Chapters 2-${totalChapters - 1}: The life, in chronological order
5. Chapter ${totalChapters}: Conclusion — legacy, influence and how views of ${brief.subject} have changed`;
    } else if (isFirstChunk) {
      chapterRules = `
3. Chapter 1: Introduction — who ${brief.subject} is and why this life is worth reading about, built around one defining, documented moment
4. Chapters 2-${toChapter}: The life, in chronological order (first half of the book: origins onward)
NOTE: This is the FIRST HALF of a ${totalChapters}-chapter book. Do NOT include a conclusion chapter here, and do not cover the later life yet.`;
    } else if (isLastChunk) {
      chapterRules = `
3. Chapters ${fromChapter}-${toChapter - 1}: The life, continuing in chronological order from where the earlier chapters stop
4. Chapter ${toChapter}: Conclusion — legacy, influence and how views of ${brief.subject} have changed
NOTE: This is the SECOND HALF of a ${totalChapters}-chapter book. Number chapters starting from ${fromChapter}.`;
    } else {
      chapterRules = `
3. Chapters ${fromChapter}-${toChapter}: The life, continuing in chronological order
NOTE: This is a middle section of a ${totalChapters}-chapter book. Number chapters starting from ${fromChapter}.`;
    }

    const style = this.styleFor(brief, title, subtitle);

    const alreadyPlanned = previousChapters.length
      ? `
CHAPTERS ALREADY PLANNED (continue the timeline from here — do not repeat these periods or events):
${previousChapters
  .map((c) => `- Chapter ${c.chapterNumber}: ${c.chapterTitle}`)
  .join('\n')}
`
      : '';

    return `Create a detailed outline for chapters ${fromChapter} through ${toChapter} of a biography of ${brief.subject}.

Book Title: "${title}"
Subtitle: "${subtitle}"
Total book length: ${totalChapters} chapters
Generate: EXACTLY ${chapterCount} chapters (chapters ${fromChapter}-${toChapter})

${this.buildBookPromise(title, subtitle, brief)}
${alreadyPlanned}
${BIOGRAPHY_FACT_RULES}

${BIOGRAPHY_COPYRIGHT_RULES}

THIS BOOK'S SHAPE: ${style.architecture.outline}
HEADING STYLE for section titles: ${style.headingStyle}

REQUIREMENTS:
1. Generate EXACTLY ${chapterCount} chapters
2. Number chapters from ${fromChapter} to ${toChapter}${chapterRules}
6. Each chapter should have 2 to 5 sections (vary it — not every chapter needs the same count)
7. Each section should have 2 to 4 subsections (vary these too)
8. Every subsection must be a non-empty string — no blank entries
9. Section and subsection titles should sound like a human wrote them — no generic filler
10. Life chapters follow the subject in time order. Each covers a distinct period or turning point — for example family background and childhood, education and early influences, first work and struggles, the breakthrough, the peak years, setbacks and controversies, personal life (only what is public), and later years — chosen and named to fit this particular life. No overlaps, no repeats.
11. Do not use bare generic chapter titles like "Early Life", "Career", "Personal Life" or "Legacy". Name the period, place, work, relationship or turning point.
12. Plan chapters, sections and subsections only around events you are confident are documented, or that appear in the author notes. Do not plan sections around events you are unsure happened.
13. If the subject is living, the last life chapter covers the most recent documented period "as of this writing".
14. If the subtitle promises an angle, era or count, honor it clearly across the chapters without padding or duplicate ideas.
15. Use plain English for all titles, sections, and subsections: common words, direct phrasing, no jargon

BAD chapter/section titles (too generic):
- "Early Life"
- "Rise to Fame"
- "Personal Life"
- "Legacy and Impact"

GOOD chapter/section titles (specific, but only when true for this subject):
- "A Two-Room Apartment Above the Bakery"
- "The Audition That Went Wrong"
- "Three Companies in Five Years"
- "What the Court Case Cost Him"

JSON RULES:
- Return one complete JSON object and nothing else
- Do not include comments, markdown, backticks, notes, or explanations
- Do not use ellipses, "omitted", "as above", "continue similarly", or placeholder chapters
- Every chapter, section, and subsection must be fully written out

OUTPUT FORMAT (JSON):
{
  "chapters": [
    {
      "chapterNumber": ${fromChapter},
      "chapterTitle": "A specific chapter title",
      "sections": [
        {
          "sectionTitle": "A specific interesting title",
          "subsections": ["Concrete topic 1", "Concrete topic 2", "Concrete topic 3"]
        }
      ]
    }
  ]
}

Generate ALL ${chapterCount} chapters (${fromChapter} through ${toChapter}). CRITICAL: Return valid JSON only. Use double quotes for all strings. No single quotes, no trailing commas, no markdown.`;
  }

  // ═══════════════════════════════════════════════════════════════
  // JSON PARSER — Tries clean parse, then repair, then partial salvage
  // ═══════════════════════════════════════════════════════════════
  private parseAndValidateOutline(
    response: string,
    expectedChapters: number,
    attempt: number,
    maxAttempts: number,
  ): { chapters: ChapterOutline[] } | null {
    const cleaned = this.extractLikelyJson(response);

    // ── Attempt 1: clean parse ────────────────────────────────────
    let outline = this.tryParseJson(cleaned);

    // ── Attempt 2: repair truncated JSON ─────────────────────────
    if (!outline) {
      this.logger.warn(
        `Attempt ${attempt}: Clean JSON parse failed — trying repair...`,
      );
      outline = this.tryRepairJson(cleaned);
    }

    if (!outline) {
      this.logger.error(
        `Attempt ${attempt}/${maxAttempts}: Could not parse or repair outline JSON. ` +
          `Response tail: ...${cleaned.slice(-200)}`,
      );
      return null;
    }

    if (!outline.chapters || !Array.isArray(outline.chapters)) {
      this.logger.error(
        `Attempt ${attempt}/${maxAttempts}: Outline missing chapters array`,
      );
      return null;
    }

    if (this.containsOutlinePlaceholders(outline)) {
      this.logger.error(
        `Attempt ${attempt}/${maxAttempts}: Outline contains placeholder or editorial text`,
      );
      return null;
    }

    // ── Chapter count check ───────────────────────────────────────
    if (outline.chapters.length < expectedChapters) {
      this.logger.warn(
        `Attempt ${attempt}/${maxAttempts}: Got ${outline.chapters.length} chapters, expected ${expectedChapters}`,
      );
      // Only hard-fail on last attempt — partial outlines on early attempts → retry
      if (attempt === maxAttempts) {
        throw new Error(
          `AI generated only ${outline.chapters.length} chapters instead of ${expectedChapters} after ${maxAttempts} attempts`,
        );
      }
      return null;
    }

    // Trim if too many chapters came back
    if (outline.chapters.length > expectedChapters) {
      this.logger.warn(
        `Got ${outline.chapters.length} chapters, trimming to ${expectedChapters}`,
      );
      outline.chapters = outline.chapters.slice(0, expectedChapters);
    }

    // ── Structural validation + auto-repair ──────────────────────
    outline.chapters.forEach((chapter: ChapterOutline, idx: number) => {
      // Auto-repair missing sections array
      if (!chapter.sections || !Array.isArray(chapter.sections)) {
        this.logger.warn(
          `Chapter ${idx + 1} missing sections — inserting placeholder`,
        );
        chapter.sections = [
          {
            sectionTitle: chapter.chapterTitle || 'Overview',
            subsections: ['Introduction'],
          },
        ];
      }

      chapter.sections.forEach((section: any, secIdx: number) => {
        // Auto-repair missing or malformed subsections
        if (!section.subsections || !Array.isArray(section.subsections)) {
          if (
            typeof section.subsections === 'string' &&
            section.subsections.trim()
          ) {
            // Model returned a string instead of array — wrap it
            this.logger.warn(
              `Chapter ${idx + 1}, Section ${secIdx + 1} subsections is a string — wrapping in array`,
            );
            section.subsections = [section.subsections.trim()];
          } else {
            // Missing entirely — fall back to section title
            this.logger.warn(
              `Chapter ${idx + 1}, Section ${secIdx + 1} missing subsections — using section title as fallback`,
            );
            section.subsections = [section.sectionTitle || 'Overview'];
          }
        }

        // Filter out blank subsections (model sometimes emits "")
        section.subsections = section.subsections.filter(
          (s: any) => typeof s === 'string' && s.trim().length > 0,
        );

        // Still empty after filtering — use section title
        if (section.subsections.length === 0) {
          this.logger.warn(
            `Chapter ${idx + 1}, Section ${secIdx + 1} has no valid subsections after filtering — using section title as fallback`,
          );
          section.subsections = [section.sectionTitle || 'Overview'];
        }
      });
    });

    return outline;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS — JSON parse + repair
  // ═══════════════════════════════════════════════════════════════
  private tryParseJson(raw: string): any | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private extractLikelyJson(response: string): string {
    const withoutFences = response
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();
    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return withoutFences.slice(firstBrace, lastBrace + 1).trim();
    }

    return withoutFences;
  }

  private containsOutlinePlaceholders(outline: any): boolean {
    const serialized = JSON.stringify(outline).toLowerCase();
    return /\b(omitted|as above|same as above|continue similarly|continued similarly|placeholder|proceeding accordingly|filling in chapters?|chapter \d+ would|would be complete|to be filled|todo|tbd)\b|\.\.\./i.test(
      serialized,
    );
  }

  private tryRepairJson(raw: string): any | null {
    try {
      // Remove trailing commas before ] or }
      let repaired = this.normalizeSingleQuotes(raw);

      repaired = repaired
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      repaired = repaired.replace(/,\s*([}\]])/g, '$1');

      // Close any unclosed strings (truncation mid-string)
      // Count unmatched quotes — if odd, the string was cut off; close it
      const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        repaired = repaired.trimEnd() + '"';
      }

      // Close unclosed arrays and objects by tracking the stack
      const stack: string[] = [];
      let inString = false;
      let escape = false;

      for (const ch of repaired) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\' && inString) {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (ch === '{' || ch === '[') stack.push(ch);
        if (ch === '}' || ch === ']') stack.pop();
      }

      // Close open structures in reverse order
      for (const open of [...stack].reverse()) {
        repaired += open === '{' ? '}' : ']';
      }

      const result = JSON.parse(repaired);
      this.logger.warn('JSON repair succeeded — response was truncated');
      return result;
    } catch {
      return null;
    }
  }

  // New helper to add
  private normalizeSingleQuotes(raw: string): string {
    // Replace single-quoted keys and values with double-quoted ones
    // Handles: 'key': 'value', 'key': ['val1', 'val2']
    // Does NOT touch apostrophes inside words (e.g., "don't", "Albania's")
    return (
      raw
        // Keys: 'word' followed by : → "word":
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'\s*:/g, '"$1":')
        // Values: : 'value' or , 'value' or [ 'value'
        .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ': "$1"')
        .replace(/,\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, ', "$1"')
        .replace(/\[\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, '["$1"')
    );
  }

  private stripMetaCommentary(text: string): string {
    const metaPatterns = [
      /^here'?s?\s+(?:the\s+)?(?:revised|rewritten|updated|edited|final|complete)\s+chapter[^:\n]*:\s*/im,
      /^here\s+is\s+(?:the\s+)?(?:revised|rewritten|updated|edited|final|complete)\s+chapter[^:\n]*:\s*/im,
      /^(?:revised|rewritten|updated|edited|final)\s+chapter[^:\n]*:\s*/im,
      /^ready\s+for\s+publication[^:\n]*:\s*/im,
      /^here'?s?\s+the\s+introduction[^:\n]*:\s*/im,
      /^here'?s?\s+your[^:\n]*:\s*/im,
      /^the\s+following\s+is[^:\n]*:\s*/im,
    ];

    let result = text.trim();
    for (const pattern of metaPatterns) {
      result = result.replace(pattern, '').trim();
    }

    // Also strip a repeated chapter title if it appears as the very first line
    // before any real paragraph content (bold heading leak)
    result = result.replace(/^#{1,6}\s+.+\n+/m, '').trim();

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // INTRODUCTION — why this life matters
  // ═══════════════════════════════════════════════════════════════
  async generateIntroduction(
    title: string,
    subtitle: string,
    outline: BookOutlineDto,
    brief: BiographyBrief,
  ): Promise<string> {
    const introChapter = outline.chapters.find((c) => c.chapterNumber === 1);

    if (!introChapter) {
      throw new Error('Introduction chapter not found in outline');
    }

    const result = await this.generateText(
      this.buildIntroPrompt(title, subtitle, introChapter, outline, brief),
      {
        refine: true,
        systemPrompt: this.getSystemPrompt(brief, title, subtitle),
        refinementContext: {
          bookTitle: title,
          bookSubtitle: subtitle,
          chapterTitle: introChapter.chapterTitle,
          chapterOutline: introChapter,
          brief,
        },
      },
    );

    return this.stripMetaCommentary(result);
  }

  private buildIntroPrompt(
    title: string,
    subtitle: string,
    introChapter: ChapterOutline,
    outline: BookOutlineDto,
    brief: BiographyBrief,
  ): string {
    const style = this.styleFor(brief, title, subtitle);

    return `Write the complete Introduction chapter for this biography of ${brief.subject}:

Title: "${title}"
Subtitle: "${subtitle}"

${this.buildBookPromise(title, subtitle, brief)}
${this.buildBiographyQualityRules()}

Chapter Structure:
${JSON.stringify(introChapter, null, 2)}

The rest of the book (so you can set it up without repeating it):
${outline.chapters
  .slice(1)
  .map((c) => `- Chapter ${c.chapterNumber}: ${c.chapterTitle}`)
  .join('\n')}

STRUCTURE:
- Write 15-20 paragraphs covering all sections and subsections from the outline
- Vary paragraph length: some short (2 sentences), some longer (4-5 sentences)
- How to open: ${style.openingMove} Whatever you open on must be documented — not a birth date, not a list of achievements
- This book's shape: ${style.architecture.intro}
- Raise the book's question (see BOOK CONTEXT) in your own words, early on. Don't answer it yet.
- Explain why this life is worth reading about, and what the book's angle is (from the title/subtitle)
- Include one short, honest paragraph on sources: the book is drawn from the public record — interviews, published accounts and reporting — and where accounts differ, the text says so. Do not name specific sources unless you are certain they exist.
- You may step forward briefly in the first person here, as the biographer, but keep the focus on ${brief.subject}
- Close with forward momentum into the next chapter — make readers want to turn the page
- Do not summarize every chapter; set up the story instead

SENTENCE RHYTHM (critical for sounding human):
- Mix short sentences (4-8 words) with medium (12-18 words) and occasional long (20-25 words)
- Never start 3+ consecutive sentences the same way
- Use a fragment now and then where it lands well

VOICE EXAMPLE (an invented subject — copy the rhythm and the way in, never the facts):
"""
${style.voiceExample}
"""

Write in plain English the complete Introduction chapter now.
Return ONLY the chapter text. Do NOT include any preamble, meta-commentary, or phrases like "Here's the revised chapter" or "Here's the introduction". Do NOT restate the chapter title as a heading at the start. Begin directly with the opening moment.`;
  }

  // ═══════════════════════════════════════════════════════════════
  // CHAPTER CONTENT — each book rotates through its own formats
  // ═══════════════════════════════════════════════════════════════
  async generateChapterContent(
    chapterOutline: ChapterOutline,
    bookTitle: string,
    bookSubtitle: string,
    brief: BiographyBrief,
    outline?: BookOutlineDto,
  ): Promise<string> {
    const format = formatForChapter(
      this.styleFor(brief, bookTitle, bookSubtitle),
      chapterOutline.chapterNumber,
    );
    this.logger.log(
      `Generating chapter ${chapterOutline.chapterNumber} with format: ${format.id}`,
    );

    return await this.generateText(
      this.buildChapterPrompt(
        chapterOutline,
        bookTitle,
        bookSubtitle,
        format.instructions,
        brief,
        outline,
      ),
      {
        refine: true,
        systemPrompt: this.getSystemPrompt(brief, bookTitle, bookSubtitle),
        refinementContext: {
          bookTitle,
          bookSubtitle,
          chapterTitle: chapterOutline.chapterTitle,
          chapterOutline,
          isMainChapter: true,
          brief,
        },
      },
    );
  }

  private buildChapterPrompt(
    chapterOutline: ChapterOutline,
    bookTitle: string,
    bookSubtitle: string,
    formatInstructions: string,
    brief: BiographyBrief,
    outline?: BookOutlineDto,
  ): string {
    const previous = outline?.chapters.find(
      (c) => c.chapterNumber === chapterOutline.chapterNumber - 1,
    );
    const next = outline?.chapters.find(
      (c) => c.chapterNumber === chapterOutline.chapterNumber + 1,
    );
    const placement =
      previous || next
        ? `
WHERE THIS CHAPTER SITS:
${previous ? `- Previous chapter: "${previous.chapterTitle}" (already written — pick up from where it ends, don't retell it)` : ''}
${next ? `- Next chapter: "${next.chapterTitle}" (don't cover its events here)` : ''}
`
        : '';

    return `Write Chapter ${chapterOutline.chapterNumber}: "${chapterOutline.chapterTitle}" for the biography "${bookTitle}${bookSubtitle ? `: ${bookSubtitle}` : ''}" about ${brief.subject}, IN PLAIN ENGLISH.

${this.buildBookPromise(bookTitle, bookSubtitle, brief)}
${this.buildMainChapterDepthRules()}

Chapter Structure:
${JSON.stringify(chapterOutline, null, 2)}
${placement}
PURPOSE: This is a narrative biography. Every paragraph should move the life story forward or help the reader understand the person.

${formatInstructions}

${this.getChapterSharedRules()}

Write in plain English the complete chapter now:`;
  }

  private getChapterSharedRules(): string {
    return `
${this.buildBiographyQualityRules()}

BIOGRAPHY CONTENT RULES (apply regardless of format):
- Every section needs: what happened, when (year or age), where, who else was involved, why it mattered, and what came next
- Explain the subject's work in plain terms so a newcomer understands why it mattered
- Include setbacks, mistakes, criticism and controversy from this period where documented — a biography is not a tribute
- Bring in the people around the subject (family, mentors, rivals, collaborators) by name when documented
- Use attributed paraphrase for what people said; direct quotes only when famous and exact
- Tie the chapter back to the book's angle from the title/subtitle at least once
- Make time jumps explicit
- Use the section headings from the outline. The chapter should feel edited, coherent and ready to publish.

${BIOGRAPHY_COPYRIGHT_RULES}

WHAT TO AVOID:
- Don't list facts encyclopedia-style — tell what happened and why it mattered
- Don't gush, moralize or turn paragraphs into tributes
- Don't foreshadow with clichés ("little did he know", "it was only the beginning")
- Don't start more than two paragraphs in a row with the subject's name or "He"/"She"/"They"
- Don't summarize sections or telegraph what's coming next
- Don't end paragraphs with vague praise ("...and that's what made him special")
- Don't use difficult words when simple ones will do — "use" not "utilize", "fix" not "ameliorate"`;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONCLUSION — legacy, plus a key-dates reference
  // ═══════════════════════════════════════════════════════════════
  async generateConclusion(
    title: string,
    subtitle: string,
    outline: BookOutlineDto,
    brief: BiographyBrief,
  ): Promise<string> {
    const conclusionChapter = outline.chapters.find(
      (c) => c.chapterNumber === outline.chapters.length,
    );

    if (!conclusionChapter) {
      throw new Error('Conclusion chapter not found in outline');
    }

    return await this.generateText(
      this.buildConclusionPrompt(title, subtitle, conclusionChapter, brief),
      {
        refine: true,
        systemPrompt: this.getSystemPrompt(brief, title, subtitle),
        refinementContext: {
          bookTitle: title,
          bookSubtitle: subtitle,
          chapterTitle: conclusionChapter.chapterTitle,
          chapterOutline: conclusionChapter,
          brief,
        },
      },
    );
  }

  private buildConclusionPrompt(
    title: string,
    subtitle: string,
    conclusionChapter: ChapterOutline,
    brief: BiographyBrief,
  ): string {
    const style = this.styleFor(brief, title, subtitle);

    return `Write in plain English the Conclusion chapter for this biography of ${brief.subject}:

Title: "${title}"
Subtitle: "${subtitle}"

${this.buildBookPromise(title, subtitle, brief)}
${this.buildBiographyQualityRules()}

Chapter Structure:
${JSON.stringify(conclusionChapter, null, 2)}

PURPOSE: Step back from the timeline and weigh the life. What changed because of ${brief.subject}, how views of them have shifted, what remains argued over, and what a reader should carry away. This is an honest assessment, not a eulogy.

STRUCTURE:
- 15-20 paragraphs of narrative covering all sections and subsections, then the KEY DATES reference below
- Open with a specific, documented image or fact that sums up the life — not "In conclusion"
- This book's shape: ${style.architecture.conclusion}
- Answer the book's question (see BOOK CONTEXT) directly and honestly, using what the chapters showed. If the record doesn't settle it, say so.
- How to close: ${style.closingMove}
- Cover influence with concrete examples (works, people, institutions, changes) rather than claims of greatness
- Cover criticism and unresolved questions fairly
- If ${brief.subject} is living, describe where things stand "as of this writing" without predicting the future
- Close the narrative with a short final paragraph (2-3 sentences) — clear-eyed, not sentimental

KEY DATES (after the narrative, under the heading "Key Dates"):
- A simple list of 10-20 important events in time order, one per line, formatted "YEAR — event"
- Only include events and years you are confident are documented; leave out anything uncertain rather than guessing
- Lists are allowed here; this is the reference section of the book

WHAT TO AVOID:
- Don't open with "In conclusion", "As we come to the end" or "Looking back"
- Don't retell the book chapter by chapter
- Don't end with "will be remembered forever", "inspired generations" or similar stock lines
- Don't invent tributes, awards, statistics or quotes
- Don't use difficult words when simple ones will do

Write the complete Conclusion chapter now:`;
  }

  // ═══════════════════════════════════════════════════════════════
  // ABOUT BOOK
  // ═══════════════════════════════════════════════════════════════
  async generateAboutBook(
    title: string,
    subtitle: string,
    brief: BiographyBrief,
  ): Promise<string> {
    const prompt = `Write an "About This Book" blurb for a biography of ${brief.subject} titled "${title}"${subtitle ? ` with the subtitle "${subtitle}"` : ''}.

${this.buildBookPromise(title, subtitle, brief)}
${PLAIN_LANGUAGE_RULES}

4-6 short paragraphs. NO generic phrases like "comprehensive biography", "everything you need to know" or "the definitive account".

Instead, be specific about:
- The angle this biography takes and the part of the life it gives the most weight to
- Who will get the most out of it (longtime fans? newcomers? readers interested in the era or the field?)
- One honest limitation: this is an independent biography drawn from the public record — it is not authorized and doesn't claim access to private papers or the subject's inner circle
- How it's organized (the story told in order, from early years to legacy, with a key-dates timeline at the end)

Do not invent quotes, sources or endorsements.

Tone: confident, direct, warm. Like a back-cover blurb written by the biographer, not a marketer.`;

    return await this.generateText(prompt, {
      refine: false,
      systemPrompt: this.getSystemPrompt(brief, title, subtitle),
    });
  }
}
