---
status: planned
created: 2026-04-05
updated: 2026-04-05
priority: p1
planned-by: cursor-cloud-agent
---

## Goal

Create a complete build plan for a high-conviction product landing page for LUSIA Studio that is grounded in the real product, aligned with the existing design system, and intentionally designed for both desktop and mobile with equal importance.

## User Intent

The landing page must not be generic SaaS marketing. It should show that LUSIA Studio is a real educational operating system for tutoring centers and schools: onboarding centers, scheduling sessions, managing assignments and documents, generating content with AI, helping students with curriculum-aware chat, tracking grades, and exposing financial analytics. The page should also be designed around future recorded demonstrations so that the strongest product moments can be dropped in later as proof.

## Product Truth To Preserve

These are the core truths the landing page should reflect because they are clearly supported by the repository:

- LUSIA Studio is an educational SaaS platform for tutoring centers and schools, not just a single-purpose AI tutor.
- The product spans three role experiences: admin, teacher, and student.
- The strongest value is the combination of operations plus pedagogy plus AI in one system.
- The product already supports organization creation, enrollment, role onboarding, session scheduling, assignments, docs/artifacts, AI generation, student chat, grades, and analytics.
- The strongest proof moments are inside actual workflows, not abstract claims.
- The current public landing page is much narrower and more atmospheric than the product itself, so the new page should broaden the message and add product proof.

## Positioning Decisions To Lock Before UI Execution

The page can be designed now, but these decisions should be confirmed before writing final copy:

1. Primary buyer
   - Best current assumption: tutoring center owner or academic director.
   - Secondary users on page: teachers and students.
   - Reason: org creation, enrollment codes, admin analytics, and multi-role flows indicate an organization-first product.

2. Market scope
   - Best current assumption: Portugal-first.
   - Reason: pt-PT metadata, Portuguese UI copy, Portuguese curriculum tools, and Portuguese grades/CFS model.

3. Main product label
   - Strong option: "plataforma de operacao academica com IA".
   - Avoid narrower labels like "AI tutor" or "teacher CRM" because the codebase proves much more breadth.

4. Primary CTA model
   - Recommended: split CTA strategy.
   - CTA A: create center (`/create-center`)
   - CTA B: join with code (`/enroll`)
   - CTA C: login (`/login`) as low-emphasis utility
   - Avoid pushing every visitor into only `/signup`, because the product already distinguishes new centers from invited members.

5. Pricing / plan language
   - Do not hard-code pricing claims until product/business confirms them.
   - Trial language is safe only if the copy reflects the actual "trial" org state already present in onboarding logic.

## Landing Page Strategy

### Core narrative

The landing page should present LUSIA Studio as the system that lets a center run teaching, content, and student support in one place:

1. Capture attention with the category and outcome.
2. Show the product breadth without feeling bloated.
3. Prove the most differentiated flows with recorded demos.
4. Reassure buyers that the system works for both teams and students.
5. Make the next step obvious for each visitor type.

### What the page must communicate in the first screen

Within one hero viewport, a visitor should understand:

- Who it is for: centers, teachers, students.
- What it does: run teaching operations and AI-powered learning workflows.
- Why it is different: curriculum-aware AI plus operational tooling in one product.
- What to do next: create a center, join a center, or sign in.

### Conversion philosophy

This should behave like a modern SaaS page:

- One sharp promise per section.
- Repeated CTAs after major proof blocks.
- Rich product proof, not illustration-heavy filler.
- Mobile-first clarity and short scan paths.
- Real UI footage and screenshots wherever possible.

## Audience Framework

### Primary audience: center owner / academic director

Main jobs-to-be-done:

- Bring the center online quickly.
- Enroll teachers and students without friction.
- Schedule sessions reliably.
- Understand revenue, cost, and profit.
- Standardize the way the team creates and uses teaching materials.

What this audience needs to believe:

- The platform is operationally serious.
- The AI features save staff time instead of adding chaos.
- The system is designed for a real center, not a toy product.

### Secondary audience: teacher

Main jobs-to-be-done:

- Prepare content faster.
- Turn documents into useful learning assets.
- Assign work and follow up on submissions.
- Reuse curriculum structure instead of starting from scratch.

What this audience needs to believe:

- The product helps them teach better and faster.
- Content workflows feel polished.
- The platform respects teaching context, not just prompts.

