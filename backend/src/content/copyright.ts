// src/content/copyright.ts
import { seedFromString } from './biography-style';

// ═══════════════════════════════════════════════════════════════
// WORDING SECTIONS — every part of the copyright page has a list of
// options. An account can pick one, write its own, or leave it on the
// option its account ID selects (so untouched accounts still differ).
// Templates use {subject}, {year}, {holder}, {publisher} and {contact}.
// ═══════════════════════════════════════════════════════════════
export const COPYRIGHT_SECTIONS = [
  {
    key: 'rights',
    label: 'Rights statement',
    description: 'Follows the “Copyright © year holder” line.',
    options: [
      'All rights reserved.',
      'All rights reserved worldwide.',
      'All rights reserved, including the right of reproduction in whole or in part in any form.',
      'All rights reserved under international copyright conventions.',
      'All rights reserved. Published in accordance with international copyright law.',
    ],
  },
  {
    key: 'reproduction',
    label: 'Reproduction notice',
    description: 'What readers may and may not copy.',
    options: [
      "No part of this book may be reproduced, distributed, stored, transmitted, or used to train artificial intelligence systems, in any form, without the copyright holder's prior written permission — except for brief quotations in reviews.",
      'No part of this publication may be copied, shared, stored in a retrieval system, transmitted by any means, or used as training data for artificial intelligence, without written permission from the copyright holder. Brief quotations in reviews and articles are permitted.',
      'Except for short excerpts quoted in reviews, no part of this book may be reproduced, scanned, distributed, or used to develop or train machine learning or artificial intelligence systems without the prior written consent of the copyright holder.',
      'Reproducing, distributing, or storing any part of this work, including for the purpose of training artificial intelligence, is prohibited without written permission from the copyright holder. Reviewers may quote brief passages.',
      'This book may not be copied, uploaded, shared, or fed into any artificial intelligence system, in whole or in part, without written permission from {holder}. Short quotations for review purposes are welcome.',
    ],
  },
  {
    key: 'contact',
    label: 'Permissions line (with contact)',
    description: 'Used when you add a permissions email or website.',
    options: [
      'For permissions and licensing, contact {contact}.',
      'Permission requests: {contact}',
      'To request permission to reproduce any part of this book, write to {contact}.',
      'Rights and permissions: {contact}',
      'Licensing and permission enquiries are welcome at {contact}.',
    ],
  },
  {
    key: 'noContact',
    label: 'Permissions line (no contact)',
    description: 'Used when you leave the email and website blank.',
    options: [
      'Permissions and licensing: contact the publisher.',
      'For permission requests, please contact the publisher.',
      'Requests for permission should be directed to the publisher.',
      'Rights and permissions enquiries: contact the publisher.',
      'For licensing enquiries, please write to {publisher}.',
    ],
  },
  {
    key: 'independenceHeading',
    label: 'Independence heading',
    description: 'Heading above the independence notice.',
    options: [
      'INDEPENDENT BIOGRAPHY',
      'UNAUTHORIZED BIOGRAPHY',
      'A NOTE ON INDEPENDENCE',
      'ABOUT THIS BIOGRAPHY',
      'DISCLAIMER',
    ],
  },
  {
    key: 'independence',
    label: 'Independence notice',
    description: 'States the book is not authorized by its subject.',
    options: [
      'This is an independent, unauthorized biography. It has not been approved, endorsed, or authorized by {subject}, or by their family, estate, representatives, or any organization associated with them.',
      'This book is an unauthorized work. Neither {subject} nor their family, estate, management, or affiliated organizations have reviewed, approved, sponsored, or endorsed it.',
      'This biography was written independently. It is not affiliated with, authorized, or endorsed by {subject}, their relatives, estate, representatives, or any associated company or organization.',
      '{subject} and their family, estate, and representatives had no involvement in this book and have not authorized or endorsed it. It is an independent biography.',
      'This is not an official or authorized biography. It was produced without the participation, approval, or endorsement of {subject} or anyone acting on their behalf.',
    ],
  },
  {
    key: 'sourcesHeading',
    label: 'Sources heading',
    description: 'Heading above the sources notice.',
    options: [
      'SOURCES AND ACCURACY',
      'A NOTE ON SOURCES',
      'SOURCES',
      'ACCURACY AND SOURCES',
      'RESEARCH',
    ],
  },
  {
    key: 'sources',
    label: 'Sources notice',
    description: 'Where the information comes from and how accurate it is.',
    options: [
      'This book is based on information in the public record, including published interviews, news reporting, and other publicly available sources. The author has made a reasonable effort to ensure accuracy at the time of writing but makes no warranty as to completeness or current accuracy. Where accounts differ, the text says so. Any errors are unintentional.',
      'The material in this book is drawn from publicly available sources such as interviews, press coverage, and published records. Every reasonable effort has been made to check the facts at the time of writing; no guarantee of completeness is given. Where sources disagree, both versions are noted. Any mistakes are unintended.',
      'Everything in these pages comes from the public record: interviews, journalism, official records, and other published material. The facts were checked as carefully as possible at the time of writing, but accuracy and completeness cannot be guaranteed. Conflicting accounts are identified as such, and any errors are unintentional.',
      'This account relies on publicly available information, including reporting, interviews, and published documents. Care has been taken to present it accurately as of the time of writing, though no warranty is made that it is complete or current. Disputed points are flagged in the text. Errors, if any, are unintentional.',
      'The facts in this biography were gathered from published interviews, news archives, and other public sources. While every care has been taken, details may have changed since publication, and the author accepts no liability for errors or omissions.',
    ],
  },
  {
    key: 'trademarks',
    label: 'Trademark notice',
    description: 'Covers names of people, brands and organizations.',
    options: [
      'Names of people, companies, products, works, and organizations are used for identification and historical description only. Trademarks are the property of their respective owners.',
      'All trademarks, product names, and company names mentioned belong to their respective owners and are used here for identification only.',
      'Any names of people, brands, works, or organizations appear for identification and descriptive purposes only. All trademarks remain the property of their owners.',
      'Trademarked names appear throughout this book for editorial and identification purposes only, with no intention of infringement. They remain the property of their respective owners.',
      'Brand names, titles, and trademarks referred to in this book are the property of their owners. Their use does not imply any affiliation with or endorsement by them.',
    ],
  },
  {
    key: 'licenseHeading',
    label: 'License heading',
    description: 'Heading above the ebook license.',
    options: [
      'EBOOK LICENSE',
      'LICENSE NOTES',
      'YOUR LICENSE',
      'TERMS OF USE',
      'A NOTE TO READERS',
    ],
  },
  {
    key: 'license',
    label: 'Ebook license',
    description: 'How the buyer may use their copy.',
    options: [
      'This ebook is licensed for your personal use only. It may not be resold or given away. If you would like to share this book with another person, please purchase an additional copy for each recipient.',
      'This ebook is licensed for the personal enjoyment of the purchaser only. It may not be resold or transferred. To share it, please buy an additional copy for each person.',
      'Thank you for buying an authorized copy of this ebook. It is for your personal use only and may not be resold, copied, or given away. Please purchase a separate copy for anyone you would like to share it with.',
      'Your purchase grants a personal, non-transferable license to read this ebook. Reselling or redistributing it is not permitted; each reader needs their own copy.',
      'Thank you for respecting the work that went into this book. Your copy is for your own reading; please do not resell or share it, and point friends to where they can buy their own.',
    ],
  },
  {
    key: 'edition',
    label: 'Edition',
    description: 'Shown near the end of the page.',
    options: [
      'First Digital Edition',
      'First Ebook Edition',
      'First Edition',
      'Digital Edition',
      'First Published Edition',
    ],
  },
  {
    key: 'publishedBy',
    label: 'Published-by line',
    description: 'The last line of the page.',
    options: [
      'Published {year} by {publisher}',
      'Published in {year} by {publisher}',
      '{publisher}, {year}',
      'Publisher: {publisher}',
      'This edition published {year} by {publisher}',
    ],
  },
] as const;

