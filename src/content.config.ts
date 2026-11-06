/**
 * Content collections — every word on the landing page lives in src/content/*.json.
 * The schemas below make the build fail if an entry is missing a field,
 * so editing copy (by hand or from a CMS later) can't silently break a section.
 */
import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

const cta = z.object({
  label: z.string(),
  href: z.string(),
});

/** Lists are sorted by `order`, so a CMS (or a person) can reorder without moving JSON around. */
const order = z.number().int().positive();

const sectionIntro = z.object({
  eyebrow: z.string(),
  title: z.string(),
  lead: z.string().optional(),
});

/** Page-level copy: meta, hero, section intros, final CTA, footer. */
const site = defineCollection({
  loader: file('src/content/site.json'),
  schema: z.object({
    name: z.string(),
    appUrl: z.url(),
    meta: z.object({
      title: z.string().max(70),
      description: z.string().max(170),
    }),
    hero: z.object({
      eyebrow: z.string(),
      title: z.string(),
      lead: z.string(),
      primaryCta: z.string(),
      secondaryCta: cta,
      specs: z.array(z.object({ value: z.string(), label: z.string() })),
      /** The words written on the hero's folding sheet. */
      sheet: z.object({
        theirs: z.string(), // the previous player's start (muted)
        mine: z.string(), // how you finished it (ink) — this half folds away
        next: z.string(), // the start you leave for the next player — stays visible
        caption: z.string(), // describes the animation for screen readers
        peekLabel: z.string(),
      }),
    }),
    story: sectionIntro,
    features: sectionIntro,
    howItWorks: sectionIntro,
    testimonials: sectionIntro,
    faq: sectionIntro,
    finalCta: z.object({
      title: z.string(),
      lead: z.string(),
      primaryCta: z.string(),
    }),
    footer: z.object({
      credit: z.string(),
      creditUrl: z.url(),
      links: z.array(cta),
    }),
  }),
});

/** "The paper game, reinvented" — one entry per scroll step. */
const story = defineCollection({
  loader: file('src/content/story.json'),
  schema: z.object({
    order,
    title: z.string(),
    body: z.string(),
    visual: z.enum(['paper', 'phone', 'sheet']),
  }),
});

const features = defineCollection({
  loader: file('src/content/features.json'),
  schema: z.object({
    order,
    title: z.string(),
    body: z.string(),
    tag: z.string(),
    visual: z.enum(['fold', 'signatures', 'code']),
  }),
});

const steps = defineCollection({
  loader: file('src/content/steps.json'),
  schema: z.object({
    order,
    title: z.string(),
    body: z.string(),
  }),
});

const faq = defineCollection({
  loader: file('src/content/faq.json'),
  schema: z.object({
    order,
    question: z.string(),
    answer: z.string(),
  }),
});

/** Real player quotes only. While this is empty, the section doesn't render. */
const testimonials = defineCollection({
  loader: file('src/content/testimonials.json'),
  schema: z.object({
    quote: z.string(),
    name: z.string(),
    context: z.string().optional(),
  }),
});

export const collections = { site, story, features, steps, faq, testimonials };
