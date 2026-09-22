export interface FaqSource {
  label: string;
  url: string;
}

export interface FaqItem {
  question: string;
  answer: string;
  /**
   * Shown under the answer as a link the reader can follow. Only a statute, a
   * regulator, or a licensing authority belongs here — not an insurance blog.
   * An answer with no entry here is making no claim that needs one.
   */
  sources?: FaqSource[];
}

// IMPORTANT: this is the ONLY place FAQ copy lives. The visible accordion
// and the FAQPage JSON-LD schema both render from this array. Editing the
// text here updates both automatically — never hardcode FAQ copy directly
// into a page or into a separate schema block, or the two will drift and
// undermine the whole point of having structured data for AI answer engines.
//
// Every claim in here was gone through on 2026-09-11 and either given a source
// a reader can check or removed. What came out, and why:
//
//   - "that carrier will almost always require a current 4-point" — untrue of
//     a newer house, where no 4-point is asked for at all.
//   - "both are needed again each time you move to a new carrier" — untrue of
//     a wind mitigation, which OIR treats as valid for up to five years, and
//     it contradicted another answer in this same list.
//   - "commonly 25 to 30 years" — a number with no source behind it, which
//     also disagreed with the insurance page on the same site.
//   - "the insurance premium becomes part of the monthly payment your lender
//     uses to decide how much you can borrow" — a claim about mortgage
//     underwriting on a home inspection directory, from a blog.
//   - "the main reason a homeowner who shops for a better rate ends up hiring
//     an inspector again each time" — an assertion about why people do things
//     that nobody measured.
//
// No insurer is named anywhere in here. A directory that lists every licensed
// inspector in a county has no business singling one out.
export const faqItems: FaqItem[] = [
  {
    question:
      'My home insurance went up. Can I get a cheaper rate, and what inspections would I need?',
    answer:
      'Often you can, and it is worth asking. Call your agent and ask them to shop other carriers for the same house, and the carrier that quotes you will say what it needs. On an older house that commonly means a 4-point inspection. A wind mitigation is separate: it records the storm-resistance features your premium can be credited for. Both are performed by a licensed Florida home inspector. A 4-point generally has to be recent, so changing carrier often means a new one, while a wind mitigation form can be reused for up to five years.',
    sources: [
      { label: 'Fla. Stat. § 627.0629', url: 'https://flsenate.gov/Laws/Statutes/2025/627.0629' },
      { label: 'Florida OIR, wind mitigation', url: 'https://floir.gov/consumers/wind-mitigation-resources' },
    ],
  },
  {
    question: 'What is a 4-point inspection?',
    answer:
      "A 4-point inspection is a focused review of the four systems an insurer treats as highest risk: roof, electrical, plumbing, and HVAC. Carriers ask for one on older houses and each sets its own age threshold, so the same house can need one at one company and not at another. It decides whether a policy gets written at all rather than what it costs.",
  },
  {
    question: 'What is a wind mitigation inspection, and does it actually lower my premium?',
    answer:
      'A wind mitigation inspection records storm-resistance features such as roof shape, roof-to-wall attachment, and opening protection. Florida law requires a residential property rate filing to include credits for verified features of that kind, so the report is how a house gets credited for having them. It does not guarantee a lower rate, because the size of any credit is set in each carrier’s own filing, but without the report there is nothing on file showing the house qualifies.',
    sources: [
      { label: 'Fla. Stat. § 627.0629', url: 'https://flsenate.gov/Laws/Statutes/2025/627.0629' },
    ],
  },
  {
    question: 'My roof is more than 15 years old. Can an insurer refuse to cover the house?',
    answer:
      'Not on age alone, provided the roof passes an inspection. Florida law, section 627.7011, says an insurer may not refuse to write or renew a policy solely because of the age of a roof that is less than 15 years old. Once a roof reaches 15 years, the insurer must allow you to pay for a roof inspection before it can require a replacement as a condition of coverage, and if that inspection finds the roof has five or more years of useful life remaining, the insurer may not refuse to write or renew the policy solely because of the roof age. Subsection (5)(a) names a home inspector licensed under section 468.8314 as one of the professionals who may perform it.',
    sources: [
      { label: 'Fla. Stat. § 627.7011', url: 'https://flsenate.gov/Laws/Statutes/2025/627.7011' },
    ],
  },
  {
    question:
      'Do I need a wind mitigation or 4-point inspection if I already own my home, not just when buying one?',
    answer:
      'Yes. These are not only purchase-time inspections. Changing carrier is the common trigger, and an insurer may also ask for an updated report at renewal or after a policy review. It is why a homeowner who has not bought or sold a house in years can still end up needing an inspector.',
  },
  {
    question: 'How long is a wind mitigation inspection good for?',
    answer:
      'The Florida Office of Insurance Regulation states that a completed uniform mitigation verification form is valid for up to five years, provided nothing material about the structure has changed and nothing on the form turns out to be inaccurate. A carrier can still ask for a newer one, so confirm with your agent before assuming an older report still applies.',
    sources: [
      { label: 'Florida OIR, wind mitigation', url: 'https://floir.gov/consumers/wind-mitigation-resources' },
    ],
  },
  {
    question: 'How long is a 4-point inspection good for?',
    answer:
      'Much less time than a wind mitigation report. Carriers commonly want one completed within the last year, and some want it more recent than that, so moving to a new carrier often means paying for a fresh inspection rather than reusing an old one. This one varies by company more than most, so ask your agent what that specific carrier will accept before you book.',
  },
  {
    question: 'How do I know a home inspector is actually licensed in Florida?',
    answer:
      'Florida home inspectors are licensed by the Department of Business and Professional Regulation and issued a license number. You can check any inspector yourself in the DBPR licensing portal, by name or by license number, before booking anything. Every listing in this directory is built from that same record.',
    sources: [
      { label: 'DBPR, verify a licensee', url: 'https://www.myfloridalicense.com/wl11.asp?mode=0' },
    ],
  },
];