export type CopyrightSectionKey = (typeof COPYRIGHT_SECTIONS)[number]['key'];

/**
 * A section's choice: an option number (0-based) or the account's own text.
 * Missing means the option this account's ID selects.
 */
export type CopyrightWording = Partial<Record<CopyrightSectionKey, number | string>>;

/**
 * Per-account copyright details, saved on the user. Every field is optional:
 * blanks fall back to the book's author and the account's own wording.
 */
export interface CopyrightSettings {
  /** Who owns the rights, e.g. "Jane Doe" or "Northgate Press LLC" */
  holder?: string;
  /** Imprint shown in the "Published by" line */
  publisher?: string;
  contactEmail?: string;
  website?: string;
  /** Legacy free-text edition; now stored as custom `wording.edition` */
  edition?: string;
  /** Extra paragraph added after the standard notices */
  customNotice?: string;
  wording?: CopyrightWording;
}

export const COPYRIGHT_LIMITS = {
  holder: 120,
  publisher: 120,
  contactEmail: 254,
  website: 200,
  edition: 80,
  customNotice: 1500,
} as const;

/** Longest custom text for one wording section */
export const MAX_CUSTOM_WORDING = 800;

const TEXT_FIELDS = [
  'holder',
  'publisher',
  'contactEmail',
  'website',
  'customNotice',
] as const;