### Secondary audience: student and family proxy

Main jobs-to-be-done:

- Know what to study and when.
- Track grades and final outcomes clearly.
- Ask for help in context.

What this audience needs to believe:

- The product is useful beyond admin tooling.
- AI help is contextual and curriculum-aware.
- Mobile usage is first-class, not degraded.

## Feature Prioritization For The Landing Page

### Tier 1: must be demonstrated prominently

1. Docs + AI content creation
   - Upload and process real materials.
   - Generate quizzes, worksheets, presentations, and notes.
   - Why this matters: highest novelty plus strongest visual proof.

2. Curriculum-aware student chat
   - Student asks for help and receives contextual support.
   - Why this matters: turns "AI" from claim into product behavior.

3. Calendar and session operations
   - Schedule, manage recurrence, and run center operations.
   - Why this matters: proves this is not just a content tool.

4. Analytics dashboard
   - Revenue, cost, and profit.
   - Why this matters: speaks directly to buyers and center ROI.

### Tier 2: should appear as proof/supporting sections

5. Assignments workflow
   - Attach up to 3 artifacts, publish work, review submissions.

6. Onboarding and enrollment
   - Create a center, join with enrollment code, role-specific setup.

7. Grades and CFS
   - Especially important if Portugal-first positioning remains.

### Tier 3: lightweight supporting proof

8. Materials and curriculum browser
9. Teacher/student profile customization
10. Mobile/native shell readiness

## Recommended Page Architecture

### Section 1: Hero

Purpose:
- Set category, audience, and differentiated promise immediately.

Content:
- Short eyebrow naming the category.
- Strong headline focused on running a center and improving learning with AI.
- Subhead explaining the operating-system angle.
- Primary CTA group:
  - "Criar centro"
  - "Entrar com codigo"
  - low-emphasis "Iniciar sessao"
- Hero media area with either:
  - a composite demo reel, or
  - one flagship video with supporting mini cards.

Desktop:
- Two-column layout.
- Left = copy and CTAs.
- Right = proof media or product montage.

Mobile:
- Stack copy first, then media.
- Keep CTA buttons full-width and high-contrast.
- Do not bury the second CTA behind a text link.

Best product proof for hero:
- Composite of calendar + docs generation + analytics.

### Section 2: Product breadth snapshot

Purpose:
- Show this is one unified platform, not disconnected tools.

Content:
- 4 to 6 outcome cards:
  - onboard your center
  - schedule and run sessions
  - create learning content with AI
  - assign work and follow progress
  - support students with AI chat
  - track grades and financial performance

Desktop:
- 3-column grid.

Mobile:
- Horizontal snap carousel or 2-up stacked grid.
- Each card must remain readable without hover.

### Section 3: "Why centers choose LUSIA"

Purpose:
- Translate feature sprawl into clear buyer outcomes.

Recommended outcome pillars:
- Operations in one place
- Teaching workflows accelerated with AI
- Student support that stays contextual
- Real business visibility for the center

Design:
- Use richer cards or a timeline band, not plain icon bullets.

### Section 4: Demo-first flagship block - AI docs workflow

Purpose:
- Lead with the most differentiated teacher workflow.

Story to show:
- Upload material.
- Pipeline processes document.
- Generate quiz, worksheet, note, or presentation.
- Continue editing inside the platform.

Required media later:
- 1 hero video for the whole flow.
- 2 supporting stills for states not fully visible in the reel.

Desktop:
- Left sticky copy, right tall media stack or interactive tabs.

Mobile:
- Use swipeable tabs or an accordion with a single active media panel.
- Never show more than one dense UI frame at once.

### Section 5: Operational control - calendar, assignments, enrollment

Purpose:
- Reassure the buyer that the product handles real center operations.

Recommended structure:
- Tab set or segmented cards:
  - schedule sessions
  - enroll teachers and students
  - assign work and track submissions

Why grouped:
- Together they show operational continuity from setup to daily execution.

### Section 6: Student experience

Purpose:
- Show that students receive direct product value, not only admin overhead.

Recommended content:
- Curriculum-aware chat.
- Student assignments view.
- Grades and CFS dashboard.

Important note:
- This section matters for trust even if the buyer is an admin.
- It proves adoption value on the learner side.

### Section 7: Financial analytics and business visibility

Purpose:
- Sell to decision-makers.

