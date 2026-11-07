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
      /** The hero's playable turn: the words on the sheet and the controls around it. */
      sheet: z.object({
        turnLabel: z.string(),
        steps: z.array(z.string()).length(4), // read → finish → fold → start the next line
        theirs: z.string(), // what the last player left you (muted)
        mine: z.string(), // how you finish it — this half folds away
        next: z.string(), // written after the fold, on the visible half, for the next player
        foldLabel: z.string(),
        replayLabel: z.string(),
        passOn: z.string(), // shown once the turn is done
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
    /** The button drawn on the phone in the visual (the app's label after you fold: "Send"). */
    screenButton: z.string().optional(),
    /** Phone animation of step 1, after "Send": the app's waiting screen — title, whose turn it is
        now, and that player's avatar (a file name in src/assets/img/avatars/, without .png). */
    sent: z.object({ title: z.string(), nextTurn: z.string(), avatar: z.string() }).optional(),
    /** The finished story shown on the unfolded sheet. `join` = the start the previous player left (bold, as in the app). */
    finalStory: z.array(z.object({ join: z.string(), rest: z.string() })).optional(),
    /** Who signed it — sample names for the demo. */
    signers: z.array(z.string()).optional(),
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