const sectionByKey = new Map<string, (typeof COPYRIGHT_SECTIONS)[number]>(
  COPYRIGHT_SECTIONS.map((s) => [s.key, s]),
);

/** The option an account gets for a section when it hasn't chosen one */
export function defaultOptionIndex(seed: string, key: CopyrightSectionKey): number {
  const section = sectionByKey.get(key)!;
  return seedFromString(`${seed}::copyright::${key}`) % section.options.length;
}

export function defaultWording(seed: string): Record<CopyrightSectionKey, number> {
  return Object.fromEntries(
    COPYRIGHT_SECTIONS.map((s) => [s.key, defaultOptionIndex(seed, s.key)]),
  ) as Record<CopyrightSectionKey, number>;
}

/**
 * Trims text, drops blank fields and unknown or out-of-range wording
 * choices so stored settings stay tidy
 */
export function normalizeCopyrightSettings(
  settings: CopyrightSettings | null | undefined,
): CopyrightSettings {
  const result: CopyrightSettings = {};
  for (const key of TEXT_FIELDS) {
    const value = settings?.[key];
    if (typeof value === 'string' && value.trim()) {
      result[key] = value.trim().slice(0, COPYRIGHT_LIMITS[key]);
    }
  }

  const wording: CopyrightWording = {};
  for (const [key, choice] of Object.entries(settings?.wording ?? {})) {
    const section = sectionByKey.get(key);
    if (!section) continue;
    if (
      typeof choice === 'number' &&
      Number.isInteger(choice) &&
      choice >= 0 &&
      choice < section.options.length
    ) {
      wording[section.key] = choice;
    } else if (typeof choice === 'string' && choice.trim()) {
      wording[section.key] = choice.trim().slice(0, MAX_CUSTOM_WORDING);
    }
  }

  // Older accounts saved the edition as its own field
  const legacyEdition = settings?.edition?.trim();
  if (legacyEdition && wording.edition === undefined) {
    wording.edition = legacyEdition.slice(0, COPYRIGHT_LIMITS.edition);
  }

  if (Object.keys(wording).length) result.wording = wording;
  return result;
}

/**
 * The copyright page for one book. `seed` is the account ID: it fixes the
 * wording of any section the account hasn't chosen, so untouched accounts
 * still get a page no other account has.
 */
export function buildCopyrightPage(options: {
  seed: string;
  author: string;
  subject: string;
  year: number;
  settings?: CopyrightSettings | null;
}): string {
  const { seed, author, subject, year } = options;
  const settings = normalizeCopyrightSettings(options.settings);

  const holder = settings.holder || author;
  const values: Record<string, string> = {
    subject,
    year: String(year),
    holder,
    publisher: settings.publisher || holder,
    contact: [settings.contactEmail, settings.website].filter(Boolean).join(' · '),
  };

  const text = (key: CopyrightSectionKey) => {
    const choice = settings.wording?.[key];
    const template =
      typeof choice === 'string'
        ? choice
        : sectionByKey.get(key)!.options[choice ?? defaultOptionIndex(seed, key)];
    return template.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  };

  const blocks = [
    `Copyright © ${year} ${holder}\n${text('rights')}`,
    text('reproduction'),
    text(values.contact ? 'contact' : 'noContact'),
    text('independenceHeading'),
    text('independence'),
    text('sourcesHeading'),
    text('sources'),
    text('trademarks'),
    text('licenseHeading'),
    text('license'),
  ];

  if (settings.customNotice) {
    blocks.push(settings.customNotice);
  }

  blocks.push(`${text('edition')}\n${text('publishedBy')}`);

  return blocks.join('\n\n');
}