Content:
- Revenue, cost, profit.
- Teacher and student financial breakdowns.
- Session-type economics.

Design note:
- Use clean data storytelling.
- This section should feel calmer and more executive than the AI-heavy sections.

### Section 8: Mobile and desktop parity

Purpose:
- Make the "equal importance" requirement explicit.

Content:
- Short positioning statement: built for desktop workflows and mobile follow-through.
- Side-by-side proof:
  - desktop shells for heavy workflow
  - mobile-safe layouts for students and quick actions

Do not frame mobile as an afterthought.

### Section 9: Social proof / trust / proof of seriousness

Use when available:
- logos
- usage metrics
- team quotes
- student or teacher testimonials
- implementation or onboarding claims backed by evidence

If external proof is not ready, use internal proof instead:
- real product captures
- "how it works" sequence
- role-based capability matrix

### Section 10: FAQ and objection handling

Likely questions:
- Is this for tutoring centers, schools, or both?
- Can students use it on mobile?
- How does AI use our documents?
- Can teachers keep using their own materials?
- How do users join an existing center?
- Is this built for the Portuguese curriculum?

### Section 11: Final CTA

Recommended final CTA stack:
- Primary: create a center
- Secondary: join with enrollment code
- Utility: login

The final block should be simpler than the hero and focused on action.

## Demo Recording Plan

The page should be intentionally designed around future recorded product proof. Record real product flows instead of abstract motion graphics.

### Recommended video priority order

1. Docs workflow
   - Upload -> process -> generate -> edit

2. Student chat
   - Ask a curriculum-based question -> receive streamed answer

3. Calendar workflow
   - Create or update a session, including students and session type

4. Analytics dashboard
   - Navigate month views and show revenue/cost/profit

5. Assignment loop
   - Teacher creates assignment -> student opens/submits

6. Onboarding path
   - Create center or enroll with code

7. Grades / CFS
   - Show Portugal-specific grade management

### Asset rules for each demo

- Record real UI, not mocked scenes.
- Keep clips outcome-based, 20-45 seconds when possible.
- Start near the action; avoid long setup footage.
- Capture both desktop and mobile where the feature is meaningfully used in both.
- Export separate poster images from each video for fallback and mobile optimization.

### Media placement guidance

- One flagship demo above the fold or immediately below it.
- One large demo per major differentiator.
- Use stills only when motion adds little value.
- On mobile, default to poster image plus tap-to-play unless autoplay performance is excellent.

## Copy Strategy

### Messaging hierarchy

1. Category
   - educational operations platform with AI

2. Outcome
   - run the center, support teachers, help students learn

3. Proof
   - scheduling, content generation, student chat, grades, analytics

4. Action
   - create center, join center, login

### Tone

- Confident, product-led, specific
- Avoid inflated "AI changes everything" language
- Prefer workflow language over visionary abstraction
- Keep Portuguese copy natural and modern if the live landing remains pt-PT

### Copy rules

- Every section needs one concrete promise.
- Back each claim with a product surface, metric, or demo.
- Avoid generic claims like "save time" unless tied to a visible workflow.

## Visual and Design-System Guidance

### What to reuse from the product

- Brand background (`bg-brand-bg`)
- Brand navy (`text-brand-primary`)
- Accent blue (`bg-brand-accent`)
- Satoshi as primary sans
- Instrument Serif or `.font-lusia` for selective brand moments
- Rounded cards and buttons from existing UI primitives

### What to avoid

- Building the new page entirely around bespoke hex values again.
- Repeating the current `/landing` page's dark-only art direction if it disconnects from the actual product.
- Overusing hover-reliant interactions that do not translate to mobile.

### Recommended art direction

Use the product design system as the source of truth, then layer in richer marketing presentation:

- cream base
- deep navy typography
- electric blue accents
- selective editorial serif moments
- real product screenshots inside elevated frames

Optional:
- keep one darker cinematic band for the hero or one feature section, but make it feel intentionally connected to the product palette.

## Mobile and Desktop Requirements

Desktop and mobile are equal priority, so the page should not be designed desktop-first and "collapsed" later.

### Shared rules

- All core proof blocks must exist in both breakpoints.
- Every CTA must remain visible and tappable on smaller screens.
- No critical copy should rely on hover, cursor position, or large-screen comparison layouts.

### Desktop principles