// Same sourcing rule as faqItems above: only a statute, a regulator, or a
// licensing authority earns a citation here. The FAR/BAR "AS IS" contract
// itself is a private industry form, not a statute, so nothing about its
// inspection-period LENGTH is cited as fact below — that number is negotiated
// between buyer and seller on each contract, not set by law. What IS cited
// (61-30, F.A.C.) is the state rule that actually defines a licensed
// inspector's scope of work.
export const purchaseFaqItems: FaqItem[] = [
  {
    question: 'What does a full home inspection actually cover?',
    answer:
      "Florida's Standards of Practice for licensed home inspectors, adopted in rules 61-30.801 through 61-30.811 of the Florida Administrative Code, define what a full inspection examines: the structure, the electrical system, the HVAC system, the roof covering, the plumbing system, interior and exterior components, and site conditions that affect the structure. It is a much wider scope than an insurance-driven inspection — the point is to tell you the condition of the house you are buying, not to qualify a policy.",
    sources: [
      { label: '61-30, F.A.C., Home Inspectors', url: 'https://flrules.org/gateway/ChapterHome.asp?Chapter=61-30' },
    ],
  },
  {
    question: "How is a full inspection different from a 4-point or wind mitigation?",
    answer:
      'A 4-point looks at four systems and answers one question: will an insurer write a policy on this house. A full inspection, covered by the same state Standards of Practice, looks at the whole structure to tell a buyer what condition it is actually in. Most buyers need a full inspection; a 4-point or wind mitigation only comes into it if you are also arranging insurance on an older home. Some licensed inspectors offer both at once — ask when you book.',
  },
  {
    question: 'How much time do I have to get the house inspected before I am locked in?',
    answer:
      "If you are buying under Florida's standard \"AS IS\" residential contract, the contract itself sets an inspection period, negotiated between you and the seller rather than fixed by state law. During that window you can have the house inspected at your own expense, and under the AS IS form you can typically cancel and get your deposit back for any reason before it ends. Once it ends, that right generally goes away, so book the inspection as soon as the contract is signed rather than waiting.",
  },
  {
    question: 'Can the same inspector do my full inspection and my insurance inspections?',
    answer:
      'Often, yes — many Florida home inspectors are licensed to perform all three, and doing them in one visit can save a trip. They are still separate reports for separate purposes: the full inspection is for you as the buyer, and a 4-point or wind mitigation is for your insurer. Ask when you book which ones you need. See insurance inspections for how to check that any inspector is DBPR-licensed before booking.',
  },
];