- Use width to compare workflows and show product breadth.
- Support richer split-screen storytelling.
- Allow sticky media/copy combinations.

### Mobile principles

- Prioritize sequencing over simultaneity.
- Convert grids into carousels, accordions, or stacked cards.
- Keep spacing generous enough for touch.
- Consider a sticky bottom CTA after the hero.
- Ensure demo media does not cause layout shifts or impossible scroll fatigue.

### Section behavior checklist

- Hero CTAs: full-width stack on mobile, inline group on desktop.
- Demo sections: one active media panel on mobile, multi-panel comparison allowed on desktop.
- Feature cards: 1-up or 2-up on mobile, 3-up on desktop.
- Tables or dense comparisons: rewrite as cards on mobile.

## Information Architecture For Implementation

### Suggested route strategy

- Replace or rebuild `app/landing/page.tsx`.
- Keep metadata and structured data, but expand the copy and section architecture.
- If experimentation is expected, isolate sections into dedicated components under a marketing folder rather than a single large page file.

### Suggested component structure

- `components/marketing/LandingHero`
- `components/marketing/LandingOutcomeGrid`
- `components/marketing/LandingDemoSection`
- `components/marketing/LandingOperationsSection`
- `components/marketing/LandingStudentSection`
- `components/marketing/LandingAnalyticsSection`
- `components/marketing/LandingDeviceParitySection`
- `components/marketing/LandingFaq`
- `components/marketing/LandingFinalCta`

### Content model suggestion

Keep section copy and demo metadata in a typed content object so the page is easy to iterate on without hardcoding every string inline.

Possible shape:

- headline
- subheadline
- ctas[]
- sectionEyebrow
- sectionTitle
- sectionBody
- proofItems[]
- mediaItems[]

## Performance and Build Guidance

Use modern SaaS landing-page best practices:

- Lazy-load below-the-fold media.
- Use poster images for videos.
- Avoid oversized autoplay videos on mobile.
- Keep the first screen fast and legible.
- Reuse existing `Button` component and semantic color tokens.
- Use dynamic imports only where they improve performance, not for every marketing section.
- Keep media aspect ratios stable to prevent layout shift.

## SEO and Discovery Guidance

The current metadata is too broad for the full product story. When implementation starts:

- Rewrite title and description for the actual buyer and category.
- Expand structured data beyond generic website/org if testimonials, FAQ, or product data become available.
- Ensure hero copy includes tutoring centers, schools, AI, and the strongest operational keywords naturally.
- Preserve pt-PT metadata if Portugal remains the target market.

## Open Questions To Resolve Before Final Copy Lock

1. Is the primary market strictly Portugal or broader Lusophone education?
2. Is the hero buyer a center owner, school leader, or teacher?
3. Should the page speak to both tutoring centers and schools equally?
4. What proof assets already exist: logos, testimonials, usage numbers, customer quotes?
5. Should analytics be framed as finance, performance, or both?
6. Is presentation generation already production-ready enough to market prominently?
7. Do you want a more product-aligned cream landing or a darker cinematic brand expression?

## Recommended Execution Order

### Phase 1: strategy lock

- Confirm audience, market, and CTA priorities.
- Confirm tone and language.
- Rank which demos will be recorded first.

### Phase 2: content map

- Write section headlines, subheads, and proof bullets.
- Match each section to a real feature and a real media asset.
- Remove any section that cannot be defended by product truth.

### Phase 3: wireframes

- Build desktop and mobile wireframes in parallel.
- Review scroll rhythm, CTA density, and proof placement.

### Phase 4: implementation

- Create section components.
- Reuse design tokens and core UI primitives.
- Integrate placeholder media slots that can later receive recorded assets.

### Phase 5: proof pass

- Insert recorded demos.
- Tune poster frames and captions.
- Validate that each major claim has visible proof.

### Phase 6: polish

- Performance pass
- responsive QA
- metadata and SEO pass
- copy tightening

## Acceptance Criteria For The Future Landing Build

- A new visitor understands the product category and buyer within one hero viewport.
- The page clearly communicates the platform's operational plus AI breadth.
- The page includes dedicated proof for teachers, students, and center leadership.
- Desktop and mobile both feel intentionally designed.
- CTA paths reflect the real auth model (`/create-center`, `/enroll`, `/login`).
- The strongest claims are backed by real product demos.
- The visual language feels connected to the shipped product, not like a different company.
